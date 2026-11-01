import { FLAG_SCOPE, MODULE_ID } from "./constants.mjs";
import {
  getReaderModeDescriptors,
  inferApplicationViewMode,
  openDocumentView,
  resolveDocumentViewContext
} from "./document-views.mjs";
import {
  showPlayerSelectionDialog,
  showToAllPlayers
} from "./display-service.mjs";
import { localize } from "./i18n.mjs";
import { isScriptoriaItem } from "./documents.mjs";

let hooksRegistered = false;

export function registerWindowControlHooks() {
  if (hooksRegistered) return false;
  hooksRegistered = true;

  Hooks.on("getHeaderControlsApplicationV2", addApplicationV2Controls);
  Hooks.on("renderApplicationV2", enhanceRenderedApplication);

  Hooks.on("renderItemSheet", enhanceRenderedApplication);
  Hooks.on("renderJournalSheet", enhanceRenderedApplication);
  Hooks.on("renderJournalPageSheet", enhanceRenderedApplication);
  Hooks.on("renderEnhancedJournal", enhanceRenderedApplication);

  return true;
}

export function addApplicationV2Controls(application, controls) {
  const target = getSupportedApplicationTarget(application);
  if (!target) return;

  const currentMode = inferApplicationViewMode(application);
  if (globalThis.game?.user?.isGM) {
    addControlOnce(controls, {
      action: "runyth-scriptoria-show-selected",
      label: localize(
        "RUNYTH-SCRIPTORIA.Actions.ShowToSelectedPlayers",
        "Show to Selected Players…"
      ),
      icon: "fa-solid fa-user-check",
      visible: true,
      onClick: () => {
        void showPlayerSelectionDialog(target, {
          application,
          mode: currentMode
        }).catch(reportControlError);
      }
    });

    const availableModes = getReaderModeDescriptors().filter((mode) => mode.available);
    for (const descriptor of [...availableModes].reverse()) {
      const active = descriptor.id === currentMode;
      addControlOnce(controls, {
        action: `runyth-scriptoria-open-with-${descriptor.id}`,
        label: `${localize("RUNYTH-SCRIPTORIA.Actions.OpenWith", "Open with")}: ${descriptor.label}${active ? ` (${localize("RUNYTH-SCRIPTORIA.Actions.Current", "Current")})` : ""}`,
        icon: active ? "fa-solid fa-check" : descriptor.icon,
        visible: true,
        disabled: active,
        onClick: () => {
          if (active) return;
          void openDocumentView(target, {
            mode: descriptor.id,
            source: "alternative-view"
          }).catch(reportControlError);
        }
      });
    }
  }
}

export function enhanceRenderedApplication(application, html) {
  const target = getSupportedApplicationTarget(application);
  if (!target) return false;

  const root = normalizeRoot(application?.element)
    ?? normalizeRoot(html)
    ?? normalizeRoot(html)?.closest?.(".window-app, .application");
  if (root) root.classList.add("runyth-scriptoria-document-window");

  if (!globalThis.game?.user?.isGM) return true;
  injectShowAllHeaderButton(application, root, target);

  // Monk's Enhanced Journal dynamically replaces its controls dropdown after
  // rendering a subsheet. Re-add Runyth Scriptoria's documented actions to that
  // public ApplicationV2 window surface when the normal hook is bypassed.
  if (isEnhancedJournalApplication(application)) {
    injectEnhancedJournalMenuControls(application, target);
  }
  return true;
}

export function injectShowAllHeaderButton(application, root, target) {
  const header = application?.window?.header
    ?? root?.querySelector?.(".window-header")
    ?? root?.querySelector?.("header.window-header");
  if (!header || header.querySelector?.("[data-runyth-scriptoria-action='show-all']")) return false;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "header-control icon runyth-scriptoria-show-all-header";
  button.dataset.runythScriptoriaAction = "show-all";
  button.dataset.tooltip = localize(
    "RUNYTH-SCRIPTORIA.Actions.ShowToAllPlayers",
    "Show to All Players"
  );
  button.setAttribute("aria-label", button.dataset.tooltip);
  button.innerHTML = '<i class="fa-solid fa-users-viewfinder" aria-hidden="true"></i>';
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void showToAllPlayers(target, {
      application,
      mode: inferApplicationViewMode(application)
    }).catch(reportControlError);
  });

  const controlsButton = application?.window?.controls
    ?? header.querySelector?.("button[data-action='controls'], .window-controls, .close");
  if (controlsButton?.parentElement === header) controlsButton.before(button);
  else header.append(button);
  return true;
}

