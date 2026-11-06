// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const manifest = JSON.parse(
  await readFile(new URL("../module.json", import.meta.url), "utf8")
);

test("manifest identifies a Foundry v13 module", () => {
  assert.equal(manifest.id, "runyth-scriptoria");
  assert.equal(manifest.version, "1.9.3");
  assert.equal(manifest.compatibility.minimum, "13");
  assert.equal(manifest.compatibility.maximum, "13");
  assert.deepEqual(manifest.esmodules, ["scripts/main.mjs"]);
  assert.deepEqual(manifest.languages.map((language) => language.lang), ["en", "de"]);
});


test("ships extension documentation and TypeScript declarations", async () => {
  const { access } = await import("node:fs/promises");
  await access(new URL("../docs/EXTENSION_API.md", import.meta.url));
  await access(new URL("../types/runyth-scriptoria.d.ts", import.meta.url));
  assert.notEqual(manifest.version, "1.0.0");
});
