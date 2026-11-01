import {
  DEFAULT_SCRIPTURE_TYPE_ID,
  FLAG_KEY,
  FLAG_SCOPE,
  MODULE_ID,
  SCHEMA_VERSION,
  SETTINGS
} from "./constants.mjs";
import { debugLog } from "./debug.mjs";
import { format, localize } from "./i18n.mjs";
import {
  buildEconomicsFlagData,
  buildSystemEconomicsData,
  calculateItemEconomics,
  resolveItemEconomicsValues
} from "./economics.mjs";
import {
  extractHtmlBody,
  extractHtmlTitle,
  removeFirstHtmlHeading,
  sanitizeImportedHtml
} from "./html.mjs";
import {
  extractMarkdownTitle,
  removeFirstLevelOneHeading,
  renderMarkdown
} from "./markdown.mjs";
import {
  getScriptureType,
  getScriptureTypeOrFallback,
  getStoredScriptureTypeId,
  resolveScriptureTypeLabel,
  resolveScriptureTypePlural,
  validateDocumentForScriptureType
} from "./scripture-types.mjs";

export function isScriptoriaItem(item) {
  return item?.documentName === "Item"
    && Boolean(item.getFlag?.(FLAG_SCOPE, FLAG_KEY));
}

export async function resolveItem(itemOrUuid) {
  if (typeof itemOrUuid !== "string") return itemOrUuid;
  return foundry.utils.fromUuid(itemOrUuid);
}

export function getScriptoriaData(item) {
  return item?.getFlag?.(FLAG_SCOPE, FLAG_KEY) ?? null;
}

export function getDocumentSource(data) {
  return String(data?.source ?? data?.markdown ?? "");
}

export function getDocumentSourceFormat(data) {
  return data?.sourceFormat === "html" ? "html" : "markdown";
}

export function getDocumentTypeId(data) {
  return getStoredScriptureTypeId(data);
}

export function getAvailableItemTypes() {
  const types = Array.from(game.documentTypes?.Item ?? [])
    .filter((type) => type && type !== "base");
  return types.length ? types : ["loot"];
}

export function getDefaultItemType() {
  const types = getAvailableItemTypes();
  if (types.includes("loot")) return "loot";
  if (types.includes("equipment")) return "equipment";
  return types[0];
}

export async function createFromMarkdown(data = {}) {
  return createFromSource({
    ...data,
    sourceFormat: "markdown",
    source: data.source ?? data.markdown ?? ""
  });
}

export async function createFromSource(data = {}) {
  if (!game.user?.isGM) {
    throw new Error(localize("SCRIPTORIA.Errors.CreateGmOnly", "Only a Game Master can create Scriptoria documents."));
  }

  const prepared = prepareDocumentData(data);
  await validateDocumentForScriptureType(prepared.typeId, buildValidatorPayload(prepared));

  const folder = await ensureItemFolder(prepared.typeId);
  const itemData = {
    name: prepared.title,
    type: prepared.itemType,
    img: prepared.img,
    folder: folder?.id ?? null,
    ownership: buildOwnership(prepared.access),
    flags: {
      [FLAG_SCOPE]: {
        [FLAG_KEY]: prepared.flagData
      }
    }
  };

  const systemData = buildSystemData(prepared.html, prepared.itemType, prepared.economicsResult);
  if (systemData) itemData.system = systemData;
  debugLog("Final Item economics payload", {
    typeId: prepared.typeId,
    itemType: prepared.itemType,
    price: itemData.system?.price,
    weight: itemData.system?.weight,
    economicsMetadata: prepared.flagData.economics
  });

  const item = await Item.implementation.create(itemData, {
    renderSheet: false
  });

  ui.notifications.info(format("SCRIPTORIA.Notifications.DocumentCreated", { type: resolveScriptureTypeLabel(prepared.type), title: prepared.title }, `Created ${resolveScriptureTypeLabel(prepared.type)}: ${prepared.title}`));
  return item;
}

export async function updateFromMarkdown(itemOrUuid, data = {}) {
  return updateFromSource(itemOrUuid, {
    ...data,
    sourceFormat: "markdown",
    source: data.source ?? data.markdown ?? ""
  });
}

