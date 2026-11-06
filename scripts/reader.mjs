// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { FLAG_SCOPE, MODULE_ID, READER_MODES } from "./constants.mjs";
import {
  canReadItem,
  getDocumentTypeId,
  getScriptoriaData,
  isScriptoriaItem,
  resolveItem
} from "./documents.mjs";
import { format, localize } from "./i18n.mjs";
import { escapeHtml } from "./markdown.mjs";
import { windowClasses } from "./ui-look.mjs";
import { getScriptoriaDialogClass } from "./scriptoria-dialog.mjs";
import {
  getScriptureTypeOrFallback,
  resolveScriptureTypeDescription,
  resolveScriptureTypeLabel
} from "./scripture-types.mjs";

const openReaders = new Map();

export async function openReader(itemOrContext, {
  temporaryRead = false,
  pageId = null,
  viewMode = READER_MODES.simpleReader,
  source = "direct"
} = {}) {
  const context = await resolveReaderContext(itemOrContext, { pageId });
  const item = context.item;

  if (!item && !context.journal && !context.page) {
    ui.notifications.warn(localize(
      "RUNYTH-SCRIPTORIA.Errors.DocumentNotFound",
      "The Runyth Scriptoria document could not be resolved."
    ));
    return null;
  }

  if (item && !isScriptoriaItem(item)) {
    ui.notifications.warn(localize(
      "RUNYTH-SCRIPTORIA.Errors.NotScriptoriaDocument",
      "This Item is not a Runyth Scriptoria document."
    ));
    return null;
  }

  if (!temporaryRead && !canReadContext(context)) {
    ui.notifications.warn(localize(
      "RUNYTH-SCRIPTORIA.Errors.NoReadPermission",
      "You do not have permission to read this document."
    ));
    return null;
  }

  const data = item
    ? getScriptoriaData(item)
    : getJournalScriptoriaData(context);
  const typeId = getDocumentTypeId(data)
    || context.page?.getFlag?.(FLAG_SCOPE, "typeId")
    || context.journal?.getFlag?.(FLAG_SCOPE, "typeId")
    || "book";
  const type = getScriptureTypeOrFallback(typeId);
  if (type.capabilities.reader !== true) {
    ui.notifications.warn(format("RUNYTH-SCRIPTORIA.Errors.TypeNotReadable", { typeId }, `Scripture type "${typeId}" is not eligible for the Runyth Scriptoria reader.`));
    return null;
  }

  const readerKey = context.documentUuid
    ?? item?.uuid
    ?? item?.id
    ?? context.page?.uuid
    ?? context.journal?.uuid;
  const existing = openReaders.get(readerKey);
  if (existing) {
    existing.bringToFront?.();
    existing.element?.focus?.();
    return existing;
  }

  const content = item
    ? await buildReaderContent(item, data, type, {
      secrets: !temporaryRead && Boolean(item.isOwner)
    })
    : await buildJournalReaderContent(context, type, {
      secrets: false
    });
  const dialog = new (getScriptoriaDialogClass())({
    window: {
      title: context.title ?? item?.name,
      icon: "fa-solid fa-book-open",
      resizable: true
    },
    classes: windowClasses([
      "runyth-scriptoria-document-window",
      "runyth-scriptoria-reader-window"
    ]),
    position: {
      width: 780,
      height: 720
    },
    content,
    buttons: [
      {
        action: "close",
        label: localize("RUNYTH-SCRIPTORIA.Actions.Close", "Close"),
        icon: "fa-solid fa-xmark",
        default: true
      }
    ]
  });

  dialog.runythScriptoriaContext = Object.freeze({
    ...context,
    item,
    source,
    temporaryRead
  });
  dialog.runythScriptoriaViewMode = viewMode;

  const release = () => {
    if (openReaders.get(readerKey) === dialog) openReaders.delete(readerKey);
  };
  dialog.addEventListener?.("close", release, { once: true });
  openReaders.set(readerKey, dialog);

  try {
    const rendered = await dialog.render({ force: true });
    return rendered ?? dialog;
  } catch (error) {
    release();
    throw error;
  }
}

export async function buildReaderContent(
  item,
  data = getScriptoriaData(item),
  type = null,
  { secrets = Boolean(item?.isOwner) } = {}
) {
  const typeId = getDocumentTypeId(data);
  const resolvedType = type ?? getScriptureTypeOrFallback(typeId);
  const textEditor = foundry.applications.ux.TextEditor?.implementation ?? globalThis.TextEditor;
  const html = await textEditor.enrichHTML(data.html ?? "", {
    async: true,
    documents: true,
    secrets,
    rollData: item.getRollData?.() ?? item.parent?.getRollData?.() ?? {}
  });
  const byline = data.author
    ? `<p class="runyth-scriptoria-byline">${escapeHtml(data.author)}</p>`
    : "";
  const unavailable = resolvedType.unavailable
    ? `<p class="runyth-scriptoria-type-unavailable"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(resolveScriptureTypeLabel(resolvedType))}</p>`
    : "";
  const description = resolveScriptureTypeDescription(resolvedType);
  const descriptionTitle = description
    ? ` title="${escapeHtml(description)}"`
    : "";
  const variant = String(resolvedType.variant ?? "document").replace(/[^a-z0-9-]/g, "");

  return `
    <article class="runyth-scriptoria-reader runyth-scriptoria-rendered-surface" data-runyth-scriptoria-type="${escapeHtml(typeId)}" data-runyth-scriptoria-variant="${escapeHtml(variant)}">
      <header class="runyth-scriptoria-reader__header">
        <img src="${escapeHtml(item.img || resolvedType.image)}" alt="">
        <div>
          <span class="runyth-scriptoria-reader__kind"${descriptionTitle}>
            <i class="${escapeHtml(resolvedType.icon)}"></i>
            ${escapeHtml(resolveScriptureTypeLabel(resolvedType))}
          </span>
          <h1>${escapeHtml(item.name)}</h1>
          ${byline}
          ${unavailable}
        </div>
      </header>
      <section class="runyth-scriptoria-reader__content runyth-scriptoria-rendered-content">
        ${html}
      </section>
    </article>
  `;
}

