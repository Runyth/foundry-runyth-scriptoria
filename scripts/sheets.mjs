import { FLAG_SCOPE } from "./constants.mjs";
import {
  getDocumentTypeId,
  getScriptoriaData,
  isScriptoriaItem
} from "./documents.mjs";
import { openImporter } from "./importer.mjs";
import { localize } from "./i18n.mjs";
import { openReader, notifyReaderError } from "./reader.mjs";
import {
  getScriptureTypeOrFallback,
  resolveScriptureTypeLabel
} from "./scripture-types.mjs";

export function registerSheetHooks() {
  Hooks.on("renderItemSheet", (application, html) => {
    const item = getApplicationItem(application);
    if (!isScriptoriaItem(item)) return;
    markScriptoriaApplication(application, html, "scriptoria-item-window");
    if (isApplicationV2(application)) return;
    injectSheetActions(application, html);
  });

  Hooks.on("renderApplicationV2", (application, element) => {
    const item = getApplicationItem(application);
    if (isScriptoriaItem(item)) {
      markScriptoriaApplication(application, element, "scriptoria-item-window");
      injectSheetActions(application, element);
      return;
    }

    if (isScriptoriaJournalApplication(application)) {
      markScriptoriaApplication(application, element, "scriptoria-journal-window");
      markRenderedContent(element);
    }
  });

  Hooks.on("getHeaderControlsApplicationV2", (application, controls) => {
    const item = getApplicationItem(application);
    if (!isScriptoriaItem(item)) return;

    if (!controls.some((control) => control.action === "scriptoria-read")) {
      controls.unshift({
        action: "scriptoria-read",
        label: localize("SCRIPTORIA.Actions.Read", "Read"),
        icon: "fa-solid fa-book-open",
        visible: true,
        onClick: () => openReaderSafely(item)
      });
    }

    if (
      (game.user?.isGM || item.isOwner)
      && !controls.some((control) => control.action === "scriptoria-edit")
    ) {
      controls.unshift({
        action: "scriptoria-edit",
        label: localize("SCRIPTORIA.Actions.EditSource", "Edit Source"),
        icon: "fa-solid fa-pen-to-square",
        visible: true,
        onClick: () => openImporter({ item })
      });
    }
  });

  Hooks.on("getItemContextOptions", (_application, options) => {
    addItemContextOptions(options);
  });

  Hooks.on("getItemDirectoryEntryContext", (_application, options) => {
    addItemContextOptions(options);
  });
}

export function registerDirectoryHooks() {
  Hooks.on("getHeaderControlsApplicationV2", (application, controls) => {
    if (!game.user?.isGM || !isItemDirectory(application)) return;
    if (controls.some((control) => control.action === "scriptoria-create")) return;

    controls.unshift({
      action: "scriptoria-create",
      label: localize("SCRIPTORIA.Actions.CreateScriptoriaDocument", "Create Scriptoria Document"),
      icon: "fa-solid fa-book-medical",
      visible: true,
      onClick: () => openImporter()
    });
  });

  Hooks.on("getItemDirectoryHeaderButtons", (_application, buttons) => {
    if (!game.user?.isGM) return;
    if (buttons.some((button) => button.class === "scriptoria-create")) return;

    buttons.unshift({
      label: localize("SCRIPTORIA.Actions.Scriptoria", "Scriptoria"),
      class: "scriptoria-create",
      icon: "fa-solid fa-book-medical",
      onclick: () => openImporter()
    });
  });

  Hooks.on("renderApplicationV2", (application, element) => {
    if (!game.user?.isGM || !isItemDirectory(application)) return;
    injectDirectoryButton(element);
  });

  Hooks.on("renderItemDirectory", (application, html) => {
    if (!game.user?.isGM || isApplicationV2(application)) return;
    injectDirectoryButton(html);
  });
}

function addItemContextOptions(options) {
  if (options.some((option) => option.classes === "scriptoria-read-context")) return;

  options.unshift(
    {
      name: localize("SCRIPTORIA.Actions.ReadScriptoriaDocument", "Read Scriptoria Document"),
      icon: '<i class="fa-solid fa-book-open"></i>',
      classes: "scriptoria-read-context",
      condition: (entry) => isScriptoriaItem(resolveDirectoryItem(entry)),
      callback: (entry) => openReaderSafely(resolveDirectoryItem(entry))
    },
    {
      name: localize("SCRIPTORIA.Actions.EditScriptoriaSource", "Edit Scriptoria Source"),
      icon: '<i class="fa-solid fa-pen-to-square"></i>',
      classes: "scriptoria-edit-context",
      condition: (entry) => {
        const item = resolveDirectoryItem(entry);
        return isScriptoriaItem(item) && (game.user?.isGM || item.isOwner);
      },
      callback: (entry) => openImporter({ item: resolveDirectoryItem(entry) })
    }
  );
}

