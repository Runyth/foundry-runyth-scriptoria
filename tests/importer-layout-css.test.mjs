import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../styles/scriptoria.css", import.meta.url), "utf8");

test("keeps importer content, footer, and resizable editor accessible", () => {
  assert.match(css, /\.scriptoria-importer-window\s*\{[^}]*max-height:\s*calc\(100vh - 2rem\)/s);
  assert.match(css, /\.scriptoria-importer-window\s*\{[^}]*min-width:\s*min\(32\.5rem, calc\(100vw - 2rem\)\)/s);
  assert.match(css, /\.scriptoria-importer-window \.form-footer\s*\{[^}]*flex:\s*0 0 auto/s);
  assert.match(css, /\.scriptoria-importer__source textarea\s*\{[^}]*resize:\s*vertical/s);
  assert.match(css, /\.scriptoria-importer__source textarea\s*\{[^}]*width:\s*100%/s);
});
