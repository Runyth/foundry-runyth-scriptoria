// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { MODULE_ID } from "./constants.mjs";
import {
  getKnownEconomicsRows,
  getSupportedDenominations,
  setEconomicsWorldOverrides
} from "./economics.mjs";
import { escapeHtml } from "./markdown.mjs";
import { format, localize } from "./i18n.mjs";
import { windowClasses } from "./ui-look.mjs";
import {
  resolveScriptureTypeLabel
} from "./scripture-types.mjs";

export function createEconomicsDefaultsApplicationClass() {
  return class ScriptoriaEconomicsDefaultsDialog extends foundry.applications.api.DialogV2 {
    constructor() {
      super({
        window: {
          title: localize(
            "RUNYTH-SCRIPTORIA.Economics.SettingsMenu.Name",
            "Item Price and Weight Defaults"
          ),
          icon: "fa-solid fa-coins",
          resizable: true
        },
        classes: windowClasses(["runyth-scriptoria-economics-settings-window"]),
        position: {
          width: 980,
          height: 720
        },
        content: buildEconomicsSettingsContent(),
        buttons: [
          {
            action: "save",
            label: localize("RUNYTH-SCRIPTORIA.Actions.Save", "Save"),
            icon: "fa-solid fa-floppy-disk",
            default: true,
            callback: async (_event, button) => {
              try {
                const overrides = readEconomicsSettingsForm(button.form);
                await setEconomicsWorldOverrides(overrides);
                globalThis.ui?.notifications?.info?.(
                  localize(
                    "RUNYTH-SCRIPTORIA.Economics.Notifications.DefaultsSaved",
                    "Runyth Scriptoria item price and weight defaults saved."
                  )
                );
                return true;
              } catch (error) {
                console.error(`${MODULE_ID} | Unable to save item economics settings.`, error);
                globalThis.ui?.notifications?.error?.(
                  format(
                    "RUNYTH-SCRIPTORIA.Economics.Errors.InvalidSettings",
                    { message: error?.message ?? String(error) },
                    `Invalid economics settings: ${error?.message ?? String(error)}`
                  )
                );
                return false;
              }
            }
          },
          {
            action: "cancel",
            label: localize("RUNYTH-SCRIPTORIA.Actions.Cancel", "Cancel"),
            icon: "fa-solid fa-xmark"
          }
        ]
      });
    }

    async render(options = {}) {
      const rendered = await super.render(options);
      activateEconomicsSettingsListeners(this);
      return rendered;
    }
  };
}

export function buildEconomicsSettingsContent(rows = getKnownEconomicsRows()) {
  const denominations = getSupportedDenominations();
  const body = rows.map((row) => buildRow(row, denominations)).join("");
  return `
    <div class="runyth-scriptoria-economics-settings">
      <p class="notes">${escapeHtml(localize(
        "RUNYTH-SCRIPTORIA.Economics.SettingsMenu.Description",
        "Configure world defaults for every currently known Runyth Scriptoria type. Existing Items are never rewritten automatically."
      ))}</p>
      <div class="runyth-scriptoria-economics-settings__table" role="table">
        <div class="runyth-scriptoria-economics-settings__header" role="row">
          <span>${escapeHtml(localize("RUNYTH-SCRIPTORIA.Economics.Type", "Type"))}</span>
          <span>${escapeHtml(localize("RUNYTH-SCRIPTORIA.Economics.ProviderModule", "Provider module"))}</span>
          <span>${escapeHtml(localize("RUNYTH-SCRIPTORIA.Economics.Price", "Price"))}</span>
          <span>${escapeHtml(localize("RUNYTH-SCRIPTORIA.Economics.Denomination", "Denomination"))}</span>
          <span>${escapeHtml(localize("RUNYTH-SCRIPTORIA.Economics.BaseWeight", "Base weight"))}</span>
          <span>${escapeHtml(localize("RUNYTH-SCRIPTORIA.Economics.MinimumWeight", "Minimum weight"))}</span>
          <span>${escapeHtml(localize("RUNYTH-SCRIPTORIA.Economics.MaximumWeight", "Maximum weight"))}</span>
          <span>${escapeHtml(localize("RUNYTH-SCRIPTORIA.Economics.ReferenceWordCount", "Reference word count"))}</span>
          <span>${escapeHtml(localize("RUNYTH-SCRIPTORIA.Economics.ContentLengthAdjustment", "Adjust for content length"))}</span>
          <span></span>
        </div>
        ${body || `<p class="notes">${escapeHtml(localize("RUNYTH-SCRIPTORIA.Economics.NoTypes", "No Runyth Scriptoria types are currently available."))}</p>`}
      </div>
    </div>
  `;
}