export async function buildJournalReaderContent(context, type = null, {
  secrets = false
} = {}) {
  const page = context.page
    ?? context.journal?.pages?.get?.(context.pageId)
    ?? context.journal?.pages?.contents?.[0]
    ?? null;
  const typeId = page?.getFlag?.(FLAG_SCOPE, "typeId")
    ?? context.journal?.getFlag?.(FLAG_SCOPE, "typeId")
    ?? "book";
  const resolvedType = type ?? getScriptureTypeOrFallback(typeId);
  const raw = page?.text?.content ?? "";
  const textEditor = foundry.applications.ux.TextEditor?.implementation ?? globalThis.TextEditor;
  const html = await textEditor.enrichHTML(raw, {
    async: true,
    documents: true,
    secrets,
    rollData: {}
  });

  return `
    <article class="runyth-scriptoria-reader runyth-scriptoria-rendered-surface" data-runyth-scriptoria-type="${escapeHtml(typeId)}">
      <header class="runyth-scriptoria-reader__header">
        <img src="${escapeHtml(resolvedType.image)}" alt="">
        <div>
          <span class="runyth-scriptoria-reader__kind">
            <i class="${escapeHtml(resolvedType.icon)}"></i>
            ${escapeHtml(resolveScriptureTypeLabel(resolvedType))}
          </span>
          <h1>${escapeHtml(context.title ?? page?.name ?? context.journal?.name ?? "Runyth Scriptoria")}</h1>
        </div>
      </header>
      <section class="runyth-scriptoria-reader__content runyth-scriptoria-rendered-content">
        ${html}
      </section>
    </article>
  `;
}

export function notifyReaderError(error) {
  console.error(`${MODULE_ID} | Unable to open reader.`, error);
  ui.notifications.error(error.message ?? localize(
    "RUNYTH-SCRIPTORIA.Notifications.FailedDisplay",
    "Unable to display the Runyth Scriptoria document."
  ));
}

export function getOpenReaderCount() {
  return openReaders.size;
}

async function resolveReaderContext(target, { pageId = null } = {}) {
  if (target?.runythScriptoriaContext) target = target.runythScriptoriaContext;
  const context = {
    item: target?.item ?? null,
    journal: target?.journal ?? null,
    page: target?.page ?? null,
    sourceItemUuid: target?.sourceItemUuid ?? null,
    pageId: pageId ?? target?.pageId ?? null,
    documentUuid: target?.documentUuid ?? null,
    title: target?.title ?? null
  };

  let document = target?.document ?? target;
  if (typeof document === "string") document = await resolveItem(document);
  if (document?.documentName === "Item") context.item = document;
  else if (document?.documentName === "JournalEntry") context.journal = document;
  else if (document?.documentName === "JournalEntryPage") context.page = document;

  if (context.page && !context.journal) context.journal = context.page.parent ?? null;
  if (!context.page && context.journal && context.pageId) {
    context.page = context.journal.pages?.get?.(context.pageId)
      ?? context.journal.pages?.contents?.find?.((candidate) => candidate.id === context.pageId)
      ?? null;
  }
  if (!context.page && context.journal) context.page = context.journal.pages?.contents?.[0] ?? null;
  context.pageId ??= context.page?.id ?? null;
  context.sourceItemUuid ??= context.page?.getFlag?.(FLAG_SCOPE, "sourceItemUuid") ?? null;
  context.sourceItemUuid ??= context.journal?.getFlag?.(FLAG_SCOPE, "sourceItemUuid") ?? null;

  if (!context.item && context.sourceItemUuid) {
    const candidate = await resolveItem(context.sourceItemUuid);
    if (candidate?.documentName === "Item") context.item = candidate;
  }

  context.documentUuid ??= context.page?.uuid
    ?? context.journal?.uuid
    ?? context.item?.uuid
    ?? context.sourceItemUuid;
  context.title ??= context.item?.name ?? context.page?.name ?? context.journal?.name;
  return context;
}

function getJournalScriptoriaData(context) {
  const typeId = context.page?.getFlag?.(FLAG_SCOPE, "typeId")
    ?? context.journal?.getFlag?.(FLAG_SCOPE, "typeId")
    ?? "book";
  return {
    typeId,
    kind: typeId,
    html: context.page?.text?.content ?? "",
    author: ""
  };
}

function canReadContext(context) {
  if (globalThis.game?.user?.isGM) return true;
  if (context.item) return canReadItem(context.item);
  const observer = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? 2;
  const document = context.page ?? context.journal;
  return Boolean(
    document?.testUserPermission?.(globalThis.game?.user, observer)
    || document?.parent?.testUserPermission?.(globalThis.game?.user, observer)
  );
}
