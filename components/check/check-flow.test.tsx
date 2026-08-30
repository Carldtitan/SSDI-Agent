import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CaseProvider } from "@/components/app/case-context";
import { CheckFlow } from "@/components/check/check-flow";

vi.mock("@/components/visual/orb", () => ({
  default: () => <div data-testid="voice-orb" />,
}));

describe("CheckFlow", () => {
  it("does not expose a synthetic case shortcut", () => {
    render(
      <CaseProvider>
        <CheckFlow />
      </CaseProvider>,
    );

    expect(
      screen.queryByRole("button", { name: /demo/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start voice check" }),
    ).toBeVisible();
  });

  it("reads back each answer before advancing", async () => {
    const user = userEvent.setup();
    render(
      <CaseProvider>
        <CheckFlow />
      </CaseProvider>,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Use one-question keyboard fallback",
      }),
    );
    await user.type(
      await screen.findByRole("textbox", {
        name: "Answer the current question",
      }),
      "fourteen eighty",
    );
    await user.click(
      screen.getByRole("button", { name: "Confirm this answer" }),
    );

    expect(
      screen.getByRole("heading", {
        name: /average work earnings of \$1,480 a month/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("fourteen eighty")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Yes, that is right" }),
    );

    expect(
      screen.getByRole("heading", {
        name: /definition of statutory blindness/i,
      }),
    ).toBeInTheDocument();
  });

  it("uses the requested spoken confirmation language for blindness", async () => {
    const user = userEvent.setup();
    render(
      <CaseProvider>
        <CheckFlow />
      </CaseProvider>,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Use one-question keyboard fallback",
      }),
    );
    await user.type(
      await screen.findByRole("textbox", {
        name: "Answer the current question",
      }),
      "zero",
    );
    await user.click(
      screen.getByRole("button", { name: "Confirm this answer" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Yes, that is right" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Answer the current question" }),
      "yes",
    );
    await user.click(
      screen.getByRole("button", { name: "Confirm this answer" }),
    );

    expect(
      screen.getByRole("heading", {
        name: "So I am going to put statutory blindness down as yes. Is that right?",
      }),
    ).toBeInTheDocument();
  });
});
