import {
  FLAG_SCOPE,
  MODULE_ID,
  SETTINGS
} from "./constants.mjs";
import {
  buildJournalOwnership,
  ensureJournalFolder,
  getDocumentTypeId,
  getScriptoriaData,
  isScriptoriaItem,
  wrapRenderedContent
} from "./documents.mjs";
import { escapeHtml } from "./markdown.mjs";
import { format, localize } from "./i18n.mjs";
import { activateAndControlScriptoriaNote } from "./scene-notes.mjs";
import {
  getScriptureTypeOrFallback,
  resolveScriptureTypeLabel
} from "./scripture-types.mjs";

export function registerSceneDropHook() {
  Hooks.on("dropCanvasData", (_canvas, data) => {
    if (!game.user?.isGM) return;
    if (!game.settings.get(MODULE_ID, SETTINGS.enableSceneDrop)) return;
    if (data.type !== "Item" || !data.uuid) return;

    const item = foundry.utils.fromUuidSync(data.uuid);
    if (!isScriptoriaItem(item)) return;

    const runythScriptoriaData = getScriptoriaData(item);
    const type = getScriptureTypeOrFallback(getDocumentTypeId(runythScriptoriaData));
    if (type.capabilities.scenePlacement !== true) {
      ui.notifications.warn(format("RUNYTH-SCRIPTORIA.Errors.TypeNotPlaceable", { typeId: type.id }, `Scripture type "${type.id}" cannot be placed on a Scene.`));
      return false;
    }

    void createSceneDocument(item, data).catch((error) => {
      console.error(`${MODULE_ID} | Unable to create Scene document.`, error);
      ui.notifications.error(error.message ?? localize("RUNYTH-SCRIPTORIA.Errors.PlaceOnScene", "Unable to place the Runyth Scriptoria document on the Scene."));
    });
    return false;
  });
}

export async function createSceneDocument(item, dropData) {
  const scene = canvas?.scene;
  if (!scene) throw new Error(localize("RUNYTH-SCRIPTORIA.Errors.NoActiveScene", "No active Scene is available."));

  const data = getScriptoriaData(item);
  const typeId = getDocumentTypeId(data);
  const type = getScriptureTypeOrFallback(typeId);
  if (type.capabilities.scenePlacement !== true) {
    throw new Error(format("RUNYTH-SCRIPTORIA.Errors.TypeNotPlaceable", { typeId }, `Scripture type "${typeId}" cannot be placed on a Scene.`));
  }

  const folder = await ensureJournalFolder();
  const format = CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1;
  const sourceItemUuid = item.uuid;

  const journal = await JournalEntry.implementation.create({
    name: item.name,
    folder: folder?.id ?? null,
    ownership: buildJournalOwnership(),
    flags: {
      [FLAG_SCOPE]: {
        sourceItemUuid,
        typeId,
        // Retained for older Runyth Scriptoria consumers.
        kind: typeId
      }
    },
    pages: [
      {
        name: item.name,
        type: "text",
        text: {
          format,
          content: buildJournalContent(item, data, type)
        },
        flags: {
          [FLAG_SCOPE]: {
            sourceItemUuid,
            typeId
          }
        }
      }
    ]
  }, {
    renderSheet: false
  });

  const page = journal.pages.contents[0];
  const noteData = buildSceneNoteData({
    item,
    journal,
    page,
    type,
    dropData
  });
  const [noteDocument] = await scene.createEmbeddedDocuments("Note", [noteData]);

  if (noteDocument) {
    await activateAndControlScriptoriaNote(noteDocument.object ?? noteDocument);
  }

  ui.notifications.info(format("RUNYTH-SCRIPTORIA.Notifications.SceneDocumentPlaced", { title: item.name }, `Placed manageable document: ${item.name}`));
  return {
    journal,
    note: noteDocument
  };
}

export function buildSceneNoteData({
  item,
  journal,
  page,
  type,
  kind,
  dropData
}) {
  const resolvedType = type ?? kind ?? getScriptureTypeOrFallback("book");
  const noteData = {
    entryId: journal.id,
    pageId: page?.id ?? null,
    x: finiteCoordinate(dropData.x),
    y: finiteCoordinate(dropData.y),
    iconSize: 80,
    global: true,
    text: item.name,
    texture: {
      src: item.img || resolvedType.image
    },
    flags: {
      [FLAG_SCOPE]: {
        sourceItemUuid: item.uuid,
        journalUuid: journal.uuid,
        typeId: resolvedType.id,
        placementVersion: 2
      }
    }
  };

  if (noteSchemaSupportsLocked()) noteData.locked = false;
  return noteData;
}

export function noteSchemaSupportsLocked(
  noteClass = globalThis.CONFIG?.Note?.documentClass
    ?? globalThis.NoteDocument?.implementation
) {
  const schema = noteClass?.schema;
  if (typeof schema?.has === "function") return schema.has("locked");
  return Boolean(schema?.fields?.locked);
}

export function buildJournalContent(item, data, type = null) {
  const typeId = getDocumentTypeId(data);
  const resolvedType = type ?? getScriptureTypeOrFallback(typeId);
  const author = data.author
    ? `<p class="runyth-scriptoria-journal-byline"><em>${escapeHtml(data.author)}</em></p>`
    : "";
  const unavailable = resolvedType.unavailable
    ? `<p class="runyth-scriptoria-type-unavailable">${escapeHtml(resolveScriptureTypeLabel(resolvedType))}</p>`
    : "";
  return `
    <article class="runyth-scriptoria-journal-snapshot runyth-scriptoria-rendered-surface" data-runyth-scriptoria-type="${escapeHtml(typeId)}">
      <p class="runyth-scriptoria-journal-type"><i class="${escapeHtml(resolvedType.icon)}"></i> <strong>${escapeHtml(resolveScriptureTypeLabel(resolvedType))}</strong></p>
      <h1>${escapeHtml(item.name)}</h1>
      ${author}
      ${unavailable}
      ${wrapRenderedContent(data.html ?? "")}
    </article>
  `;
}

function finiteCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
