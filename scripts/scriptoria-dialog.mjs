// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { applyUiLook, FLEET_UI_CLASS, windowClasses, WINDOW_MARKER } from "./ui-look.mjs";

let dialogClass = null;

const SCRIPTORIA_WINDOW_CLASS_PATTERN = /^runyth-scriptoria-(document|reader|importer|economics-settings|player-selection)-window$/;

export function getScriptoriaDialogClass() {
  dialogClass ??= createScriptoriaDialogClass(globalThis.foundry?.applications?.api?.DialogV2);
  return dialogClass;
}

export function createScriptoriaDialogClass(Base) {
  return class ScriptoriaDialog extends Base {
    #scriptoriaWindowClasses;

    constructor(options = {}) {
      const classes = (options.classes ?? []).filter((name) => name !== FLEET_UI_CLASS);
      super({
        ...options,
        classes: windowClasses(classes)
      });
      this.#scriptoriaWindowClasses = classes;
    }

    async _onRender(context, options) {
      await super._onRender?.(context, options);
      mountWindowIdentity(this, this.#scriptoriaWindowClasses);
      return undefined;
    }
  };
}

function mountWindowIdentity(dialog, fallbackClasses) {
  const element = dialog?.element;
  if (!element) return false;

  const identity = dialog?.options?.classes ?? fallbackClasses ?? [];
  if (element.classList?.add) {
    for (const name of identity) element.classList.add(name);
  }
  element.setAttribute?.(WINDOW_MARKER, "");
  applyUiLook(element);
  return true;
}

// Registered on the module-level `renderDialogV2` hook. Runs for every
// rendered DialogV2 window, so the look also lands when the class-level
// `_onRender` is bypassed by the host build.
export function syncRenderedDialog(dialog) {
  const element = dialog?.element;
  if (!element) return false;

  const classes = dialog?.options?.classes ?? [];
  const own = classes.some((name) => SCRIPTORIA_WINDOW_CLASS_PATTERN.test(name))
    || element.getAttribute?.(WINDOW_MARKER) === "";
  if (!own) return false;

  return mountWindowIdentity(dialog);
}
