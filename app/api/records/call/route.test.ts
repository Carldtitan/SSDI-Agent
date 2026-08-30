import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/records/call/route";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("provider call route", () => {
  it("hands the call to the local agent shim with a normalized number", async () => {
    vi.stubEnv("SSDI_SHIM_TOKEN", "shim-test-token");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json(
        {
          status: "dialing",
          to: "+19165550188",
          provider: "Mercy General Hospital",
        },
        { status: 202 },
      ),
    );

    const response = await POST(
      request({
        consent: true,
        providerName: "Mercy General Hospital",
        providerPhone: "(916) 555-0188",
      }),
    );

    expect(response.status).toBe(202);
    expect(response.headers.get("Cache-Control")).toBe("no-store, max-age=0");
    await expect(response.json()).resolves.toEqual({
      status: "dialing",
      to: "+19165550188",
      provider: "Mercy General Hospital",
    });

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:8787/call");
    expect(
      (options.headers as Record<string, string>)["X-SSDI-Token"],
    ).toBe("shim-test-token");
    expect(JSON.parse(String(options.body))).toMatchObject({
      consent: true,
      providerName: "Mercy General Hospital",
      providerPhone: "+19165550188",
    });
  });

  it("uses SSDI_SHIM_URL and omits the token header when unset", async () => {
    vi.stubEnv("SSDI_SHIM_URL", "http://shim.internal:9999/call");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json({ status: "dialing" }, { status: 202 }),
      );

    const response = await POST(
      request({
        consent: true,
        providerName: "Mercy General Hospital",
        providerPhone: "(916) 555-0188",
      }),
    );

    expect(response.status).toBe(202);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://shim.internal:9999/call");
    expect(options.headers as Record<string, string>).not.toHaveProperty(
      "X-SSDI-Token",
    );
  });

  it("does not call without explicit consent", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await POST(
      request({
        consent: false,
        providerName: "Mercy General Hospital",
        providerPhone: "(916) 555-0188",
      }),
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a phone number that cannot be normalized", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await POST(
      request({
        consent: true,
        providerName: "Mercy General Hospital",
        providerPhone: "555-018",
      }),
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a friendly message when the shim is already on a call", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({ error: "a call is already in progress" }, { status: 409 }),
    );

    const response = await POST(
      request({
        consent: true,
        providerName: "Mercy General Hospital",
        providerPhone: "(916) 555-0188",
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "A call is already in progress. Try again once it ends.",
    });
  });

  it("reports unconfigured calling when the shim returns 503", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({ error: "not configured" }, { status: 503 }),
    );

    const response = await POST(
      request({
        consent: true,
        providerName: "Mercy General Hospital",
        providerPhone: "(916) 555-0188",
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Provider calling is not configured.",
    });
  });

  it("releases the rate-limit reservation when the shim is unreachable", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("connect ECONNREFUSED"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const caller = `test-${crypto.randomUUID()}`;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await POST(
        request(
          {
            consent: true,
            providerName: "Mercy General Hospital",
            providerPhone: "(916) 555-0188",
          },
          caller,
        ),
      );
      // Every attempt fails at the shim, never at the rate limiter, because a
      // failed call releases its reservation.
      expect(response.status).toBe(502);
    }
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("rate limits to three started calls per hour for one caller", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ status: "dialing" }, { status: 202 }),
    );
    const caller = `test-${crypto.randomUUID()}`;
    const body = {
      consent: true,
      providerName: "Mercy General Hospital",
      providerPhone: "(916) 555-0188",
    };

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const ok = await POST(request(body, caller));
      expect(ok.status).toBe(202);
    }

    const limited = await POST(request(body, caller));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Cache-Control")).toBe("no-store, max-age=0");
  });
});

function request(body: unknown, caller?: string) {
  return new Request("http://localhost/api/records/call", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": caller ?? `test-${crypto.randomUUID()}`,
    },
    body: JSON.stringify(body),
  });
}
