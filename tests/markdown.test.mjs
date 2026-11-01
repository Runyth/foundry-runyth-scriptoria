// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import test from "node:test";

import {
  extractMarkdownTitle,
  removeFirstLevelOneHeading,
  renderMarkdown
} from "../scripts/markdown.mjs";

test("extracts the first ATX H1", () => {
  assert.equal(
    extractMarkdownTitle("## Preface\n\n# The **First** Book\n\nBody"),
    "The First Book"
  );
});

test("extracts a Setext H1", () => {
  assert.equal(
    extractMarkdownTitle("The Ash Chronicle\n=================\n\nBody"),
    "The Ash Chronicle"
  );
});

test("ignores headings inside fenced code", () => {
  assert.equal(
    extractMarkdownTitle("```md\n# Not the title\n```\n\n# Real Title"),
    "Real Title"
  );
});

test("removes only the first level-one heading", () => {
  const source = "# Main Title\n\n## Section\n\nText";
  assert.equal(removeFirstLevelOneHeading(source), "## Section\n\nText");
});

test("escapes raw HTML", () => {
  const html = renderMarkdown("<script>alert('x')</script>");
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test("rejects unsafe links", () => {
  const html = renderMarkdown("[unsafe](javascript:alert(1))");
  assert.doesNotMatch(html, /href=/);
  assert.match(html, /unsafe/);
});

test("renders headings, emphasis, lists, and tables", () => {
  const html = renderMarkdown(`
# Title

A **bold** statement.

- one
- two

| Name | Value |
| --- | ---: |
| Ash | 33 |
  `.trim());

  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  assert.match(html, /<table>/);
  assert.match(html, /text-align:right/);
});

test("preserves Foundry enrichment syntax", () => {
  const html = renderMarkdown("Read @UUID[JournalEntry.abc]{the journal} and roll [[1d20+5]].");
  assert.match(html, /@UUID\[JournalEntry\.abc\]\{the journal}/);
  assert.match(html, /\[\[1d20\+5]]/);
});

test("renders single- and multi-backtick inline code without affecting fenced blocks", () => {
  const html = renderMarkdown(`Normal text with \`inline code\`.\n\nA literal backtick: \`\` \`example\` \`\`.\n\n\`\`\`javascript\nconst value = game.settings.get("runyth-scriptoria", "setting");\n\`\`\``);

  assert.match(html, /<code>inline code<\/code>/);
  assert.match(html, /<code>`example`<\/code>/);
  assert.match(html, /<pre><code class="language-javascript">const value = game\.settings\.get/);
});
