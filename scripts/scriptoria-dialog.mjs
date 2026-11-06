// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { applyUiLook, FLEET_UI_CLASS, windowClasses, WINDOW_MARKER } from "./ui-look.mjs";

let dialogClass = null;

export function getScriptoriaDialogClass() {
  dialogClass ??= createScriptoriaDialogClass(globalThis.foundry?.applications?.api?.DialogV2);
  return dialogClass;
}

export function createScriptoriaDialogClass(Base) {
  return class ScriptoriaDialog extends Base {
    constructor(options = {}) {
      const classes = (options.classes ?? []).filter((name) => name !== FLEET_UI_CLASS);
      super({
        ...options,
        classes: windowClasses(classes)
      });
    }

    async _onRender(context, options) {
      await super._onRender?.(context, options);
      const element = this.element;
      if (!element) return;
      element.setAttribute(WINDOW_MARKER, "");
      applyUiLook(element);
    }
  };
}
