import {
  MODULE_ID,
  READER_MODES,
  SOCKET_CHANNEL,
  SOCKET_PROTOCOL_VERSION
} from "./constants.mjs";
import {
  getDefaultSceneDocumentView,
  inferApplicationViewMode,
  isReaderMode,
  normalizeReaderMode,
  openDocumentView,
  resolveDocumentViewContext
} from "./document-views.mjs";
import { escapeHtml } from "./markdown.mjs";
import { format, localize } from "./i18n.mjs";

const DISPLAY_ACTION = "display-document";
const handledRequests = new Set();
const handledRequestOrder = [];
const MAX_HANDLED_REQUESTS = 200;
let socketRegistered = false;

export function registerDisplaySocket() {
  if (socketRegistered) return false;
  const socket = globalThis.game?.socket;
  if (!socket?.on) return false;

  socket.on(SOCKET_CHANNEL, handleSocketMessage);
  socketRegistered = true;
  return true;
}

export async function showToAllPlayers(target, options = {}) {
  assertGamemaster();
  const users = getEligiblePlayers();
  if (!users.length) {
    globalThis.ui?.notifications?.warn?.(localize(
      "RUNYTH-SCRIPTORIA.Notifications.NoConnectedPlayers",
      "No connected players are available."
    ));
    return false;
  }

  return sendDisplayRequest(target, {
    ...options,
    targetUserIds: users.map((user) => user.id)
  });
}

export async function showToSelectedPlayers(target, userIds, options = {}) {
  assertGamemaster();
  const eligible = new Map(getEligiblePlayers().map((user) => [user.id, user]));
  const selected = Array.from(new Set(userIds ?? []))
    .filter((id) => typeof id === "string" && eligible.has(id));

  if (!selected.length) {
    globalThis.ui?.notifications?.warn?.(localize(
      "RUNYTH-SCRIPTORIA.Notifications.NoPlayersSelected",
      "Select at least one connected player."
    ));
    return false;
  }

  return sendDisplayRequest(target, {
    ...options,
    targetUserIds: selected
  });
}

export async function showPlayerSelectionDialog(target, options = {}) {
  assertGamemaster();
  const users = getEligiblePlayers();
  if (!users.length) {
    globalThis.ui?.notifications?.warn?.(localize(
      "RUNYTH-SCRIPTORIA.Notifications.NoConnectedPlayers",
      "No connected players are available."
    ));
    return null;
  }

  const context = await resolveDocumentViewContext(target);
  const content = buildPlayerSelectionContent(users);
  const dialog = new foundry.applications.api.DialogV2({
    window: {
      title: format(
        "RUNYTH-SCRIPTORIA.PlayerSelection.Title",
        { name: context.title },
        `Show “${context.title}” to selected players`
      ),
      icon: "fa-solid fa-user-group"
    },
    classes: [
      "runyth-scriptoria-document-window",
      "runyth-scriptoria-player-selection-window"
    ],
    position: {
      width: 460,
      height: "auto"
    },
    content,
    actions: {
      selectAll: (_event, targetElement) => {
        targetElement.form?.querySelectorAll?.("input[name='runyth-scriptoria-player']")
          ?.forEach?.((input) => {
            if (!input.disabled) input.checked = true;
          });
      },
      clearSelection: (_event, targetElement) => {
        targetElement.form?.querySelectorAll?.("input[name='runyth-scriptoria-player']")
          ?.forEach?.((input) => {
            input.checked = false;
          });
      }
    },
    buttons: [
      {
        action: "show",
        label: localize("RUNYTH-SCRIPTORIA.Actions.Show", "Show"),
        icon: "fa-solid fa-display",
        default: true,
        callback: async (_event, button) => {
          const selected = Array.from(
            button.form?.querySelectorAll?.("input[name='runyth-scriptoria-player']:checked") ?? []
          ).map((input) => input.value);
          const sent = await showToSelectedPlayers(context, selected, options);
          return sent ? true : false;
        }
      },
      {
        action: "cancel",
        label: localize("RUNYTH-SCRIPTORIA.Actions.Cancel", "Cancel"),
        icon: "fa-solid fa-xmark"
      }
    ]
  });
  dialog.runythScriptoriaContext = context;
  return dialog.render({ force: true });
}

export function buildPlayerSelectionContent(users = getEligiblePlayers()) {
  const rows = users.map((user) => `
    <label class="runyth-scriptoria-player-selection__row">
      <input type="checkbox" name="runyth-scriptoria-player" value="${escapeHtml(user.id)}">
      <span class="runyth-scriptoria-player-selection__status" aria-label="${escapeHtml(localize("RUNYTH-SCRIPTORIA.PlayerSelection.Active", "Active"))}"></span>
      <span>${escapeHtml(user.name)}</span>
    </label>
  `).join("");

  return `
    <section class="runyth-scriptoria-player-selection">
      <div class="runyth-scriptoria-player-selection__toolbar">
        <button type="button" data-action="selectAll">
          <i class="fa-solid fa-check-double"></i>
          ${escapeHtml(localize("RUNYTH-SCRIPTORIA.Actions.SelectAll", "Select All"))}
        </button>
        <button type="button" data-action="clearSelection">
          <i class="fa-solid fa-eraser"></i>
          ${escapeHtml(localize("RUNYTH-SCRIPTORIA.Actions.ClearSelection", "Clear Selection"))}
        </button>
      </div>
      <div class="runyth-scriptoria-player-selection__list">
        ${rows}
      </div>
      <p class="notes">${escapeHtml(localize(
        "RUNYTH-SCRIPTORIA.PlayerSelection.Hint",
        "Only connected non-GM players are listed. No document ownership is changed."
      ))}</p>
    </section>
  `;
}

