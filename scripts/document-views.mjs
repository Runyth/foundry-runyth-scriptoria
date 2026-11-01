// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import {
  FLAG_SCOPE,
  MODULE_ID,
  READER_MODES,
  SETTINGS
} from "./constants.mjs";
import { isScriptoriaItem } from "./documents.mjs";
import { localize } from "./i18n.mjs";
import { notifyReaderError, openReader } from "./reader.mjs";

const enhancedWarningKeys = new Set();
const temporaryGrants = new WeakMap();

export function getReaderModeIds() {
  return Object.freeze(Object.values(READER_MODES));
}

export function isReaderMode(value) {
  return getReaderModeIds().includes(value);
}

export function normalizeReaderMode(value, fallback = READER_MODES.simpleReader) {
  return isReaderMode(value) ? value : fallback;
}

export function getDefaultSceneDocumentView() {
  try {
    return normalizeReaderMode(
      game.settings.get(MODULE_ID, SETTINGS.defaultSceneDocumentView)
    );
  } catch {
    return READER_MODES.simpleReader;
  }
}

export function getReaderModeDescriptors() {
  const enhanced = getEnhancedJournalIntegration();
  return Object.freeze([
    Object.freeze({
      id: READER_MODES.foundry,
      label: localize(
        "RUNYTH-SCRIPTORIA.ReaderModes.Foundry",
        "Standard Foundry document view"
      ),
      icon: "fa-solid fa-book",
      available: true
    }),
    Object.freeze({
      id: READER_MODES.enhancedJournal,
      label: enhanced.available
        ? localize(
          "RUNYTH-SCRIPTORIA.ReaderModes.EnhancedJournal",
          "Enhanced journal-module view"
        )
        : localize(
          "RUNYTH-SCRIPTORIA.ReaderModes.EnhancedJournalUnavailable",
          "Enhanced journal-module view (Unavailable)"
        ),
      icon: "fa-solid fa-book-open-reader",
      available: enhanced.available,
      integrationId: enhanced.moduleId ?? null
    }),
    Object.freeze({
      id: READER_MODES.simpleReader,
      label: localize(
        "RUNYTH-SCRIPTORIA.ReaderModes.SimpleReader",
        "Runyth Scriptoria simple reader"
      ),
      icon: "fa-solid fa-scroll",
      available: true
    })
  ]);
}

export function getReaderModeDescriptor(id) {
  return getReaderModeDescriptors().find((mode) => mode.id === id);
}

export function getEnhancedJournalIntegration() {
  const module = globalThis.game?.modules?.get?.("monks-enhanced-journal");
  if (!module?.active) {
    return Object.freeze({
      available: false,
      moduleId: "monks-enhanced-journal",
      reason: "inactive"
    });
  }

  const moduleApiOpen = module.api?.openJournalEntry;
  if (typeof moduleApiOpen === "function") {
    return Object.freeze({
      available: true,
      moduleId: module.id ?? "monks-enhanced-journal",
      source: "module-api",
      open: moduleApiOpen.bind(module.api)
    });
  }

  const compatibilityOpen = globalThis.game?.MonksEnhancedJournal?.openJournalEntry;
  if (typeof compatibilityOpen === "function") {
    return Object.freeze({
      available: true,
      moduleId: module.id ?? "monks-enhanced-journal",
      source: "compatibility-namespace",
      open: compatibilityOpen.bind(globalThis.game.MonksEnhancedJournal)
    });
  }

  return Object.freeze({
    available: false,
    moduleId: module.id ?? "monks-enhanced-journal",
    reason: "no-supported-open-function"
  });
}