export function readEconomicsSettingsForm(form) {
  const root = normalizeRoot(form);
  if (!root) throw new Error(localize("RUNYTH-SCRIPTORIA.Economics.Errors.FormUnavailable", "The economics settings form is unavailable."));
  const overrides = {};
  for (const row of root.querySelectorAll?.("[data-economics-type-id]") ?? []) {
    const typeId = String(row.dataset.economicsTypeId ?? "").trim();
    if (!typeId) continue;
    if (row.dataset.useProviderDefaults === "true") continue;
    overrides[typeId] = {
      price: {
        value: readNumber(row, "price-value"),
        denomination: readValue(row, "price-denomination")
      },
      weight: {
        base: readNumber(row, "weight-base"),
        minimum: readNumber(row, "weight-minimum"),
        maximum: readNumber(row, "weight-maximum"),
        referenceWordCount: readInteger(row, "reference-word-count"),
        adjustForContentLength: Boolean(row.querySelector("[data-field='adjust-content-length']")?.checked)
      }
    };
  }
  return overrides;
}

export function activateEconomicsSettingsListeners(application) {
  const root = normalizeRoot(application?.element);
  if (!root || root.dataset.runythScriptoriaEconomicsListeners === "true") return;
  root.dataset.runythScriptoriaEconomicsListeners = "true";

  root.addEventListener("input", (event) => {
    const row = event.target?.closest?.("[data-economics-type-id]");
    if (row) row.dataset.useProviderDefaults = "false";
  });

  root.addEventListener("change", (event) => {
    const row = event.target?.closest?.("[data-economics-type-id]");
    if (row) row.dataset.useProviderDefaults = "false";
  });

  root.addEventListener("click", async (event) => {
    const button = event.target?.closest?.("[data-action='reset-provider-defaults']");
    if (!button) return;
    event.preventDefault();
    const row = button.closest("[data-economics-type-id]");
    const typeId = row?.dataset.economicsTypeId;
    if (!typeId) return;

    try {
      const fresh = getKnownEconomicsRows().find((entry) => entry.type.id === typeId);
      if (fresh) {
        applyRowValues(row, fresh.providerDefaults);
        row.dataset.useProviderDefaults = "true";
      }
      globalThis.ui?.notifications?.info?.(
        format(
          "RUNYTH-SCRIPTORIA.Economics.Notifications.TypeReset",
          { type: resolveScriptureTypeLabel(fresh?.type ?? typeId) },
          `Reset ${resolveScriptureTypeLabel(fresh?.type ?? typeId)} to provider defaults.`
        )
      );
    } catch (error) {
      console.error(`${MODULE_ID} | Unable to reset economics defaults for "${typeId}".`, error);
      globalThis.ui?.notifications?.error?.(error?.message ?? String(error));
    }
  });
}

