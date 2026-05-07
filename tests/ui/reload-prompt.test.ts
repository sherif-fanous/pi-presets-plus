/**
 * Tests for the commit-time reload confirmation helper.
 */
import {
  confirmReload,
  reloadAfterOverlayClose,
} from "../../src/ui/reload-prompt.js";
import type { Theme } from "@mariozechner/pi-coding-agent";
import type { Component, Focusable } from "@mariozechner/pi-tui";
import { afterEach, describe, expect, it, vi } from "vitest";

const theme = {
  bold: (text: string) => text,
  fg: (_name: string, text: string) => text,
} as Theme;

interface TestContext {
  readonly custom: ReturnType<typeof vi.fn>;
  readonly notify: ReturnType<typeof vi.fn>;
  readonly reload?: ReturnType<typeof vi.fn>;
}

function makeCtx(options: {
  readonly answer?: "yes" | "no";
  readonly reload?: ReturnType<typeof vi.fn>;
}): TestContext & Parameters<typeof confirmReload>[0] {
  const notify = vi.fn();
  const custom = vi.fn(
    (
      factory: (
        tui: unknown,
        theme: Theme,
        keybindings: unknown,
        done: (result: boolean) => void,
      ) => Component & Focusable,
    ) =>
      new Promise<boolean>((resolve) => {
        const component = factory({}, theme, {}, resolve);

        component.handleInput?.(options.answer === "yes" ? "y" : "n");
      }),
  );

  return {
    custom,
    notify,
    reload: options.reload,
    ui: { custom, notify },
  } as unknown as TestContext & Parameters<typeof confirmReload>[0];
}

afterEach(() => {
  vi.useRealTimers();
});

describe("confirmReload", () => {
  it("returns the user's reload choice without reloading immediately", async () => {
    const reload = vi.fn();
    const ctx = makeCtx({ answer: "yes", reload });

    await expect(confirmReload(ctx)).resolves.toBe(true);

    expect(ctx.custom).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();
  });

  it("skips the prompt when reload is unavailable", async () => {
    const ctx = makeCtx({ answer: "yes", reload: undefined });

    await expect(confirmReload(ctx)).resolves.toBe(false);

    expect(ctx.custom).not.toHaveBeenCalled();
    expect(ctx.notify).not.toHaveBeenCalled();
  });
});

describe("reloadAfterOverlayClose", () => {
  it("notifies and swallows reload failures after overlays can close", async () => {
    vi.useFakeTimers();

    const reload = vi.fn().mockRejectedValue(new Error("boom"));
    const ctx = makeCtx({ answer: "yes", reload });

    reloadAfterOverlayClose(ctx);
    expect(reload).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();

    expect(reload).toHaveBeenCalledOnce();
    expect(ctx.notify).toHaveBeenCalledWith(
      "Failed to reload Pi: boom.",
      "error",
    );
  });
});