export async function updateFromSource(itemOrUuid, data = {}) {
  const item = await resolveItem(itemOrUuid);
  if (!isScriptoriaItem(item)) {
    throw new Error(localize("SCRIPTORIA.Errors.NotScriptoriaDocument", "The selected Item is not a Scriptoria document."));
  }
  if (!game.user?.isGM && !item.isOwner) {
    throw new Error(localize("SCRIPTORIA.Errors.EditDocumentPermission", "You do not have permission to edit this Scriptoria document."));
  }

  const existing = getScriptoriaData(item);
  const existingTypeId = getDocumentTypeId(existing);
  const requestedTypeId = String(
    data.typeId
    ?? data.kind
    ?? existingTypeId
  ).trim() || existingTypeId;
  const prepared = prepareDocumentData({
    itemType: item.type,
    access: existing.access ?? "embedded",
    removeTitleHeading: existing.removeTitleHeading ?? true,
    author: existing.author ?? "",
    createdAt: existing.createdAt,
    sourceFormat: getDocumentSourceFormat(existing),
    source: getDocumentSource(existing),
    sourceFileName: existing.sourceFileName ?? "",
    ...data,
    typeId: requestedTypeId,
    kind: requestedTypeId,
    image: requestedTypeId === existingTypeId ? item.img : undefined,
    calculateEconomics: data.recalculateEconomics === true
      || data.economicsOverrides !== undefined
      || data.economicsValues !== undefined,
    existingEconomics: existing.economics,
    allowUnavailableType: true
  });

  if (!prepared.type.unavailable) {
    await validateDocumentForScriptureType(prepared.typeId, buildValidatorPayload(prepared));
  }

  const update = {
    name: prepared.title,
    img: prepared.img,
    [`flags.${FLAG_SCOPE}.${FLAG_KEY}`]: prepared.flagData
  };

  if (!item.isEmbedded) {
    update.ownership = buildOwnership(prepared.access);
  }

  if (hasDescriptionValue(item)) {
    update["system.description.value"] = wrapRenderedContent(prepared.html);
  }

  if (prepared.economicsResult) {
    const economicsData = buildSystemEconomicsData(prepared.economicsResult, {
      itemType: item.type
    });
    if (economicsData?.price) update["system.price"] = economicsData.price;
    if (economicsData?.weight) update["system.weight"] = economicsData.weight;
  }

  await item.update(update);
  ui.notifications.info(format("SCRIPTORIA.Notifications.DocumentUpdated", { title: prepared.title }, `Updated ${prepared.title}.`));
  return item;
}

export function prepareDocumentData(data) {
  const sourceFormat = data.sourceFormat === "html" ? "html" : "markdown";
  const source = String(data.source ?? data.markdown ?? "").trim();
  if (!source) throw new Error(localize("SCRIPTORIA.Errors.ContentRequired", "Document content is required."));

  const requestedTypeId = String(
    data.typeId
    ?? data.kind
    ?? DEFAULT_SCRIPTURE_TYPE_ID
  ).trim() || DEFAULT_SCRIPTURE_TYPE_ID;
  const registeredType = getScriptureType(requestedTypeId);
  const allowUnavailableType = data.allowUnavailableType === true;

  if (!registeredType && !allowUnavailableType) {
    throw new Error(format("SCRIPTORIA.Errors.UnknownType", { typeId: requestedTypeId }, `Unknown or unavailable scripture type: ${requestedTypeId}`));
  }

  const type = registeredType ?? getScriptureTypeOrFallback(requestedTypeId);
  if (!type.unavailable && type.capabilities.creation !== true) {
    throw new Error(format("SCRIPTORIA.Errors.TypeNotCreatable", { typeId: requestedTypeId }, `Scripture type "${requestedTypeId}" is not eligible for document creation.`));
  }

  const extractedTitle = sourceFormat === "html"
    ? extractHtmlTitle(source)
    : extractMarkdownTitle(source);
  const title = String(data.title ?? "").trim()
    || extractedTitle
    || format("SCRIPTORIA.Documents.Untitled", { type: resolveScriptureTypeLabel(type) }, `Untitled ${resolveScriptureTypeLabel(type)}`);
  const removeTitleHeading = data.removeTitleHeading !== false;
  const html = sourceFormat === "html"
    ? prepareHtml(source, removeTitleHeading)
    : prepareMarkdown(source, removeTitleHeading);
  const itemType = getAvailableItemTypes().includes(data.itemType)
    ? data.itemType
    : getDefaultItemType();
  const access = data.access === "observer" ? "observer" : "embedded";
  const now = new Date().toISOString();
  const shouldCalculateEconomics = data.calculateEconomics !== false;
  const economicsResult = shouldCalculateEconomics
    ? data.economicsValues !== undefined
      ? resolveItemEconomicsValues({
        typeId: requestedTypeId,
        content: source,
        sourceFormat,
        values: data.economicsValues,
        dirty: data.economicsDirty
      })
      : calculateItemEconomics({
        typeId: requestedTypeId,
        content: source,
        sourceFormat,
        overrides: data.economicsOverrides
      })
    : null;
  const economicsMetadata = economicsResult
    ? buildEconomicsFlagData(economicsResult)
    : data.existingEconomics ?? buildEconomicsFlagData(null, { legacy: true });

  return {
    title,
    typeId: requestedTypeId,
    // Retained as a runtime alias for callers written against Scriptoria 1.x.
    kind: requestedTypeId,
    type,
    itemType,
    access,
    html,
    img: String(data.image ?? type.image ?? "modules/scriptoria/assets/scripture.svg"),
    economicsResult,
    flagData: {
      schemaVersion: SCHEMA_VERSION,
      typeId: requestedTypeId,
      // Retained for documents and integrations created before API v1.
      kind: requestedTypeId,
      sourceFormat,
      source,
      sourceFileName: String(data.sourceFileName ?? "").trim(),
      // Retained for compatibility with Scriptoria 1.0.x and external consumers.
      markdown: sourceFormat === "markdown" ? source : "",
      html,
      author: String(data.author ?? "").trim(),
      extractedTitle,
      removeTitleHeading,
      access,
      economics: economicsMetadata,
      createdAt: String(data.createdAt ?? now),
      updatedAt: now
    }
  };
}