function buildRow(row, denominations) {
  const type = row.type;
  const economics = row.effective;
  const provider = type.builtIn
    ? localize("RUNYTH-SCRIPTORIA.Economics.BuiltInProvider", "Runyth Scriptoria (built-in)")
    : `${type.provider}${type.providerVersion ? ` ${type.providerVersion}` : ""}`;
  const unavailable = row.unavailable
    ? `<span class="runyth-scriptoria-economics-settings__unavailable">${escapeHtml(localize("RUNYTH-SCRIPTORIA.Economics.UnavailableType", "Unavailable type"))}</span>`
    : "";
  const options = denominations.map((denomination) => {
    const selected = denomination === economics.price.denomination ? " selected" : "";
    return `<option value="${escapeHtml(denomination)}"${selected}>${escapeHtml(resolveDenominationLabel(denomination))}</option>`;
  }).join("");

  return `
    <div class="runyth-scriptoria-economics-settings__row" role="row" data-economics-type-id="${escapeHtml(type.id)}" data-use-provider-defaults="${row.overridden ? "false" : "true"}">
      <span class="runyth-scriptoria-economics-settings__type"><i class="${escapeHtml(type.icon)}"></i> ${escapeHtml(resolveScriptureTypeLabel(type))}${unavailable}</span>
      <span>${escapeHtml(provider)}</span>
      <input data-field="price-value" type="number" min="0" step="0.01" value="${economics.price.value}">
      <select data-field="price-denomination">${options}</select>
      <input data-field="weight-base" type="number" min="0" step="0.01" value="${economics.weight.base}">
      <input data-field="weight-minimum" type="number" min="0" step="0.01" value="${economics.weight.minimum}">
      <input data-field="weight-maximum" type="number" min="0" step="0.01" value="${economics.weight.maximum}">
      <input data-field="reference-word-count" type="number" min="1" step="1" value="${economics.weight.referenceWordCount}">
      <label class="checkbox runyth-scriptoria-economics-settings__checkbox">
        <input data-field="adjust-content-length" type="checkbox"${economics.weight.adjustForContentLength ? " checked" : ""}>
      </label>
      <button type="button" class="icon" data-action="reset-provider-defaults" title="${escapeHtml(localize("RUNYTH-SCRIPTORIA.Economics.ResetProviderDefault", "Reset to provider default"))}">
        <i class="fa-solid fa-rotate-left"></i>
      </button>
    </div>
  `;
}

function applyRowValues(row, economics) {
  setValue(row, "price-value", economics.price.value);
  setValue(row, "price-denomination", economics.price.denomination);
  setValue(row, "weight-base", economics.weight.base);
  setValue(row, "weight-minimum", economics.weight.minimum);
  setValue(row, "weight-maximum", economics.weight.maximum);
  setValue(row, "reference-word-count", economics.weight.referenceWordCount);
  const adjustment = row.querySelector("[data-field='adjust-content-length']");
  if (adjustment) adjustment.checked = economics.weight.adjustForContentLength;
}

function setValue(row, field, value) {
  const input = row.querySelector(`[data-field='${field}']`);
  if (input) input.value = String(value);
}

function readValue(row, field) {
  return String(row.querySelector(`[data-field='${field}']`)?.value ?? "").trim();
}

function readNumber(row, field) {
  const value = Number(readValue(row, field));
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(format("RUNYTH-SCRIPTORIA.Economics.Errors.FieldNumber", { field }, `${field} must be a finite non-negative number.`));
  }
  return value;
}

function readInteger(row, field) {
  const value = readNumber(row, field);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(format("RUNYTH-SCRIPTORIA.Economics.Errors.FieldInteger", { field }, `${field} must be a positive integer.`));
  }
  return value;
}

function resolveDenominationLabel(denomination) {
  const configured = globalThis.CONFIG?.DND5E?.currencies?.[denomination];
  const key = configured?.abbreviation ?? configured?.label;
  if (key) {
    const localized = globalThis.game?.i18n?.localize?.(key);
    if (localized && localized !== key) return localized;
  }
  return denomination;
}

function normalizeRoot(element) {
  const HTMLElementClass = globalThis.HTMLElement;
  if (typeof HTMLElementClass === "function" && element instanceof HTMLElementClass) return element;
  if (typeof HTMLElementClass === "function" && element?.[0] instanceof HTMLElementClass) return element[0];
  return element?.querySelectorAll ? element : null;
}
