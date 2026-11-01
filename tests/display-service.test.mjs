import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPlayerSelectionContent,
  getEligiblePlayers,
  handleSocketMessage,
  resetDisplayServiceForTests,
  showToAllPlayers,
  showToSelectedPlayers,
  validateDisplayPayload
} from "../scripts/display-service.mjs";

class DialogV2Stub {
  static renderCount = 0;

  constructor(options) {
    this.options = options;
    this.listeners = new Map();
  }

  addEventListener(name, callback) {
    this.listeners.set(name, callback);
  }

  async render() {
    DialogV2Stub.renderCount += 1;
    return this;
  }
}

function configure({ currentUser = "gm" } = {}) {
  const emitted = [];
  const users = [
    { id: "gm", name: "GM", active: true, isGM: true },
    { id: "player-a", name: "Alice", active: true, isGM: false },
    { id: "player-b", name: "Bob", active: true, isGM: false },
    { id: "offline", name: "Offline", active: false, isGM: false }
  ];
  users.get = (id) => users.find((user) => user.id === id);
  const itemData = {
    typeId: "book",
    kind: "book",
    html: "<p>Player-safe</p>",
    author: ""
  };
  let updateCount = 0;
  const item = {
    id: "item-1",
    uuid: "Item.item-1",
    name: "Book",
    img: "modules/scriptoria/assets/book.svg",
    documentName: "Item",
    isOwner: false,
    getFlag: (scope, key) => scope === "scriptoria" && key === "document"
      ? itemData
      : undefined,
    testUserPermission: () => false,
    getRollData: () => ({}),
    update: async () => {
      updateCount += 1;
    }
  };

  globalThis.game = {
    user: users.get(currentUser),
    users,
    modules: new Map(),
    settings: {
      get: () => "simple-reader"
    },
    i18n: {
      localize: (key) => key
    },
    socket: {
      emit: (...args) => emitted.push(args)
    }
  };
  globalThis.ui = {
    notifications: {
      warn: () => undefined,
      error: () => undefined
    }
  };
  globalThis.foundry = {
    applications: {
      api: { DialogV2: DialogV2Stub },
      ux: {
        TextEditor: {
          implementation: {
            enrichHTML: async (html) => html
          }
        }
      }
    },
    utils: {
      randomID: () => "request-1",
      fromUuid: async (uuid) => uuid === item.uuid ? item : null
    }
  };
  globalThis.CONST = {
    DOCUMENT_OWNERSHIP_LEVELS: {
      OBSERVER: 2
    }
  };
  return {
    emitted,
    item,
    users,
    getUpdateCount: () => updateCount
  };
}

test.beforeEach(() => {
  DialogV2Stub.renderCount = 0;
  resetDisplayServiceForTests();
});

test("lists only connected non-GM players and leaves them unselected", () => {
  const { users } = configure();
  assert.deepEqual(getEligiblePlayers(users).map((user) => user.id), [
    "player-a",
    "player-b"
  ]);
  const html = buildPlayerSelectionContent(getEligiblePlayers(users));
  assert.match(html, /Alice/);
  assert.match(html, /Bob/);
  assert.doesNotMatch(html, /Offline/);
  assert.doesNotMatch(html, /checked/);
});

test("show to all sends one namespaced request to every connected player", async () => {
  const { emitted, item } = configure();
  const payload = await showToAllPlayers(item, { mode: "simple-reader" });
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0][0], "module.scriptoria");
  assert.deepEqual(payload.targetUserIds, ["player-a", "player-b"]);
  assert.equal(payload.documentUuid, item.uuid);
});

test("selected display excludes unselected and disconnected users", async () => {
  const { emitted, item } = configure();
  const payload = await showToSelectedPlayers(
    item,
    ["player-b", "offline", "invalid"],
    { mode: "foundry" }
  );
  assert.deepEqual(payload.targetUserIds, ["player-b"]);
  assert.equal(emitted.length, 1);
});

test("players cannot trigger broadcast actions", async () => {
  const { item } = configure({ currentUser: "player-a" });
  await assert.rejects(
    () => showToAllPlayers(item),
    /Game Master/
  );
});

test("receiving clients validate targets and deduplicate requests", async () => {
  configure({ currentUser: "player-a" });
  const payload = {
    protocol: 1,
    action: "display-document",
    requestId: "request-1",
    senderId: "gm",
    targetUserIds: ["player-a"],
    documentUuid: "Item.item-1",
    sourceItemUuid: "Item.item-1",
    journalUuid: null,
    pageId: null,
    mode: "simple-reader"
  };

  assert.equal(validateDisplayPayload(payload), true);
  assert.equal(await handleSocketMessage(payload), true);
  assert.equal(await handleSocketMessage(payload), false);
  assert.equal(DialogV2Stub.renderCount, 1);
});

test("rejects malformed reader modes, UUIDs, and non-target messages", async () => {
  configure({ currentUser: "player-a" });
  const malformed = {
    protocol: 1,
    action: "display-document",
    requestId: "request-2",
    senderId: "gm",
    targetUserIds: ["player-b"],
    documentUuid: "not a uuid",
    sourceItemUuid: null,
    journalUuid: null,
    pageId: null,
    mode: "unknown"
  };
  assert.equal(validateDisplayPayload(malformed), false);
  assert.equal(await handleSocketMessage(malformed), false);
});


test("empty or disconnected selections are handled without emitting", async () => {
  const { emitted, item } = configure();
  assert.equal(await showToSelectedPlayers(item, []), false);
  assert.equal(await showToSelectedPlayers(item, ["offline"]), false);
  assert.equal(emitted.length, 0);
});

test("display requests never update document ownership", async () => {
  const { item, getUpdateCount } = configure();
  await showToAllPlayers(item, { mode: "simple-reader" });
  assert.equal(getUpdateCount(), 0);
});

test("receiving clients reject a request attributed to a non-GM", async () => {
  const { users } = configure({ currentUser: "player-a" });
  users.push({ id: "impostor", name: "Impostor", active: true, isGM: false });

  const payload = {
    protocol: 1,
    action: "display-document",
    requestId: "request-impostor",
    senderId: "impostor",
    targetUserIds: ["player-a"],
    documentUuid: "Item.item-1",
    sourceItemUuid: "Item.item-1",
    journalUuid: null,
    pageId: null,
    mode: "simple-reader"
  };

  assert.equal(await handleSocketMessage(payload), false);
  assert.equal(DialogV2Stub.renderCount, 0);
});