export function getSupportedApplicationTarget(application) {
  if (application?.runythScriptoriaContext) return application.runythScriptoriaContext;

  const candidates = [
    application?.document,
    application?.object,
    application?.journal,
    application?.subsheet?.document
  ];
  for (const candidate of candidates) {
    if (isSupportedDocument(candidate)) return candidate;
  }
  return null;
}

export function isSupportedDocument(document) {
  if (isScriptoriaItem(document)) return true;
  if (!["JournalEntry", "JournalEntryPage"].includes(document?.documentName)) return false;
  return Boolean(
    document.getFlag?.(FLAG_SCOPE, "sourceItemUuid")
    || document.parent?.getFlag?.(FLAG_SCOPE, "sourceItemUuid")
  );
}

export function resetWindowControlHooksForTests() {
  hooksRegistered = false;
}

function injectEnhancedJournalMenuControls(application, target) {
  const dropdown = application?.window?.controlsDropdown;
  if (!dropdown) return;
  const currentMode = inferApplicationViewMode(application);

  if (!dropdown.querySelector("[data-runyth-scriptoria-action='show-selected']")) {
    dropdown.append(createDropdownButton({
      action: "show-selected",
      label: localize(
        "RUNYTH-SCRIPTORIA.Actions.ShowToSelectedPlayers",
        "Show to Selected Players…"
      ),
      icon: "fa-solid fa-user-check",
      callback: () => showPlayerSelectionDialog(target, {
        application,
        mode: currentMode
      })
    }));
  }

  for (const descriptor of getReaderModeDescriptors().filter((mode) => mode.available)) {
    const action = `open-${descriptor.id}`;
    if (dropdown.querySelector(`[data-runyth-scriptoria-action='${action}']`)) continue;
    dropdown.append(createDropdownButton({
      action,
      label: `${localize("RUNYTH-SCRIPTORIA.Actions.OpenWith", "Open with")}: ${descriptor.label}`,
      icon: descriptor.id === currentMode ? "fa-solid fa-check" : descriptor.icon,
      disabled: descriptor.id === currentMode,
      callback: () => openDocumentView(target, {
        mode: descriptor.id,
        source: "alternative-view"
      })
    }));
  }
}

function createDropdownButton({ action, label, icon, callback, disabled = false }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "control-item runyth-scriptoria-window-control";
  button.dataset.runythScriptoriaAction = action;
  button.disabled = disabled;
  button.innerHTML = `<i class="${icon}" aria-hidden="true"></i><span>${escapeText(label)}</span>`;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;
    void Promise.resolve(callback()).catch(reportControlError);
  });
  return button;
}

function addControlOnce(controls, control) {
  if (controls.some((existing) => existing.action === control.action)) return false;
  controls.unshift(control);
  return true;
}

function isEnhancedJournalApplication(application) {
  return application?.constructor?.name === "EnhancedJournal"
    || application?.id === "MonksEnhancedJournal"
    || application?.element?.classList?.contains?.("monks-enhanced-journal");
}

function reportControlError(error) {
  console.error(`${MODULE_ID} | Document window action failed.`, error);
  globalThis.ui?.notifications?.error?.(
    error?.message
      ?? localize(
        "RUNYTH-SCRIPTORIA.Notifications.FailedDisplay",
        "The Runyth Scriptoria document could not be displayed."
      )
  );
}

function normalizeRoot(value) {
  const HTMLElementClass = globalThis.HTMLElement;
  if (typeof HTMLElementClass !== "function") return null;
  if (value instanceof HTMLElementClass) return value;
  return value?.[0] instanceof HTMLElementClass ? value[0] : null;
}

function escapeText(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