function injectDirectoryButton(html) {
  const root = normalizeRoot(html);
  if (!root || root.querySelector("[data-action='scriptoria-create']")) return;

  const headerActions = root.querySelector(".directory-header .header-actions")
    ?? root.querySelector(".directory-header")
    ?? root.querySelector("header");
  if (!headerActions) return;

  const button = document.createElement("button");
  button.type = "button";
  button.dataset.action = "scriptoria-create";
  button.className = "scriptoria-directory-button";
  button.innerHTML = `<i class="fa-solid fa-book-medical"></i> ${localize("SCRIPTORIA.Actions.CreateScriptoriaDocument", "Create Scriptoria Document")}`;
  button.addEventListener("click", () => openImporter());
  headerActions.append(button);
}

function injectSheetActions(application, html) {
  const item = getApplicationItem(application);
  if (!isScriptoriaItem(item)) return;

  const root = normalizeRoot(html);
  if (!root) return;
  root.classList.add("scriptoria-item-sheet");
  markRenderedContent(root);
  if (root.querySelector(".scriptoria-sheet-actions")) return;

  const actions = document.createElement("div");
  actions.className = "scriptoria-sheet-actions";
  actions.append(createButton(localize("SCRIPTORIA.Actions.Read", "Read"), "fa-solid fa-book-open", () => openReaderSafely(item)));

  if (game.user?.isGM || item.isOwner) {
    actions.append(createButton(localize("SCRIPTORIA.Actions.EditSource", "Edit Source"), "fa-solid fa-pen-to-square", () => {
      openImporter({ item });
    }));
  }

  const form = root.matches("form") ? root : root.querySelector("form");
  (form ?? root).prepend(actions);
}

function markRenderedContent(rootOrHtml) {
  const root = normalizeRoot(rootOrHtml);
  if (!root) return;
  for (const candidate of root.querySelectorAll(
    ".scriptoria-journal-snapshot, .scriptoria-rendered-content, [data-tab='description'], .item-description"
  )) {
    candidate.classList.add("scriptoria-rendered-content");
  }
}

export function markScriptoriaApplication(application, html, surfaceClass = "") {
  const contentRoot = normalizeRoot(html);
  const applicationRoot = normalizeRoot(application?.element);
  const windowRoot = applicationRoot
    ?? contentRoot?.closest?.(".window-app, .application")
    ?? contentRoot;

  if (!windowRoot) return false;
  windowRoot.classList.add("scriptoria-document-window");
  if (surfaceClass) windowRoot.classList.add(surfaceClass);
  return true;
}

function createButton(label, icon, callback) {
  const button = document.createElement("button");
  button.type = "button";
  button.innerHTML = `<i class="${icon}"></i> ${label}`;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    callback();
  });
  return button;
}

function openReaderSafely(item) {
  void openReader(item).catch(notifyReaderError);
}

function getApplicationItem(application) {
  const document = application?.document ?? application?.object;
  return document?.documentName === "Item" ? document : null;
}

function isScriptoriaJournalApplication(application) {
  const document = application?.document ?? application?.object;
  if (document?.documentName !== "JournalEntry" && document?.documentName !== "JournalEntryPage") {
    return false;
  }
  if (document.getFlag?.(FLAG_SCOPE, "sourceItemUuid")) return true;
  return Boolean(document.parent?.getFlag?.(FLAG_SCOPE, "sourceItemUuid"));
}

function resolveDirectoryItem(entry) {
  const element = entry?.[0] ?? entry;
  const id = entry?.data?.("documentId")
    ?? element?.dataset?.documentId
    ?? element?.dataset?.entryId;
  return game.items.get(id);
}

function isItemDirectory(application) {
  return application?.collection === game.items
    || application?.constructor?.name === "ItemDirectory"
    || application?.options?.id === "items";
}

function isApplicationV2(application) {
  const ApplicationV2 = foundry.applications.api.ApplicationV2;
  return Boolean(ApplicationV2 && application instanceof ApplicationV2);
}

function normalizeRoot(html) {
  const HTMLElementClass = globalThis.HTMLElement;
  if (typeof HTMLElementClass !== "function") return null;
  if (html instanceof HTMLElementClass) return html;
  return html?.[0] instanceof HTMLElementClass ? html[0] : null;
}

export function describeItem(item) {
  const data = getScriptoriaData(item);
  if (!data) return "";
  const type = getScriptureTypeOrFallback(getDocumentTypeId(data));
  return `${resolveScriptureTypeLabel(type)}: ${item.name}`;
}
