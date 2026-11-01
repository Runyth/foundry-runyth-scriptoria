import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(
  new URL("../styles/runyth-scriptoria.css", import.meta.url),
  "utf8"
);

function luminance(hex) {
  const channels = hex.match(/[0-9a-f]{2}/gi).map((value) => parseInt(value, 16) / 255);
  const linear = channels.map((value) => value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4);
  return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
}

function contrast(foreground, background) {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test("dark window chrome is scoped to Runyth Scriptoria applications", () => {
  assert.match(css, /\.runyth-scriptoria-document-window \.window-header\s*\{/);
  assert.match(css, /--runyth-scriptoria-window-header-background:\s*#111318/);
  assert.doesNotMatch(css, /(?:^|\n)\s*\.window-header\s*\{/);
  assert.doesNotMatch(css, /#efe5cf|parchment/i);
});

test("inline code has explicit AA contrast and excludes fenced blocks", () => {
  assert.match(css, /\.runyth-scriptoria-rendered-content :not\(pre\) > code\s*\{/);
  assert.match(css, /--runyth-scriptoria-inline-code-color:\s*#f8fafc/);
  assert.match(css, /--runyth-scriptoria-inline-code-background:\s*#252a31/);
  assert.match(css, /--runyth-scriptoria-inline-code-selection-background:\s*#bfdbfe/);
  assert.ok(contrast("#f8fafc", "#252a31") >= 4.5);
  assert.doesNotMatch(css, /\.runyth-scriptoria-rendered-content\s+pre\s*>\s*code[^\{]*\{[^}]*color:/s);
});


test("player display controls remain scoped and high-contrast", () => {
  assert.match(
    css,
    /\.runyth-scriptoria-document-window \.window-header \.runyth-scriptoria-show-all-header\s*\{/
  );
  assert.match(css, /runyth-scriptoria-show-all-header:focus-visible/);
  assert.match(css, /color:\s*var\(--runyth-scriptoria-window-header-foreground, #f8fafc\)/);
  assert.doesNotMatch(css, /(?:^|\n)\s*\.window-header \.runyth-scriptoria-show-all-header\s*\{/);
});
