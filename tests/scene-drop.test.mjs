// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSceneNoteData,
  noteSchemaSupportsLocked
} from "../scripts/scene-drop.mjs";

const baseInput = {
  item: {
    name: "Street Pamphlet",
    uuid: "Item.source",
    img: "modules/runyth-scriptoria/assets/pamphlet.svg"
  },
  journal: {
    id: "journal-1",
    uuid: "JournalEntry.journal-1"
  },
  page: {
    id: "page-1"
  },
  kind: {
    icon: "modules/runyth-scriptoria/assets/pamphlet.svg"
  },
  dropData: {
    x: 123.5,
    y: 456.25
  }
};

test.afterEach(() => {
  delete globalThis.CONFIG;
  delete globalThis.NoteDocument;
});

test("builds a native, globally readable Note with persistent coordinates", () => {
  const data = buildSceneNoteData(baseInput);

  assert.equal(data.entryId, "journal-1");
  assert.equal(data.pageId, "page-1");
  assert.equal(data.x, 123.5);
  assert.equal(data.y, 456.25);
  assert.equal(data.global, true);
  assert.equal(data.flags["runyth-scriptoria"].sourceItemUuid, "Item.source");
  assert.equal(data.flags["runyth-scriptoria"].journalUuid, "JournalEntry.journal-1");
  assert.equal(data.flags["runyth-scriptoria"].placementVersion, 2);
  assert.equal("locked" in data, false);
});

test("explicitly creates an unlocked Note when the configured schema supports locking", () => {
  globalThis.CONFIG = {
    Note: {
      documentClass: {
        schema: new Map([["locked", {}]])
      }
    }
  };

  const data = buildSceneNoteData(baseInput);
  assert.equal(noteSchemaSupportsLocked(), true);
  assert.equal(data.locked, false);
});

test("normalizes invalid drop coordinates without affecting valid boundary values", () => {
  const data = buildSceneNoteData({
    ...baseInput,
    dropData: {
      x: Number.NaN,
      y: -25
    }
  });

  assert.equal(data.x, 0);
  assert.equal(data.y, -25);
});