export async function resolveDocumentViewContext(target, options = {}) {
  if (target?.runythScriptoriaContext) target = target.runythScriptoriaContext;

  const context = {
    item: options.item ?? target?.item ?? null,
    journal: options.journal ?? target?.journal ?? null,
    page: options.page ?? target?.page ?? null,
    note: options.note ?? target?.note ?? null,
    sourceItemUuid: options.sourceItemUuid ?? target?.sourceItemUuid ?? null,
    pageId: options.pageId ?? target?.pageId ?? null
  };

  let document = target?.document ?? target?.object ?? target;
  if (typeof document === "string") document = await resolveUuid(document);

  if (document?.documentName === "Note") context.note = document;
  else if (document?.documentName === "Item") context.item = document;
  else if (document?.documentName === "JournalEntry") context.journal = document;
  else if (document?.documentName === "JournalEntryPage") context.page = document;

  const noteDocument = context.note?.document ?? context.note;
  if (noteDocument?.documentName === "Note") {
    context.sourceItemUuid ??= noteDocument.getFlag?.(FLAG_SCOPE, "sourceItemUuid") ?? null;
    context.pageId ??= noteDocument.pageId ?? noteDocument.getFlag?.(FLAG_SCOPE, "pageId") ?? null;

    const journalUuid = noteDocument.getFlag?.(FLAG_SCOPE, "journalUuid");
    if (!context.journal && journalUuid) context.journal = await resolveUuid(journalUuid);
    if (!context.journal && noteDocument.entry) context.journal = noteDocument.entry;
    if (!context.journal && noteDocument.entryId) {
      context.journal = globalThis.game?.journal?.get?.(noteDocument.entryId) ?? null;
    }
  }

  if (context.page && !context.journal) context.journal = context.page.parent ?? null;
  if (context.journal && context.pageId && !context.page) {
    context.page = context.journal.pages?.get?.(context.pageId)
      ?? context.journal.pages?.contents?.find?.((page) => page.id === context.pageId)
      ?? null;
  }
  if (context.page && !context.pageId) context.pageId = context.page.id ?? null;

  context.sourceItemUuid ??= context.page?.getFlag?.(FLAG_SCOPE, "sourceItemUuid") ?? null;
  context.sourceItemUuid ??= context.journal?.getFlag?.(FLAG_SCOPE, "sourceItemUuid") ?? null;

  if (!context.item && context.sourceItemUuid) {
    const sourceItem = await resolveUuid(context.sourceItemUuid);
    if (sourceItem?.documentName === "Item") context.item = sourceItem;
  }
  if (context.item && !context.sourceItemUuid) context.sourceItemUuid = context.item.uuid ?? null;

  context.document = context.page ?? context.journal ?? context.item ?? null;
  context.documentUuid = context.document?.uuid ?? context.sourceItemUuid ?? null;
  context.title = context.item?.name
    ?? context.page?.name
    ?? context.journal?.name
    ?? localize("RUNYTH-SCRIPTORIA.Reader.Document", "Runyth Scriptoria document");

  return Object.freeze(context);
}

export async function openDocumentView(target, {
  mode = getDefaultSceneDocumentView(),
  pageId = null,
  temporaryRead = false,
  source = "scene",
  notifyFallback = true
} = {}) {
  const context = await resolveDocumentViewContext(target, { pageId });
  if (!context.document && !context.item) {
    throw new Error(localize(
      "RUNYTH-SCRIPTORIA.Errors.DocumentNotFound",
      "The Runyth Scriptoria document could not be resolved."
    ));
  }

  let resolvedMode = normalizeReaderMode(mode);
  if (resolvedMode === READER_MODES.enhancedJournal) {
    const integration = getEnhancedJournalIntegration();
    if (!integration.available) {
      warnEnhancedFallback(integration, notifyFallback);
      resolvedMode = READER_MODES.foundry;
    }
  }

  if (resolvedMode === READER_MODES.simpleReader) {
    return openReader(context, {
      temporaryRead,
      pageId: context.pageId,
      viewMode: READER_MODES.simpleReader,
      source
    });
  }

  if (resolvedMode === READER_MODES.enhancedJournal) {
    const opened = await openEnhancedJournalView(context, {
      temporaryRead
    });
    if (opened) return opened;

    warnEnhancedFallback({ reason: "open-rejected" }, notifyFallback);
    resolvedMode = READER_MODES.foundry;
  }

  return openFoundryDocumentView(context, {
    temporaryRead,
    source,
    fallbackToSimple: true
  });
}

export async function openFoundryDocumentView(contextOrTarget, {
  temporaryRead = false,
  source = "scene",
  fallbackToSimple = false
} = {}) {
  const context = await resolveDocumentViewContext(contextOrTarget);
  let document = context.journal ?? context.page ?? context.item;

  // Showing an Item sheet to a player without ownership can expose unrelated
  // system fields. Use Runyth Scriptoria's player-safe reader unless a generated
  // Journal surface is available or the player already has normal access.
  if (
    temporaryRead
    && document?.documentName === "Item"
    && !canObserve(document)
  ) {
    return openReader(context, {
      temporaryRead: true,
      viewMode: READER_MODES.simpleReader,
      source
    });
  }

  if (!document?.sheet?.render) {
    if (fallbackToSimple) {
      return openReader(context, {
        temporaryRead,
        viewMode: READER_MODES.simpleReader,
        source
      });
    }
    throw new Error(localize(
      "RUNYTH-SCRIPTORIA.Errors.NoDocumentSheet",
      "No Foundry document sheet is available for this document."
    ));
  }

  const grant = temporaryRead ? applyTemporaryObserverGrant(document) : null;
  try {
    const renderOptions = {
      force: true,
      pageId: context.pageId ?? undefined,
      tempOwnership: temporaryRead
    };
    const application = await document.sheet.render(renderOptions);
    tagApplication(application ?? document.sheet, context, READER_MODES.foundry);
    if (grant) attachGrantRelease(application ?? document.sheet, grant);
    return application ?? document.sheet;
  } catch (error) {
    grant?.release();
    if (fallbackToSimple) {
      console.warn(`${MODULE_ID} | Foundry document view failed; opening the Runyth Scriptoria reader.`, error);
      return openReader(context, {
        temporaryRead,
        viewMode: READER_MODES.simpleReader,
        source
      });
    }
    throw error;
  }
}

