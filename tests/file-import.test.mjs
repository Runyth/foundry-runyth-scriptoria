// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import test from "node:test";

import {
  detectSourceFormat,
  MAX_IMPORT_FILE_SIZE,
  readDocumentFile
} from "../scripts/file-import.mjs";

test("detects supported document formats by extension", () => {
  assert.equal(detectSourceFormat({ name: "book.md", type: "" }), "markdown");
  assert.equal(detectSourceFormat({ name: "book.markdown", type: "" }), "markdown");
  assert.equal(detectSourceFormat({ name: "book.html", type: "" }), "html");
  assert.equal(detectSourceFormat({ name: "book.HTM", type: "" }), "html");
});

test("detects a supported document format by MIME type", () => {
  assert.equal(detectSourceFormat({ name: "download", type: "text/markdown" }), "markdown");
  assert.equal(detectSourceFormat({ name: "download", type: "text/html; charset=utf-8" }), "html");
});

test("reads a UTF-8 document and removes its byte-order mark", async () => {
  const imported = await readDocumentFile({
    name: "scripture.md",
    type: "text/markdown",
    size: 25,
    text: async () => "\uFEFF# First Scripture\n\nText"
  });

  assert.deepEqual(imported, {
    sourceFormat: "markdown",
    source: "# First Scripture\n\nText",
    fileName: "scripture.md"
  });
});

test("rejects unsupported, empty, binary, and oversized files", async () => {
  await assert.rejects(
    readDocumentFile({ name: "book.txt", size: 4, text: async () => "text" }),
    /Markdown.*HTML/
  );
  await assert.rejects(
    readDocumentFile({ name: "book.md", size: 0, text: async () => "  " }),
    /empty/
  );
  await assert.rejects(
    readDocumentFile({ name: "book.md", size: 5, text: async () => "a\u0000b" }),
    /plain-text/
  );
  await assert.rejects(
    readDocumentFile({ name: "book.html", size: MAX_IMPORT_FILE_SIZE + 1, text: async () => "<h1>x</h1>" }),
    /5 MiB/
  );
});
