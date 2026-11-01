import assert from "node:assert/strict";
import test from "node:test";

test("imports the complete module graph with Foundry lifecycle hooks stubbed", async () => {
  const onceHooks = [];
  globalThis.Hooks = {
    once: (name, callback) => onceHooks.push([name, callback]),
    on: () => undefined
  };

  await import("../scripts/main.mjs");

  assert.deepEqual(onceHooks.map(([name]) => name), ["init", "ready"]);
});
