/** Covers selector ranking, keyboard selection, and bounded rendering. */
import {
  openModelSelector,
  rankModelSelectorItems,
  type ModelSelectorItem,
} from "../../src/ui/model-selector.js";
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  getKeybindings,
  KeybindingsManager,
  setKeybindings,
  TUI_KEYBINDINGS,
  visibleWidth,
  type Component,
  type Focusable,
} from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as Theme;
const items: ModelSelectorItem[] = [
  { id: "claude-5-opus", available: false },
  { id: "opus-5-thinking" },
  { id: "OPUS_5" },
  { id: "claude-opus-4.5" },
  { id: "opus-50" },
  { id: "internal", name: "Astra" },
];

function harness(
  options = { title: "Select model", current: "internal", items },
  rows = 24,
) {
  let component: (Component & Focusable) | undefined;
  const terminal = { rows };
  const requestRender = vi.fn();
  const ctx = {
    ui: {
      custom: (
        factory: (
          tui: unknown,
          theme: Theme,
          keys: unknown,
          done: (value: string | undefined) => void,
        ) => Component & Focusable,
      ) =>
        new Promise<string | undefined>((resolve) => {
          component = factory({ terminal, requestRender }, theme, {}, resolve);
          component.focused = true;
        }),
    },
  } as unknown as Parameters<typeof openModelSelector>[0];
  const result = openModelSelector(ctx, options);

  if (!component) throw new Error("Selector was not opened.");

  return { component, result, terminal, requestRender };
}

function type(component: Component, text: string): void {
  for (const char of text) component.handleInput?.(char);
}

describe("rankModelSelectorItems", () => {
  it("normalizes punctuation, case, whitespace and ranks exact and prefix before stable token matches", () => {
    expect(
      rankModelSelectorItems(items, "  OPUS   5 ").map((item) => item.id),
    ).toEqual([
      "OPUS_5",
      "opus-5-thinking",
      "opus-50",
      "claude-5-opus",
      "claude-opus-4.5",
    ]);
    expect(rankModelSelectorItems(items, "5 opus")).toHaveLength(5);
    expect(rankModelSelectorItems(items, "opus_5")).toEqual(
      rankModelSelectorItems(items, "opus 5"),
    );
  });

  it("searches display names, excludes annotations, and does not use fuzzy matching", () => {
    expect(rankModelSelectorItems(items, "astra")).toEqual([items[5]]);
    expect(rankModelSelectorItems(items, "no key")).toEqual([]);
    expect(rankModelSelectorItems(items, "ops")).toEqual([]);
    expect(rankModelSelectorItems(items, "fable 5")).toEqual([]);
  });

  it("preserves input order for empty and punctuation-only queries without mutating input", () => {
    expect(rankModelSelectorItems(items, " ")).toEqual(items);
    expect(rankModelSelectorItems(items, "---")).toEqual(items);
    expect(items[0]?.id).toBe("claude-5-opus");
  });
});

describe("openModelSelector", () => {
  it("starts focused with the current value and confirms only once", async () => {
    const { component, result } = harness();

    expect(component.focused).toBe(true);
    expect(component.render(80).join("\n")).toContain("→ internal");
    component.handleInput?.("\r");
    component.handleInput?.("\u001b");
    await expect(result).resolves.toBe("internal");
  });

  it("filters immediately, navigates both directions and edits with backspace", async () => {
    const { component, result, requestRender } = harness();

    type(component, "opus 5x");
    expect(component.render(80).join("\n")).toContain("No matching options.");
    component.handleInput?.("\u007f");
    expect(component.render(80).join("\n")).toContain("→ OPUS_5");
    component.handleInput?.("\u001b[B");
    component.handleInput?.("\u001b[A");
    component.handleInput?.("\r");
    await expect(result).resolves.toBe("OPUS_5");
    expect(requestRender).toHaveBeenCalled();
  });

  it("keeps arrows and confirmation working with remapped list bindings", async () => {
    const previous = getKeybindings();

    setKeybindings(
      new KeybindingsManager(TUI_KEYBINDINGS, {
        "tui.select.up": "ctrl+p",
        "tui.select.down": "ctrl+n",
      }),
    );

    try {
      const { component, result } = harness();

      component.handleInput?.("\u001b[B");
      expect(component.render(80).join("\n")).toContain("→ claude-5-opus");
      component.handleInput?.("\u001b[A");
      expect(component.render(80).join("\n")).toContain("→ internal");
      component.handleInput?.("\u001b[A");
      component.handleInput?.("\r");
      await expect(result).resolves.toBe("opus-50");
    } finally {
      setKeybindings(previous);
    }
  });

  it("clears query to current selection and discards search on reopening", async () => {
    const first = harness();

    type(first.component, "astra");
    for (let index = 0; index < 5; index++)
      first.component.handleInput?.("\u007f");
    expect(first.component.render(80).join("\n")).toContain("→ internal");
    type(first.component, "opus");
    first.component.handleInput?.("\u001b");
    await expect(first.result).resolves.toBeUndefined();

    const second = harness();

    expect(second.component.render(80).join("\n")).toContain("→ internal");
  });

  it.each([{ options: [] }, { options: items }])(
    "keeps no-match Enter inert and allows Escape",
    async ({ options }) => {
      const { component, result } = harness({
        title: "Select model",
        current: "missing",
        items: options,
      });
      const resolved = vi.fn();

      void result.then(resolved);
      type(component, "unmatched");
      component.handleInput?.("\r");
      await Promise.resolve();
      expect(resolved).not.toHaveBeenCalled();
      component.handleInput?.("\u001b");
      await expect(result).resolves.toBeUndefined();
    },
  );

  it("selects a no-key option and falls back to first for an unknown current value", async () => {
    const { component, result } = harness({
      title: "Select model",
      current: "unknown",
      items,
    });

    expect(component.render(80).join("\n")).toContain(
      "→ claude-5-opus (no key)",
    );
    component.handleInput?.("\r");
    await expect(result).resolves.toBe("claude-5-opus");
  });

  it("keeps a selection visible across hundreds of entries and terminal resizing", () => {
    const many = Array.from({ length: 400 }, (_, index) => ({
      id: `${index}-very-long-identifier-${"x".repeat(100)}`,
    }));
    const { component, terminal } = harness({
      title: "Select model",
      current: many[300]?.id ?? "",
      items: many,
    });

    for (const rows of [24, 12, 8, 5, 3]) {
      terminal.rows = rows;
      component.handleInput?.("\u001b[B");

      for (const width of [80, 20, 4, 1]) {
        const lines = component.render(width);

        expect(lines.length).toBeLessThanOrEqual(rows - 2);
        expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
        if (width >= 20)
          expect(lines.some((line) => line.includes("→ 30"))).toBe(true);
      }
    }
  });
});