export function wrapRenderedContent(html, {
  className = "scriptoria-rendered-content"
} = {}) {
  const content = String(html ?? "");
  const escapedClassName = String(className).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!escapedClassName) return content;

  const existingPattern = new RegExp(
    `^\\s*<[^>]+class=["'][^"']*\\b${escapedClassName}\\b`,
    "i"
  );
  if (existingPattern.test(content)) return content;
  return `<div class="${escapedClassName}">${content}</div>`;
}

export function buildOwnership(access) {
  const none = CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE;
  const observer = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
  return {
    default: access === "observer" ? observer : none
  };
}

export function buildJournalOwnership() {
  const access = game.settings.get(MODULE_ID, SETTINGS.scenePlayerAccess);
  return buildOwnership(access === "observer" ? "observer" : "embedded");
}

export function canReadItem(item) {
  if (!item) return false;
  if (game.user?.isGM) return true;

  const observer = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
  if (item.testUserPermission?.(game.user, observer)) return true;
  return Boolean(item.parent?.testUserPermission?.(game.user, observer));
}

async function ensureItemFolder(typeId) {
  const rootName = String(game.settings.get(MODULE_ID, SETTINGS.rootFolder) || "Scriptoria").trim();
  const root = await findOrCreateFolder("Item", rootName, null);
  if (!game.settings.get(MODULE_ID, SETTINGS.createKindFolders)) return root;

  const name = resolveScriptureTypePlural(getScriptureTypeOrFallback(typeId));
  return findOrCreateFolder("Item", name, root);
}

export async function ensureJournalFolder() {
  return findOrCreateFolder("JournalEntry", localize("SCRIPTORIA.Documents.SceneFolder", "Scriptoria Scene Documents"), null);
}

async function findOrCreateFolder(type, name, parent) {
  const parentId = parent?.id ?? null;
  const existing = game.folders.find((folder) => {
    const folderParentId = folder.folder?.id ?? folder.folder ?? null;
    return folder.type === type
      && folder.name === name
      && folderParentId === parentId;
  });
  if (existing) return existing;

  return Folder.implementation.create({
    name,
    type,
    folder: parentId,
    sorting: "a"
  });
}

function prepareMarkdown(source, removeTitleHeading) {
  const body = removeTitleHeading
    ? removeFirstLevelOneHeading(source)
    : source;
  return cleanRenderedHtml(renderMarkdown(body));
}

function prepareHtml(source, removeTitleHeading) {
  const body = removeTitleHeading
    ? removeFirstHtmlHeading(source)
    : extractHtmlBody(source);
  return sanitizeImportedHtml(body);
}

function buildSystemData(html, itemType, economicsResult) {
  const systemData = {};
  if (game.system.id === "dnd5e") {
    systemData.description = {
      value: wrapRenderedContent(html),
      chat: ""
    };
  }
  const economicsData = buildSystemEconomicsData(economicsResult, { itemType });
  if (economicsData) Object.assign(systemData, economicsData);
  return Object.keys(systemData).length ? systemData : undefined;
}

function hasDescriptionValue(item) {
  return game.system.id === "dnd5e"
    || foundry.utils.hasProperty(item, "system.description.value");
}

function cleanRenderedHtml(html) {
  if (typeof foundry?.utils?.cleanHTML !== "function") return html;
  try {
    return foundry.utils.cleanHTML(html);
  } catch (error) {
    console.warn(`${MODULE_ID} | Foundry HTML cleaning failed; using escaped renderer output.`, error);
    return html;
  }
}

function buildValidatorPayload(prepared) {
  return {
    title: prepared.title,
    typeId: prepared.typeId,
    sourceFormat: prepared.flagData.sourceFormat,
    source: prepared.flagData.source,
    sourceFileName: prepared.flagData.sourceFileName,
    author: prepared.flagData.author,
    access: prepared.access,
    itemType: prepared.itemType
  };
}
