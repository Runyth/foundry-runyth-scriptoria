import {
  API_READY_HOOK,
  MODULE_ID,
  PUBLIC_API_VERSION
} from "./constants.mjs";
import {
  calculateItemEconomics,
  getEffectiveTypeEconomics,
  getTypeEconomics,
  validateTypeEconomics
} from "./economics.mjs";
import {
  getScriptureType,
  getScriptureTypes,
  hasScriptureType,
  registerScriptureType,
  unregisterScriptureType
} from "./scripture-types.mjs";

const API_CAPABILITIES = Object.freeze([
  "scripture-types",
  "document-readers",
  "player-display",
  "item-economics"
]);
let apiReadyAnnounced = false;

export function createPublicApi(operations) {
  return Object.freeze({
    version: PUBLIC_API_VERSION,
    capabilities: API_CAPABILITIES,
    registerScriptureType,
    unregisterScriptureType,
    getScriptureType,
    getScriptureTypes,
    hasScriptureType,
    getTypeEconomics,
    getEffectiveTypeEconomics,
    calculateItemEconomics,
    validateTypeEconomics,
    openImporter: operations.openImporter,
    openReader: operations.openReader,
    openDocumentView: operations.openDocumentView,
    getReaderModes: operations.getReaderModes,
    getDefaultSceneDocumentView: operations.getDefaultSceneDocumentView,
    showToAllPlayers: operations.showToAllPlayers,
    showToSelectedPlayers: operations.showToSelectedPlayers,
    showPlayerSelectionDialog: operations.showPlayerSelectionDialog,
    createFromMarkdown: operations.createFromMarkdown,
    createFromSource: operations.createFromSource,
    updateFromMarkdown: operations.updateFromMarkdown,
    updateFromSource: operations.updateFromSource,
    isScriptoriaItem: operations.isScriptoriaItem
  });
}

export function publishPublicApi(api, {
  announce = false
} = {}) {
  const module = globalThis.game?.modules?.get?.(MODULE_ID);
  if (!module) return false;

  module.api = api;

  if (announce && !apiReadyAnnounced) {
    apiReadyAnnounced = true;
    try {
      globalThis.Hooks?.callAll?.(API_READY_HOOK, api);
    } catch (error) {
      console.error(`${MODULE_ID} | One or more API-ready listeners failed. Scriptoria will continue loading.`, error);
    }
  }

  return true;
}

export function resetApiPublicationForTests() {
  apiReadyAnnounced = false;
}
