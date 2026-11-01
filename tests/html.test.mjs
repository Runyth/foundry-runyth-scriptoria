import assert from "node:assert/strict";
import test from "node:test";

import {
  extractHtmlBody,
  extractHtmlTitle,
  removeFirstHtmlHeading,
  sanitizeImportedHtml
} from "../scripts/html.mjs";

test("extracts an HTML H1 before the document title", () => {
  const source = "<!doctype html><html><head><title>Fallback</title></head><body><h1>The <em>Ash</em> Book</h1><p>Text</p></body></html>";
  assert.equal(extractHtmlTitle(source), "The Ash Book");
});

test("uses the HTML title when there is no H1", () => {
  assert.equal(
    extractHtmlTitle("<html><head><title>Velia Ledger</title></head><body><p>Text</p></body></html>"),
    "Velia Ledger"
  );
});

test("extracts the body and removes only its first H1", () => {
  const source = "<html><head><title>Title</title></head><body><h1>Title</h1><h2>Section</h2><p>Text</p></body></html>";
  assert.equal(extractHtmlBody(source), "<h1>Title</h1><h2>Section</h2><p>Text</p>");
  assert.equal(removeFirstHtmlHeading(source), "<h2>Section</h2><p>Text</p>");
});

test("removes active HTML and unsafe URLs", () => {
  const html = sanitizeImportedHtml(`
    <h2 onclick="alert(1)">Safe heading</h2>
    <script>alert(1)</script>
    <iframe src="https://example.com"></iframe>
    <a href="javascript:alert(1)" style="color:red">Unsafe</a>
    <a href="https://example.com">Safe</a>
    <img src="data:text/html,bad" srcset="https://example.com/a.png 2x" onerror="alert(1)">
  `);

  assert.match(html, /<h2>Safe heading<\/h2>/);
  assert.doesNotMatch(html, /script|iframe|onclick|onerror|style=|srcset=/i);
  assert.doesNotMatch(html, /javascript:|data:/i);
  assert.match(html, /href="https:\/\/example\.com"/);
});
