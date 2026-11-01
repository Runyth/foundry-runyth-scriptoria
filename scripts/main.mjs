// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { MODULE_ID, MODULE_TITLE } from "./constants.mjs";
import {
  createFromMarkdown,
  createFromSource,
  isScriptoriaItem,
  updateFromMarkdown,
  updateFromSource
} from "./documents.mjs";
import {
  getDefaultSceneDocumentView,
  getReaderModeDescriptors,
  openDocumentView
} from "./document-views.mjs";
import {
  registerDisplaySocket,
  showPlayerSelectionDialog,
  showToAllPlayers,
  showToSelectedPlayers
} from "./display-service.mjs";
import { openImporter } from "./importer.mjs";
import { migrateLegacyEconomicsMetadata } from "./migrations.mjs";
import { createPublicApi, publishPublicApi } from "./public-api.mjs";
import { openReader } from "./reader.mjs";
import { registerSceneDropHook } from "./scene-drop.mjs";
import { registerSceneNoteHooks } from "./scene-notes.mjs";
import { registerSettings } from "./settings.mjs";
import { registerDirectoryHooks, registerSheetHooks } from "./sheets.mjs";
import { initializeBuiltInScriptureTypes } from "./scripture-types.mjs";
import { registerWindowControlHooks } from "./window-controls.mjs";

initializeBuiltInScriptureTypes();

export const api = createPublicApi({
  openImporter,
  openReader,
  openDocumentView,
  getReaderModes: getReaderModeDescriptors,
  getDefaultSceneDocumentView,
  showToAllPlayers,
  showToSelectedPlayers,
  showPlayerSelectionDialog,
  createFromMarkdown,
  createFromSource,
  updateFromMarkdown,
  updateFromSource,
  isScriptoriaItem
});

// Publish immediately when Foundry has already populated game.modules. The init
// hook below is the guaranteed fallback and announces readiness exactly once.
publishPublicApi(api);

Hooks.once("init", () => {
  initializeBuiltInScriptureTypes();
  publishPublicApi(api, { announce: true });

  registerSettings();
  registerDirectoryHooks();
  registerSheetHooks();
  registerSceneDropHook();
  registerSceneNoteHooks();
  registerWindowControlHooks();

  console.info(`${MODULE_ID} | ${MODULE_TITLE} initialised; extension API ${api.version} ready.`);
});

Hooks.once("ready", () => {
  // Defensive re-publication covers unusual module loaders which did not expose
  // the package record during module evaluation or init.
  publishPublicApi(api);
  registerDisplaySocket();
  migrateLegacyEconomicsMetadata().catch((error) => {
    console.error(`${MODULE_ID} | Legacy economics metadata migration failed.`, error);
  });
});
