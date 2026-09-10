/** Covers nested provider/model selectors through the real editor and selector components. */
import { ActivePresetSession } from "../../src/activation/session.js";
import type { LoadedPreset } from "../../src/types.js";
import { openEditor } from "../../src/ui/editor.js";
import type { Component, Focusable } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";

const models = [
  { id: "opus-first", provider: "anthropic", name: "First", reasoning: false },
  { id: "opus-5", provider: "anthropic", name: "Opus 5", reasoning: true },
  { id: "z-first", provider: "other", name: "First", reasoning: false },
  { id: "a-second", provider: "other", name: "Astra", reasoning: true },
];
const seed: LoadedPreset = {
  name: "draft",
  scope: "user",
  provider: "anthropic",
  model: "opus-5",
  thinkingLevel: "high",
};

type Mounted = Component & Focusable;

function focus(component: Component, count: number): void {
  for (let i = 0; i < count; i++) send(component, "\t");
}

async function harness(initial: LoadedPreset | null = seed) {
  const mounted: Mounted[] = [];
  const handle = { setHidden: vi.fn(), focus: vi.fn() };
  const onTest = vi.fn().mockResolvedValue({ ok: false });
  const custom = vi.fn(
    (
      factory: (
        tui: unknown,
        theme: unknown,
        keys: unknown,
        done: (value: unknown) => void,
      ) => Mounted,
      options?: { onHandle?(value: typeof handle): void },
    ) =>
      new Promise((resolve) => {
        const component = factory(
          { terminal: { rows: 24 }, requestRender: vi.fn() },
          {
            fg: (_color: string, text: string) => text,
            bold: (text: string) => text,
          },
          {},
          resolve,
        );

        component.focused = true;
        mounted.push(component);
        options?.onHandle?.(handle);
      }),
  );
  const ctx = {
    modelRegistry: {
      getAll: () => models,
      hasConfiguredAuth: (model: (typeof models)[number]) =>
        model.id !== "opus-first",
    },
    ui: { custom },
  };
  const result = openEditor(
    ctx as never,
    initial
      ? { mode: "edit", seed: initial, target: initial }
      : { mode: "new" },
    { session: new ActivePresetSession(), presets: [], onTest },
  );

  await Promise.resolve();

  const editor = componentAt(mounted, 0);

  return { editor, handle, onTest, custom, mounted, result };
}

async function restored(
  handle: { focus: ReturnType<typeof vi.fn> },
  count = 1,
): Promise<void> {
  await vi.waitFor(() => expect(handle.focus).toHaveBeenCalledTimes(count));
}

function send(component: Component, input: string): void {
  component.handleInput?.(input);
}

function text(component: Component): string {
  return component.render(160).join("\n");
}

function type(component: Component, value: string): void {
  for (const char of value) send(component, char);
}

