// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
export const MODULE_ID = "runyth-scriptoria";
export const MODULE_TITLE = "Runyth Scriptoria";
export const MODULE_VERSION = "1.8.0";
export const PUBLIC_API_VERSION = "1.2.0";
export const API_READY_HOOK = "runyth-scriptoria.apiReady";
export const TYPE_REGISTERED_HOOK = "runyth-scriptoria.scriptureTypeRegistered";
export const TYPE_UNREGISTERED_HOOK = "runyth-scriptoria.scriptureTypeUnregistered";
export const FLAG_SCOPE = MODULE_ID;
export const FLAG_KEY = "document";
export const SCHEMA_VERSION = 4;
export const DEFAULT_SCRIPTURE_TYPE_ID = "book";
export const SOCKET_CHANNEL = `module.${MODULE_ID}`;
export const SOCKET_PROTOCOL_VERSION = 1;

export const READER_MODES = Object.freeze({
  foundry: "foundry",
  enhancedJournal: "enhanced-journal",
  simpleReader: "simple-reader"
});

export const SCRIPTURE_TYPE_CAPABILITIES = Object.freeze([
  "creation",
  "import",
  "scenePlacement",
  "reader"
]);

export const SETTINGS = Object.freeze({
  rootFolder: "rootFolder",
  createKindFolders: "createKindFolders",
  defaultAccess: "defaultAccess",
  enableSceneDrop: "enableSceneDrop",
  scenePlayerAccess: "scenePlayerAccess",
  defaultSceneDocumentView: "defaultSceneDocumentView",
  openAfterCreate: "openAfterCreate",
  rememberImporterWindow: "rememberImporterWindow",
  importerWindowLayout: "importerWindowLayout",
  resetImporterWindow: "resetImporterWindow",
  itemEconomicsOverrides: "itemEconomicsOverrides",
  itemEconomicsDefaultsMenu: "itemEconomicsDefaultsMenu",
  debugLogging: "debugLogging"
});
