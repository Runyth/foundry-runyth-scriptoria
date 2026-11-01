import assert from "node:assert/strict";
import test from "node:test";

import {
  activateAndControlScriptoriaNote,
  bindScriptoriaNoteInteraction,
  canManageScriptoriaNote,
  clearScriptoriaNoteInteractions,
  getSceneNoteInteractionBindingCount,
  isScriptoriaSceneNote,
  unbindScriptoriaNoteInteraction
} from "../scripts/scene-notes.mjs";

function createNote({ isGM = true, permissions = true } = {}) {
  const listeners = new Map();
  let controlCalls = 0;
  const document = {
    documentName: "Note",
    id: "note-1",
    getFlag: (scope, key) => scope === "runyth-scriptoria" && key === "sourceItemUuid"
      ? "Item.source"
      : undefined
  };
  const note = {
    id: "note-1",
    document,
    on: (event, handler) => listeners.set(event, handler),
    off: (event, handler) => {
      if (listeners.get(event) === handler) listeners.delete(event);
    },
    can: (_user, action) => permissions
      && ["control", "drag", "update"].includes(action),
    control: () => {
      controlCalls += 1;
      return true;
    }
  };

  globalThis.game = {
    user: {
      isGM
    }
  };

  return {
    note,
    listeners,
    getControlCalls: () => controlCalls
  };
}

test.afterEach(() => {
  clearScriptoriaNoteInteractions();
  delete globalThis.game;
  delete globalThis.ui;
  delete globalThis.canvas;
});

test("identifies only Runyth Scriptoria Note placeables", () => {
  const { note } = createNote();
  assert.equal(isScriptoriaSceneNote(note), true);
  assert.equal(isScriptoriaSceneNote({
    documentName: "Note",
    getFlag: () => undefined
  }), false);
  assert.equal(isScriptoriaSceneNote({
    documentName: "Tile",
    getFlag: () => "Item.source"
  }), false);
});

test("uses core permission checks without elevating players", () => {
  const allowed = createNote({
    isGM: false,
    permissions: true
  }).note;
  assert.equal(canManageScriptoriaNote(allowed), true);

  const denied = createNote({
    isGM: false,
    permissions: false
  }).note;
  assert.equal(canManageScriptoriaNote(denied), false);
});

test("activates the native Notes control and controls the current Note", async () => {
  const { note, getControlCalls } = createNote();
  const activations = [];
  globalThis.ui = {
    controls: {
      activate: async (options) => activations.push(options)
    }
  };
  globalThis.canvas = {
    notes: {
      get: () => note
    }
  };

  assert.equal(await activateAndControlScriptoriaNote(note), true);
  assert.deepEqual(activations, [{
    control: "notes",
    tool: "select"
  }]);
  assert.equal(getControlCalls(), 1);
});

test("binds one pointer listener, does not cancel events, and avoids duplicates", async () => {
  const { note, listeners, getControlCalls } = createNote();
  globalThis.ui = {
    controls: {
      activate: async () => undefined
    }
  };
  globalThis.canvas = {
    notes: {
      get: () => note
    }
  };

  assert.equal(bindScriptoriaNoteInteraction(note), true);
  const firstHandler = listeners.get("pointertap");
  assert.equal(getSceneNoteInteractionBindingCount(), 1);

  assert.equal(bindScriptoriaNoteInteraction(note), true);
  const secondHandler = listeners.get("pointertap");
  assert.notEqual(firstHandler, secondHandler);
  assert.equal(getSceneNoteInteractionBindingCount(), 1);

  let prevented = false;
  let stopped = false;
  secondHandler({
    button: 0,
    detail: 1,
    preventDefault: () => {
      prevented = true;
    },
    stopPropagation: () => {
      stopped = true;
    }
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(prevented, false);
  assert.equal(stopped, false);
  assert.equal(getControlCalls(), 1);
  assert.equal(unbindScriptoriaNoteInteraction(note), true);
  assert.equal(listeners.has("pointertap"), false);
  assert.equal(getSceneNoteInteractionBindingCount(), 0);
});

test("player without edit permission retains native reading interaction only", async () => {
  const { note, listeners, getControlCalls } = createNote({
    isGM: false,
    permissions: false
  });
  let activations = 0;
  globalThis.ui = {
    controls: {
      activate: async () => {
        activations += 1;
      }
    }
  };
  globalThis.canvas = {
    notes: {
      get: () => note
    }
  };

  bindScriptoriaNoteInteraction(note);
  listeners.get("pointertap")({
    button: 0,
    detail: 1
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(activations, 0);
  assert.equal(getControlCalls(), 0);
});