describe("editor model selector", () => {
  it("opens distinct providers, selects first registry model, adjusts thinking and restores Provider", async () => {
    const test = await harness();

    focus(test.editor, 2);
    expect(text(test.editor)).toContain("Enter Search");
    send(test.editor, "\r");
    expect(test.handle.setHidden).toHaveBeenLastCalledWith(true);

    const selector = componentAt(test.mounted, 1);

    expect(text(selector)).toContain("→ anthropic");
    expect(text(selector).match(/anthropic/g)).toHaveLength(1);
    type(selector, "other");
    send(selector, "\r");
    await restored(test.handle);
    expect(text(test.editor)).toMatch(/▌ Provider\s+other/);
    expect(text(test.editor)).toMatch(/Model\s+z-first/);
    expect(text(test.editor)).toContain("● off");
    expect(test.mounted).toHaveLength(2);
  });

  it("restricts models to the provider, selects a no-key model and leaves provider unchanged", async () => {
    const test = await harness();

    focus(test.editor, 3);
    send(test.editor, "\r");

    const selector = componentAt(test.mounted, 1);

    expect(text(selector)).toContain("→ opus-5");
    expect(text(selector)).toContain("opus-first (no key)");
    expect(text(selector)).not.toContain("z-first");
    send(selector, "\u001b[A");
    send(selector, "\r");
    await restored(test.handle);
    expect(text(test.editor)).toMatch(/Provider\s+anthropic/);
    expect(text(test.editor)).toMatch(/▌ Model\s+opus-first \(no key\)/);
    expect(text(test.editor)).toContain("● off");
  });

  it.each([2, 3])(
    "preserves draft, thinking and diagnostics on cancellation and same-value confirmation at row %s",
    async (row) => {
      const test = await harness({ ...seed, name: "", thinkingLevel: "max" });

      send(test.editor, "\x13");
      await vi.waitFor(() =>
        expect(text(test.editor)).toContain("Name is required."),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      focus(test.editor, row);

      const before = text(test.editor);

      send(test.editor, "\r");
      send(componentAt(test.mounted, 1), "\r");
      await restored(test.handle);
      expect(text(test.editor)).toBe(before);
      send(test.editor, "\r");

      const child = componentAt(test.mounted, 2);

      type(child, "nothing");
      send(child, "\u001b[B");
      expect(text(test.editor)).toBe(before);
      send(child, "\u001b");
      await restored(test.handle, 2);
      expect(text(test.editor)).toBe(before);
      send(test.editor, "\r");
      expect(text(componentAt(test.mounted, 3))).not.toContain("nothing");
      send(componentAt(test.mounted, 3), "\u001b");
      await restored(test.handle, 3);
    },
  );

  it("preserves unknown stored values until confirmation", async () => {
    const test = await harness({ ...seed, model: "missing" });

    focus(test.editor, 3);

    const before = text(test.editor);

    send(test.editor, "\r");
    expect(text(componentAt(test.mounted, 1))).toContain("→ opus-first");
    send(componentAt(test.mounted, 1), "\u001b");
    await restored(test.handle);
    expect(text(test.editor)).toBe(before);
  });

  it.each([2, 3])(
    "clears the appropriate required diagnostics when selecting row %s",
    async (row) => {
      const test = await harness({
        ...seed,
        provider: row === 2 ? "" : "anthropic",
        model: "",
        name: "",
      });

      send(test.editor, "\x13");
      await vi.waitFor(() =>
        expect(text(test.editor)).toContain("Model is required."),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      focus(test.editor, row);
      send(test.editor, "\r");
      send(componentAt(test.mounted, 1), "\r");
      await restored(test.handle);
      expect(text(test.editor)).not.toContain("Model is required.");
      expect(text(test.editor)).not.toContain("Provider is required.");
      expect(text(test.editor)).toContain("Name is required.");
    },
  );

  it("blocks underlying shortcuts and resumes navigation after cancellation", async () => {
    const test = await harness();

    focus(test.editor, 2);

    const before = text(test.editor);

    send(test.editor, "\r");
    for (const key of ["\x13", "\x14", "\t", "\u001b[B", "\u001b"])
      send(test.editor, key);
    for (const key of ["\x13", "\x14", "\t"])
      send(componentAt(test.mounted, 1), key);
    expect(test.onTest).not.toHaveBeenCalled();
    expect(text(test.editor)).toBe(before);
    send(componentAt(test.mounted, 1), "\u001b");
    await restored(test.handle);
    expect(test.handle.setHidden).toHaveBeenLastCalledWith(false);
    send(test.editor, "\t");
    expect(text(test.editor)).toMatch(/▌ Model/);
    send(test.editor, "\u001b");
    await expect(test.result).resolves.toBeUndefined();
  });

  it("restores the form after selector failure and allows retry", async () => {
    const test = await harness();

    test.custom.mockRejectedValueOnce(new Error("Selector failed"));
    focus(test.editor, 2);
    send(test.editor, "\r");
    await restored(test.handle);
    await vi.waitFor(() =>
      expect(text(test.editor)).toContain("Selector failed"),
    );
    expect(test.handle.setHidden).toHaveBeenLastCalledWith(false);
    send(test.editor, "\r");
    expect(test.mounted).toHaveLength(2);
    send(componentAt(test.mounted, 1), "\u001b");
    await restored(test.handle, 2);
  });

  it("retains arrow cycling in a new preset and contextual shortcuts", async () => {
    const test = await harness(null);

    focus(test.editor, 2);
    send(test.editor, "\u001b[C");
    expect(text(test.editor)).toMatch(/Provider\s+other/);
    expect(text(test.editor)).toContain("←/→ Change");
    expect(text(test.editor)).toContain("^S Save");
    expect(text(test.editor)).toContain("^T Test");
    focus(test.editor, 1);
    send(test.editor, "\u001b[C");
    expect(text(test.editor)).toMatch(/Model\s+a-second/);
    expect(test.mounted).toHaveLength(1);
  });
});

function componentAt(mounted: Mounted[], index: number): Mounted {
  const component = mounted[index];

  if (!component) throw new Error(`Component ${index} was not mounted.`);

  return component;
}