export async function openEnhancedJournalView(contextOrTarget, {
  temporaryRead = false
} = {}) {
  const context = await resolveDocumentViewContext(contextOrTarget);
  const integration = getEnhancedJournalIntegration();
  if (!integration.available) return null;

  const journal = context.journal ?? context.page?.parent;
  if (!journal) return null;

  const options = {
    pageId: context.pageId ?? undefined,
    force: temporaryRead,
    tempOwnership: temporaryRead,
    newtab: false
  };

  try {
    const result = await integration.open(journal, options);
    if (result === false || result == null) return null;

    const application = result === true
      ? globalThis.game?.MonksEnhancedJournal?.journal
      : result;
    tagApplication(application, context, READER_MODES.enhancedJournal);
    return application ?? true;
  } catch (error) {
    console.warn(`${MODULE_ID} | Enhanced journal integration failed.`, error);
    return null;
  }
}

export function tagApplication(application, context, viewMode) {
  if (!application || typeof application !== "object") return application;
  try {
    application.runythScriptoriaContext = context;
    application.runythScriptoriaViewMode = normalizeReaderMode(viewMode);
  } catch {
    // Third-party applications may be sealed. Rendering hooks can still infer
    // the document context from their public document property.
  }
  return application;
}

export function inferApplicationViewMode(application) {
  if (isReaderMode(application?.runythScriptoriaViewMode)) {
    return application.runythScriptoriaViewMode;
  }
  const classes = new Set([
    ...(application?.options?.classes ?? []),
    ...(application?.classList ?? [])
  ]);
  if (
    classes.has("runyth-scriptoria-reader-window")
    || application?.element?.classList?.contains?.("runyth-scriptoria-reader-window")
  ) return READER_MODES.simpleReader;
  if (
    application?.constructor?.name === "EnhancedJournal"
    || application?.id === "MonksEnhancedJournal"
    || application?.element?.classList?.contains?.("monks-enhanced-journal")
  ) return READER_MODES.enhancedJournal;
  return READER_MODES.foundry;
}

function warnEnhancedFallback(integration, notify) {
  const key = integration?.reason ?? "unavailable";
  console.warn(
    `${MODULE_ID} | Enhanced journal view is unavailable (${key}); falling back to Foundry's standard document view.`
  );
  if (!notify || !globalThis.game?.user?.isGM || enhancedWarningKeys.has(key)) return;

  enhancedWarningKeys.add(key);
  globalThis.ui?.notifications?.warn?.(localize(
    "RUNYTH-SCRIPTORIA.Notifications.EnhancedJournalUnavailable",
    "The enhanced journal integration is unavailable. Runyth Scriptoria opened the standard Foundry view instead."
  ));
}

function canObserve(document) {
  if (globalThis.game?.user?.isGM) return true;
  const observer = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? 2;
  return Boolean(document?.testUserPermission?.(globalThis.game?.user, observer));
}

function applyTemporaryObserverGrant(document) {
  const observer = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? 2;
  const userId = globalThis.game?.user?.id;
  if (!userId) return null;

  const documents = [document];
  if (document?.documentName === "JournalEntryPage" && document.parent) {
    documents.push(document.parent);
  }

  const restorations = [];
  for (const current of documents) {
    if (!current?.ownership || current.testUserPermission?.(game.user, observer)) continue;
    const hadValue = Object.hasOwn(current.ownership, userId);
    const previous = current.ownership[userId];
    current.ownership[userId] = observer;
    restorations.push(() => {
      if (hadValue) current.ownership[userId] = previous;
      else delete current.ownership[userId];
    });
  }

  if (!restorations.length) return null;
  const grant = {
    released: false,
    release() {
      if (this.released) return;
      this.released = true;
      for (const restore of restorations.reverse()) restore();
    }
  };
  temporaryGrants.set(document, grant);
  return grant;
}

function attachGrantRelease(application, grant) {
  if (!application || !grant) return;
  if (typeof application.addEventListener === "function") {
    application.addEventListener("close", () => grant.release(), { once: true });
    return;
  }
  // Legacy sheets do not expose EventTarget semantics consistently. Keep the
  // observer grant client-local and non-persistent rather than modifying the
  // world document. It disappears on reload and grants no update permissions.
}

async function resolveUuid(uuid) {
  if (!uuid) return null;
  const resolver = globalThis.foundry?.utils?.fromUuid ?? globalThis.fromUuid;
  if (typeof resolver === "function") return resolver(uuid);
  const syncResolver = globalThis.foundry?.utils?.fromUuidSync;
  return typeof syncResolver === "function" ? syncResolver(uuid) : null;
}

export function resetDocumentViewStateForTests() {
  enhancedWarningKeys.clear();
}