export async function sendDisplayRequest(target, {
  targetUserIds,
  mode = null,
  pageId = null,
  application = null
} = {}) {
  assertGamemaster();
  const context = await resolveDocumentViewContext(target, { pageId });
  const eligible = new Set(getEligiblePlayers().map((user) => user.id));
  const targets = Array.from(new Set(targetUserIds ?? []))
    .filter((id) => eligible.has(id));
  if (!targets.length) {
    globalThis.ui?.notifications?.warn?.(localize(
      "RUNYTH-SCRIPTORIA.Notifications.DisconnectedPlayers",
      "The selected players are no longer connected."
    ));
    return false;
  }

  const resolvedMode = normalizeReaderMode(
    mode
      ?? (application ? inferApplicationViewMode(application) : getDefaultSceneDocumentView())
  );
  const payload = Object.freeze({
    protocol: SOCKET_PROTOCOL_VERSION,
    action: DISPLAY_ACTION,
    requestId: createRequestId(),
    senderId: game.user.id,
    targetUserIds: targets,
    documentUuid: context.documentUuid,
    sourceItemUuid: context.sourceItemUuid ?? null,
    journalUuid: context.journal?.uuid ?? null,
    pageId: context.pageId ?? null,
    mode: resolvedMode
  });

  game.socket.emit(SOCKET_CHANNEL, payload);
  return payload;
}

export async function handleSocketMessage(payload) {
  try {
    if (!validateDisplayPayload(payload)) return false;
    if (!payload.targetUserIds.includes(game.user.id)) return false;
    if (handledRequests.has(payload.requestId)) return false;

    const sender = game.users?.get?.(payload.senderId)
      ?? game.users?.find?.((user) => user.id === payload.senderId);
    if (!sender?.isGM) {
      console.warn(`${MODULE_ID} | Rejected display request from a non-GM sender.`, payload.senderId);
      return false;
    }

    rememberHandledRequest(payload.requestId);
    const target = {
      document: await resolveUuid(payload.documentUuid),
      sourceItemUuid: payload.sourceItemUuid,
      journal: payload.journalUuid ? await resolveUuid(payload.journalUuid) : null,
      pageId: payload.pageId
    };
    if (!isSupportedDisplayTarget(target)) {
      console.warn(`${MODULE_ID} | Rejected unsupported display document.`, payload.documentUuid);
      return false;
    }

    await openDocumentView(target, {
      mode: payload.mode,
      pageId: payload.pageId,
      temporaryRead: true,
      source: "socket",
      notifyFallback: false
    });
    return true;
  } catch (error) {
    console.error(`${MODULE_ID} | Unable to process a player display request.`, error);
    globalThis.ui?.notifications?.error?.(localize(
      "RUNYTH-SCRIPTORIA.Notifications.FailedDisplay",
      "The Runyth Scriptoria document could not be displayed."
    ));
    return false;
  }
}

export function validateDisplayPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  if (payload.protocol !== SOCKET_PROTOCOL_VERSION) return false;
  if (payload.action !== DISPLAY_ACTION) return false;
  if (!isSafeIdentifier(payload.requestId) || !isSafeIdentifier(payload.senderId)) return false;
  if (!Array.isArray(payload.targetUserIds) || !payload.targetUserIds.every(isSafeIdentifier)) return false;
  if (!isReaderMode(payload.mode)) return false;
  if (!isDocumentUuid(payload.documentUuid)) return false;
  if (payload.sourceItemUuid != null && !isDocumentUuid(payload.sourceItemUuid)) return false;
  if (payload.journalUuid != null && !isDocumentUuid(payload.journalUuid)) return false;
  if (payload.pageId != null && !isSafeIdentifier(payload.pageId)) return false;
  return true;
}

export function getEligiblePlayers(users = globalThis.game?.users ?? []) {
  return Array.from(users)
    .filter((user) => user?.active && !user.isGM && user.id !== globalThis.game?.user?.id)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export function resetDisplayServiceForTests() {
  handledRequests.clear();
  handledRequestOrder.length = 0;
  socketRegistered = false;
}

function assertGamemaster() {
  if (!globalThis.game?.user?.isGM) {
    throw new Error(localize(
      "RUNYTH-SCRIPTORIA.Errors.GmOnlyBroadcast",
      "Only a Game Master can display documents to other players."
    ));
  }
}

function isSupportedDisplayTarget(target) {
  const document = target.document ?? target.journal;
  if (!document) return false;
  if (["Item", "JournalEntry", "JournalEntryPage"].includes(document.documentName)) return true;
  return Boolean(target.sourceItemUuid || target.journal);
}

function rememberHandledRequest(requestId) {
  handledRequests.add(requestId);
  handledRequestOrder.push(requestId);
  while (handledRequestOrder.length > MAX_HANDLED_REQUESTS) {
    handledRequests.delete(handledRequestOrder.shift());
  }
}

function createRequestId() {
  const randomId = globalThis.foundry?.utils?.randomID?.(24);
  if (randomId) return randomId;
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

function isSafeIdentifier(value) {
  return typeof value === "string"
    && value.length >= 1
    && value.length <= 128
    && /^[A-Za-z0-9_-]+$/.test(value);
}

function isDocumentUuid(value) {
  return typeof value === "string"
    && value.length >= 3
    && value.length <= 512
    && /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_-]+)+$/.test(value);
}

async function resolveUuid(uuid) {
  const resolver = globalThis.foundry?.utils?.fromUuid ?? globalThis.fromUuid;
  if (typeof resolver === "function") return resolver(uuid);
  const syncResolver = globalThis.foundry?.utils?.fromUuidSync;
  return typeof syncResolver === "function" ? syncResolver(uuid) : null;
}
