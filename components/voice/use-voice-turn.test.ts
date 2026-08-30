import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  GuavaSessionCallbacks,
  GuavaSessionConfig,
} from "@/lib/voice/guava-webrtc";

const guavaMock = vi.hoisted(() => ({
  callbacks: null as GuavaSessionCallbacks | null,
  close: vi.fn(),
  connect: vi.fn(),
  sendText: vi.fn(),
  setMuted: vi.fn(),
}));

vi.mock("@/lib/voice/guava-webrtc", () => ({
  GUAVA_APP_BASE_URL: "https://app.goguava.ai",
  createGuavaVoiceSession: (
    _config: GuavaSessionConfig,
    callbacks: GuavaSessionCallbacks,
  ) => {
    guavaMock.callbacks = callbacks;
    return {
      close: guavaMock.close,
      async connect() {
        guavaMock.connect();
        callbacks.onConnected?.({} as MediaStream);
      },
      isConnected: () => true,
      sendText(text: string) {
        guavaMock.sendText(text);
        // Guava streams the agent's spoken reply back over the chat channel.
        window.setTimeout(
          () =>
            callbacks.onAgentSpeech?.({
              id: "agent-1",
              role: "agent",
              text,
            }),
          0,
        );
      },
      setMuted: guavaMock.setMuted,
    };
  },
}));

import { useVoiceTurn } from "@/components/voice/use-voice-turn";

describe("Guava voice turns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    guavaMock.callbacks = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        json: async () => ({
          chatUrl: "wss://app.goguava.ai/webrtc-chat/",
          socketUrl: "wss://app.goguava.ai/webrtc/",
          webrtcCode: "grtc-test-code",
        }),
        ok: true,
      })),
    );
  });

  it("mints a Guava session and waits for the SSDI Agent question", async () => {
    const { result } = renderHook(() => useVoiceTurn("en-US"));

    await act(async () => result.current.activate());

    expect(fetch).toHaveBeenCalledWith("/api/voice/session", {
      cache: "no-store",
      method: "POST",
    });
    expect(guavaMock.connect).toHaveBeenCalled();
    expect(result.current.state).toBe("idle");
    expect(guavaMock.setMuted).toHaveBeenCalledWith(true);
  });

  it("speaks through Guava, then resolves the final Guava transcript", async () => {
    const { result } = renderHook(() => useVoiceTurn("en-US"));
    await act(async () => result.current.activate());

    let answer: Promise<string> | undefined;
    act(() => {
      answer = result.current.ask("What is your full legal name?");
    });

    await waitFor(() =>
      expect(guavaMock.sendText).toHaveBeenCalledWith(
        "What is your full legal name?",
      ),
    );
    await waitFor(() => expect(result.current.state).toBe("listening"));

    act(() => {
      guavaMock.callbacks?.onCallerSpeech?.({
        id: "caller-1",
        role: "caller",
        text: "Elena Rivera",
      });
    });
    act(() => result.current.finishAnswer());

    await expect(answer).resolves.toBe("Elena Rivera");
    expect(result.current.lastTranscript).toBe("Elena Rivera");
    expect(guavaMock.setMuted).toHaveBeenLastCalledWith(true);
  });

  it("mutes and unmutes the live Guava microphone when paused", async () => {
    const { result } = renderHook(() => useVoiceTurn());
    await act(async () => result.current.activate());

    let answer: Promise<string> | undefined;
    act(() => {
      answer = result.current.listen();
    });
    await waitFor(() => expect(result.current.state).toBe("listening"));

    act(() => result.current.pause());
    expect(result.current.state).toBe("paused");
    expect(guavaMock.setMuted).toHaveBeenLastCalledWith(true);

    act(() => result.current.resume());
    expect(result.current.state).toBe("listening");
    expect(guavaMock.setMuted).toHaveBeenLastCalledWith(false);

    act(() => {
      guavaMock.callbacks?.onCallerSpeech?.({
        id: "caller-2",
        role: "caller",
        text: "Continue",
      });
    });
    act(() => result.current.finishAnswer());
    await expect(answer).resolves.toBe("Continue");
  });
});
