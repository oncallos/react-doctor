import { describe, expect, it } from "vite-plus/test";
import { runRule } from "../../../test-utils/run-rule.js";
import { effectNeedsCleanup } from "./effect-needs-cleanup.js";

describe("data-only observe methods", () => {
  it.each([
    "const recorder = { observe() {} };",
    "const recorder = { observe() { return; } };",
    "const recorder = { observe(event) { lastEvent = event; } };",
    "const record = (event) => { lastEvent = event; return; }; const recorder = { observe: record };",
  ])("does not invent a subscription for a lexical recorder: %s", (declaration) => {
    const result = runRule(
      effectNeedsCleanup,
      `import { useEffect } from 'react';
      let lastEvent; ${declaration}
      export const Screen = ({ event }) => {
        useEffect(() => { recorder.observe("opened"); }, [event]);
        return null;
      };`,
    );
    expect(result.parseErrors).toEqual([]);
    expect(result.diagnostics).toHaveLength(0);
  });

  it("retains a callback registration stored in a lexical binding", () => {
    const result = runRule(
      effectNeedsCleanup,
      `import { useEffect } from 'react';
      let listener;
      const recorder = { observe(callback) { listener = callback; } };
      export const Screen = ({ update }) => {
        useEffect(() => { recorder.observe(() => update()); }, [update]);
        return null;
      };`,
    );
    expect(result.parseErrors).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
  });

  it("does not shift callback arguments for an erased TypeScript this parameter", () => {
    const result = runRule(
      effectNeedsCleanup,
      `import { useEffect } from 'react';
      let listener;
      const recorder = { observe(this: unknown, callback: () => void, label: string): void { listener = callback; } };
      export const Screen = ({ update }) => {
        useEffect(() => { recorder.observe(() => update(), "opened"); }, [update]);
        return null;
      };`,
    );
    expect(result.parseErrors).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
  });

  it.each([
    [
      "import { invoke, register } from 'opaque'; const methodName = 'observe'; let record = event => { lastEvent = event; }; invoke(() => { record = register; }); const recorder = { [methodName]: record };",
      '"opened"',
    ],
    [
      "import { invoke, register } from 'opaque'; let record = event => { lastEvent = event; }; invoke(() => { record = register; }); const recorder = { observe: record };",
      '"opened"',
    ],
    [
      "const first = event => { lastEvent = event; }; const record = first; const recorder = { observe: record };",
      '"opened"',
    ],
    ["const recorder = { observe(event) { lastEvent = event; } };", "() => {}"],
    ["const recorder = { observe(event) { lastEvent = event; } };", "...callbacks"],
    ["const recorder = { observe(event) { lastEvent = event; } };", "/event/"],
    ["const recorder = { observe(event) { lastEvent = event; } };", "{}"],
    ["const recorder = { observe(event) { lastEvent = event; } };", "target"],
    ["const recorder = { observe(event) { globalEvent = event; } };", '"opened"'],
    ["const recorder = { get observe() { return register; } };", '"opened"'],
    ["const recorder = { async observe(event) { lastEvent = event; } };", '"opened"'],
    [
      "const original = { observe(event) { lastEvent = event; } }; const recorder = original;",
      '"opened"',
    ],
    [
      "const recorder = { observe() {}, arm() { this.observe = register; } }; recorder.arm();",
      '"opened"',
    ],
    ["export const recorder = { observe(event) { lastEvent = event; } };", '"opened"'],
    ["const recorder = { observe() {} }; eval('recorder.observe = register');", '"opened"'],
    ["const recorder = new ResizeObserver(() => {});", "target"],
    ["const recorder = new MutationObserver(() => {});", "target"],
    ["const recorder = new IntersectionObserver(() => {});", "target"],
    ["declare const recorder: { observe: (target: Element) => void };", "target"],
    [
      "const recorder = { observe(target): void { target.addEventListener('click', () => {}); } };",
      "target",
    ],
    ["const recorder = { observe(target) { register(target); } };", '"opened"'],
    ["const recorder = { observe(event) { lastEvent = event; } }; mutate(recorder);", '"opened"'],
    [
      "const recorder = { observe(event) { lastEvent = event; } }; recorder.observe = register;",
      '"opened"',
    ],
    ["const recorder = { observe(event = register()) { lastEvent = event; } };", ""],
    ["const recorder = { observe(event) { state.value = event; } };", '"opened"'],
  ])("retains registration or unresolved receiver diagnostics: %s", (declaration, argument) => {
    const result = runRule(
      effectNeedsCleanup,
      `import { useEffect } from 'react';
      let lastEvent; ${declaration}
      export const Screen = ({ target }) => {
        useEffect(() => { recorder.observe(${argument}); }, [target]);
        return null;
      };`,
    );
    expect(result.parseErrors).toEqual([]);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });
});
