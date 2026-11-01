import {
  MODULE_ID,
  SETTINGS
} from "./constants.mjs";
import {
  createFromSource,
  getAvailableItemTypes,
  getDefaultItemType,
  getDocumentSource,
  getDocumentSourceFormat,
  getDocumentTypeId,
  getScriptoriaData,
  isScriptoriaItem,
  updateFromSource
} from "./documents.mjs";
import {
  ACCEPTED_FILE_TYPES,
  readDocumentFile
} from "./file-import.mjs";
import { debugLog } from "./debug.mjs";
import { escapeHtml } from "./markdown.mjs";
import {
  calculateItemEconomics,
  getSupportedDenominations,
  normalizeEconomicsNumber
} from "./economics.mjs";
import { format, localize } from "./i18n.mjs";
import {
  attachImporterLayoutPersistence,
  getImporterInitialPosition
} from "./importer-layout.mjs";
import { openReader } from "./reader.mjs";
import {
  getScriptureTypeOrFallback,
  listScriptureTypes,
  resolveScriptureTypeLabel
} from "./scripture-types.mjs";

export function openImporter({ item = null } = {}) {
  if (!game.user?.isGM && !item?.isOwner) {
    ui.notifications.warn(localize("SCRIPTORIA.Errors.EditPermission", "Only a Game Master or Item owner can edit Scriptoria documents."));
    return null;
  }

  const editing = isScriptoriaItem(item);
  const existing = editing ? getScriptoriaData(item) : null;
  const defaultAccess = game.settings.get(MODULE_ID, SETTINGS.defaultAccess);
  const values = {
    kind: existing ? getDocumentTypeId(existing) : "book",
    title: editing ? item.name : "",
    author: existing?.author ?? "",
    itemType: editing ? item.type : getDefaultItemType(),
    access: existing?.access ?? defaultAccess,
    removeTitleHeading: existing?.removeTitleHeading ?? true,
    sourceFormat: getDocumentSourceFormat(existing),
    source: getDocumentSource(existing),
    sourceFileName: existing?.sourceFileName ?? ""
  };

  const dialog = new foundry.applications.api.DialogV2({
    window: {
      title: editing
        ? format("SCRIPTORIA.Importer.EditTitle", { name: item.name }, `Edit ${item.name}`)
        : localize("SCRIPTORIA.Importer.CreateTitle", "Create Scriptoria Document"),
      icon: editing ? "fa-solid fa-pen-to-square" : "fa-solid fa-book-medical",
      resizable: true
    },
    classes: ["scriptoria-importer-window"],
    position: getImporterInitialPosition(),
    content: buildImporterContent(values, editing),
    buttons: [
      {
        action: "save",
        label: editing
          ? localize("SCRIPTORIA.Actions.SaveChanges", "Save Changes")
          : localize("SCRIPTORIA.Actions.CreateDocument", "Create Document"),
        icon: editing ? "fa-solid fa-floppy-disk" : "fa-solid fa-book-medical",
        default: true,
        callback: async (_event, button) => {
          if (!button.form?.reportValidity()) return false;

          try {
            const data = readForm(button.form, editing ? item.type : null);
            const result = editing
              ? await updateFromSource(item, data)
              : await createFromSource(data);

            if (!editing && game.settings.get(MODULE_ID, SETTINGS.openAfterCreate)) {
              await openReader(result);
            }
            return result;
          } catch (error) {
            console.error(`${MODULE_ID} | Document import failed.`, error);
            ui.notifications.error(error.message ?? localize("SCRIPTORIA.Errors.SaveDocument", "Unable to save the Scriptoria document."));
            return false;
          }
        }
      },
      {
        action: "cancel",
        label: localize("SCRIPTORIA.Actions.Cancel", "Cancel"),
        icon: "fa-solid fa-xmark"
      }
    ]
  });

  attachImporterLayoutPersistence(dialog);

  const rendered = dialog.render({
    force: true
  });

  Promise.resolve(rendered)
    .then((application) => activateImporterListeners(application ?? dialog))
    .catch((error) => {
      console.error(`${MODULE_ID} | Unable to initialise importer controls.`, error);
    });

  return rendered;
}

export function buildImporterContent(values, editing) {
  const availableTypes = listScriptureTypes({ capability: "creation" })
    .filter((type) => type.capabilities.import === true);
  const selectedType = getScriptureTypeOrFallback(values.kind);
  const kindOptions = [
    ...(selectedType.unavailable
      ? [option(selectedType.id, resolveScriptureTypeLabel(selectedType), values.kind)]
      : []),
    ...availableTypes.map((type) => option(
      type.id,
      resolveScriptureTypeLabel(type),
      values.kind
    ))
  ].join("");
  const itemTypeOptions = getAvailableItemTypes()
    .map((type) => option(type, localizeItemType(type), values.itemType))
    .join("");
  const accessOptions = [
    ["embedded", localize("SCRIPTORIA.Access.WhenHeldOrPlaced", "When held or placed")],
    ["observer", localize("SCRIPTORIA.Access.AllPlayersImmediately", "All players immediately")]
  ].map(([value, label]) => option(value, label, values.access)).join("");
  const sourceFormatOptions = [
    ["markdown", "Markdown"],
    ["html", "HTML"]
  ].map(([value, label]) => option(value, label, values.sourceFormat)).join("");
  const itemTypeDisabled = editing ? " disabled" : "";
  const checked = values.removeTitleHeading ? " checked" : "";
  const formatLabel = values.sourceFormat === "html"
    ? localize("SCRIPTORIA.Importer.HtmlSource", "HTML source")
    : localize("SCRIPTORIA.Importer.MarkdownSource", "Markdown source");
  const placeholder = values.sourceFormat === "html"
    ? localize("SCRIPTORIA.Importer.HtmlPlaceholder", "Paste or upload HTML here.")
    : localize("SCRIPTORIA.Importer.MarkdownPlaceholder", "Paste, write, or upload Markdown here.");
  const uploadedFile = values.sourceFileName
    ? escapeHtml(format("SCRIPTORIA.Importer.LoadedSourceFile", { fileName: values.sourceFileName }, `Loaded source file: ${values.sourceFileName}`))
    : escapeHtml(localize("SCRIPTORIA.Importer.NoFileSelected", "No file selected. Pasting or typing remains available."));
  const economicsContent = editing ? "" : buildImporterEconomicsContent(values);
  debugLog("Importer preparation context", {
    editing,
    kind: values.kind,
    itemType: values.itemType,
    sourceFormat: values.sourceFormat,
    sourceLength: String(values.source ?? "").length,
    hasEconomicsSection: !editing
  });

  return `
    <div class="scriptoria-importer">
      <p class="notes">
        ${escapeHtml(localize("SCRIPTORIA.Importer.Introduction", "Paste content directly or import a local Markdown or HTML file. The first heading becomes the Item name unless a title override is provided. HTML imports are sanitised before display."))}
      </p>

      <div class="scriptoria-importer__upload">
        <label for="scriptoria-file">${escapeHtml(localize("SCRIPTORIA.Importer.ImportFile", "Import document file"))}</label>
        <div class="scriptoria-importer__file-row">
          <input id="scriptoria-file" type="file" accept="${ACCEPTED_FILE_TYPES}">
          <span class="scriptoria-importer__file-status" data-file-status>${uploadedFile}</span>
        </div>
        <p class="hint">${localize("SCRIPTORIA.Importer.AcceptedFiles", "Accepted: <code>.md</code>, <code>.markdown</code>, <code>.html</code>, and <code>.htm</code>, up to 5 MiB. Selecting a file replaces the source field below.")}</p>
      </div>

      <div class="scriptoria-importer__grid">
        <div class="form-group">
          <label for="scriptoria-kind">${escapeHtml(localize("SCRIPTORIA.Importer.ScriptureType", "Scripture type"))}</label>
          <div class="form-fields">
            <select id="scriptoria-kind" name="kind">${kindOptions}</select>
          </div>
          <p class="hint">${escapeHtml(localize("SCRIPTORIA.Importer.ScriptureTypeHint", "Built-in and helper-provided types are resolved through Scriptoria's public registry. Reopen this importer after a late registration."))}</p>
        </div>

        <div class="form-group">
          <label for="scriptoria-source-format">${escapeHtml(localize("SCRIPTORIA.Importer.SourceFormat", "Source format"))}</label>
          <div class="form-fields">
            <select id="scriptoria-source-format" name="sourceFormat">${sourceFormatOptions}</select>
          </div>
          <p class="hint">${escapeHtml(localize("SCRIPTORIA.Importer.SourceFormatHint", "Automatically updated when a supported file is selected."))}</p>
        </div>

        <div class="form-group">
          <label for="scriptoria-item-type">${escapeHtml(localize("SCRIPTORIA.Importer.ItemType", "Foundry Item type"))}</label>
          <div class="form-fields">
            <select id="scriptoria-item-type" name="itemType"${itemTypeDisabled}>${itemTypeOptions}</select>
          </div>
          <p class="hint">${escapeHtml(localize("SCRIPTORIA.Importer.ItemTypeHint", "D&D 5e normally uses a standard loot Item."))}</p>
        </div>

        <div class="form-group">
          <label for="scriptoria-title">${escapeHtml(localize("SCRIPTORIA.Importer.Title", "Title"))}</label>
          <div class="form-fields">
            <input id="scriptoria-title" name="title" type="text" value="${escapeHtml(values.title)}" placeholder="${escapeHtml(localize("SCRIPTORIA.Importer.TitlePlaceholder", "Leave empty to use the document heading"))}">
          </div>
        </div>

        <div class="form-group">
          <label for="scriptoria-author">${escapeHtml(localize("SCRIPTORIA.Importer.Author", "Author or attribution"))}</label>
          <div class="form-fields">
            <input id="scriptoria-author" name="author" type="text" value="${escapeHtml(values.author)}" placeholder="${escapeHtml(localize("SCRIPTORIA.Importer.Optional", "Optional"))}">
          </div>
        </div>

        <div class="form-group">
          <label for="scriptoria-access">${escapeHtml(localize("SCRIPTORIA.Importer.WorldAccess", "World Item access"))}</label>
          <div class="form-fields">
            <select id="scriptoria-access" name="access">${accessOptions}</select>
          </div>
          <p class="hint">${escapeHtml(localize("SCRIPTORIA.Importer.WorldAccessHint", "Actor ownership and generated Scene Journals still control embedded or placed copies."))}</p>
        </div>

        <div class="form-group scriptoria-importer__checkbox">
          <label for="scriptoria-remove-title">${escapeHtml(localize("SCRIPTORIA.Importer.ReadingLayout", "Reading layout"))}</label>
          <div class="form-fields">
            <label class="checkbox">
              <input id="scriptoria-remove-title" name="removeTitleHeading" type="checkbox"${checked}>
              ${escapeHtml(localize("SCRIPTORIA.Importer.RemoveFirstHeading", "Remove the first H1 from the body"))}
            </label>
          </div>
        </div>
      </div>

      ${economicsContent}

      <input name="sourceFileName" type="hidden" value="${escapeHtml(values.sourceFileName)}">

      <div class="scriptoria-importer__source">
        <label for="scriptoria-source" data-source-label>${formatLabel}</label>
        <textarea id="scriptoria-source" name="source" required spellcheck="${values.sourceFormat === "markdown"}" placeholder="${placeholder}">${escapeHtml(values.source)}</textarea>
        <p class="hint" data-source-hint>${escapeHtml(sourceHint(values.sourceFormat))}</p>
      </div>
    </div>
  `;
}

export function readForm(form, fixedItemType) {
  const formData = new FormData(form);
  const economicsValues = readEconomicsValues(form);
  const economicsDirty = readEconomicsDirtyState(form);
  return {
    kind: String(formData.get("kind") ?? "book"),
    title: String(formData.get("title") ?? ""),
    author: String(formData.get("author") ?? ""),
    itemType: fixedItemType ?? String(formData.get("itemType") ?? getDefaultItemType()),
    access: String(formData.get("access") ?? "embedded"),
    removeTitleHeading: formData.has("removeTitleHeading"),
    sourceFormat: String(formData.get("sourceFormat") ?? "markdown"),
    source: String(formData.get("source") ?? ""),
    sourceFileName: String(formData.get("sourceFileName") ?? ""),
    ...(economicsValues ? { economicsValues, economicsDirty } : {})
  };
}

export function activateImporterListeners(application) {
  const root = normalizeRoot(application?.element);
  if (!root) return;

  const fileInput = root.querySelector("#scriptoria-file");
  const formatSelect = root.querySelector("#scriptoria-source-format");
  const source = root.querySelector("#scriptoria-source");
  const sourceFileName = root.querySelector("input[name='sourceFileName']");
  const status = root.querySelector("[data-file-status]");

  formatSelect?.addEventListener("change", () => updateSourceUi(root));
  updateSourceUi(root);
  activateEconomicsListeners(root);

  fileInput?.addEventListener("change", async (event) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const imported = await readDocumentFile(file);
      if (formatSelect) formatSelect.value = imported.sourceFormat;
      if (source) source.value = imported.source;
      if (sourceFileName) sourceFileName.value = imported.fileName;
      if (status) status.textContent = format("SCRIPTORIA.Importer.LoadedFile", { fileName: imported.fileName }, `Loaded ${imported.fileName}`);
      updateSourceUi(root);
      scheduleEconomicsRefresh(root, { immediate: true, updatePrice: false, updateWeight: true });
      source?.focus();
      ui.notifications.info(format("SCRIPTORIA.Notifications.FileLoaded", { fileName: imported.fileName }, `Loaded ${imported.fileName}.`));
    } catch (error) {
      input.value = "";
      console.error(`${MODULE_ID} | File import failed.`, error);
      ui.notifications.error(error.message ?? localize("SCRIPTORIA.Errors.ImportFile", "Unable to import the selected document file."));
    }
  });
}

function updateSourceUi(root) {
  const format = root.querySelector("#scriptoria-source-format")?.value === "html"
    ? "html"
    : "markdown";
  const source = root.querySelector("#scriptoria-source");
  const label = root.querySelector("[data-source-label]");
  const hint = root.querySelector("[data-source-hint]");

  if (label) label.textContent = format === "html"
    ? localize("SCRIPTORIA.Importer.HtmlSource", "HTML source")
    : localize("SCRIPTORIA.Importer.MarkdownSource", "Markdown source");
  if (hint) hint.textContent = sourceHint(format);
  if (source) {
    source.placeholder = format === "html"
      ? localize("SCRIPTORIA.Importer.HtmlPlaceholder", "Paste or upload HTML here.")
      : localize("SCRIPTORIA.Importer.MarkdownPlaceholder", "Paste, write, or upload Markdown here.");
    source.spellcheck = format === "markdown";
  }
}

function sourceHint(format) {
  return format === "html"
    ? localize("SCRIPTORIA.Importer.HtmlHint", "The first <h1> is used as the title, with <title> as a fallback. Scripts, event handlers, embedded frames, forms, and unsafe URLs are removed.")
    : localize("SCRIPTORIA.Importer.MarkdownHint", "The first # H1 or Setext H1 is used as the title. Raw HTML inside Markdown remains escaped.");
}

export function buildImporterEconomicsContent(values) {
  const result = calculateItemEconomics({
    typeId: values.kind,
    content: values.source,
    sourceFormat: values.sourceFormat
  });
  const denominations = getSupportedDenominations();
  const denominationOptions = denominations.map((denomination) => {
    const selected = denomination === result.calculatedPrice.denomination ? " selected" : "";
    return `<option value="${escapeHtml(denomination)}"${selected}>${escapeHtml(denomination)}</option>`;
  }).join("");

  return `
    <fieldset
      class="scriptoria-importer__economics"
      data-economics-section
      data-calculated-price-value="${result.calculatedPrice.value}"
      data-calculated-price-denomination="${escapeHtml(result.calculatedPrice.denomination)}"
      data-calculated-weight="${result.calculatedWeight}"
      data-weight-units="${escapeHtml(result.weightUnits)}"
      data-price-dirty="false"
      data-price-denomination-dirty="false"
      data-weight-dirty="false"
    >
      <legend><i class="fa-solid fa-coins"></i> ${escapeHtml(localize("SCRIPTORIA.Economics.PriceAndWeight", "Price and Weight"))}</legend>
      <div class="scriptoria-importer__economics-summary">
        <p><strong>${escapeHtml(localize("SCRIPTORIA.Economics.EffectiveType", "Effective type"))}:</strong> <span data-economics-type>${escapeHtml(resolveScriptureTypeLabel(values.kind))}</span></p>
        <p><strong>${escapeHtml(localize("SCRIPTORIA.Economics.NormalizedWordCount", "Normalized word count"))}:</strong> <span data-economics-word-count>${result.wordCount}</span></p>
        <p class="hint">${escapeHtml(localize("SCRIPTORIA.Economics.WeightExplanation", "The calculated weight varies modestly with normalized readable text length and remains within the configured type bounds."))}</p>
      </div>

      <div class="scriptoria-importer__economics-grid">
        <section class="scriptoria-importer__economics-card" data-economics-price-card>
          <h3>${escapeHtml(localize("SCRIPTORIA.Economics.Price", "Price"))}</h3>
          <p class="scriptoria-importer__calculated-value">
            ${escapeHtml(localize("SCRIPTORIA.Economics.CalculatedDefault", "Calculated default"))}:
            <strong data-calculated-price>${result.calculatedPrice.value} ${escapeHtml(result.calculatedPrice.denomination)}</strong>
          </p>
          <div class="scriptoria-importer__economics-fields scriptoria-importer__economics-fields--price">
            <div class="scriptoria-importer__economics-field">
              <label for="scriptoria-economics-price-value">${escapeHtml(localize("SCRIPTORIA.Economics.Price", "Price"))}</label>
              <input
                id="scriptoria-economics-price-value"
                name="economics.price.value"
                type="number"
                min="0"
                step="0.01"
                inputmode="decimal"
                value="${result.calculatedPrice.value}"
                required
              >
            </div>
            <div class="scriptoria-importer__economics-field">
              <label for="scriptoria-economics-price-denomination">${escapeHtml(localize("SCRIPTORIA.Economics.Denomination", "Denomination"))}</label>
              <select
                id="scriptoria-economics-price-denomination"
                name="economics.price.denomination"
                required
              >${denominationOptions}</select>
            </div>
          </div>
          <button type="button" data-action="reset-price-default"><i class="fa-solid fa-rotate-left"></i> ${escapeHtml(localize("SCRIPTORIA.Economics.ResetPriceDefault", "Reset Price to Default"))}</button>
        </section>

        <section class="scriptoria-importer__economics-card" data-economics-weight-card>
          <h3>${escapeHtml(localize("SCRIPTORIA.Economics.Weight", "Weight"))}</h3>
          <p class="scriptoria-importer__calculated-value">
            ${escapeHtml(localize("SCRIPTORIA.Economics.CalculatedDefault", "Calculated default"))}:
            <strong data-calculated-weight>${result.calculatedWeight} ${escapeHtml(result.weightUnits)}</strong>
          </p>
          <p class="hint" data-weight-multiplier>${result.multiplier.toFixed(2)}× ${escapeHtml(localize("SCRIPTORIA.Economics.BaseWeight", "base weight"))}</p>
          <div class="scriptoria-importer__economics-fields scriptoria-importer__economics-fields--weight">
            <div class="scriptoria-importer__economics-field">
              <label for="scriptoria-economics-weight-value">${escapeHtml(localize("SCRIPTORIA.Economics.Weight", "Weight"))}</label>
              <input
                id="scriptoria-economics-weight-value"
                name="economics.weight.value"
                type="number"
                min="0"
                step="0.01"
                inputmode="decimal"
                value="${result.calculatedWeight}"
                required
              >
            </div>
            <div class="scriptoria-importer__economics-field scriptoria-importer__economics-unit-field">
              <span class="scriptoria-importer__economics-field-label">${escapeHtml(localize("SCRIPTORIA.Economics.WeightUnit", "Unit"))}</span>
              <output id="scriptoria-economics-weight-units" data-weight-units>${escapeHtml(result.weightUnits)}</output>
            </div>
          </div>
          <button type="button" data-action="recalculate-weight"><i class="fa-solid fa-calculator"></i> ${escapeHtml(localize("SCRIPTORIA.Economics.RecalculateWeight", "Recalculate Weight"))}</button>
        </section>
      </div>

      <div class="scriptoria-importer__economics-final" aria-live="polite">
        <strong>${escapeHtml(localize("SCRIPTORIA.Economics.FinalPrice", "Final price"))}:</strong> <span data-final-price>${result.price.value} ${escapeHtml(result.price.denomination)}</span>
        <strong>${escapeHtml(localize("SCRIPTORIA.Economics.FinalWeight", "Final weight"))}:</strong> <span data-final-weight>${result.weight} ${escapeHtml(result.weightUnits)}</span>
      </div>
    </fieldset>
  `;
}

export function readEconomicsFormState(form) {
  const section = form?.querySelector?.("[data-economics-section]");
  if (!section) return undefined;

  return {
    price: {
      value: readControlValue(form, "economics.price.value"),
      denomination: readControlValue(form, "economics.price.denomination")
    },
    weight: {
      value: readControlValue(form, "economics.weight.value"),
      units: String(section.dataset.weightUnits ?? "").trim() || "lb"
    },
    dirty: readEconomicsDirtyState(form)
  };
}

export function readEconomicsDirtyState(form) {
  const section = form?.querySelector?.("[data-economics-section]");
  if (!section) return undefined;
  return {
    price: section.dataset.priceDirty === "true",
    priceDenomination: section.dataset.priceDenominationDirty === "true",
    weight: section.dataset.weightDirty === "true"
  };
}

export function readEconomicsValues(form) {
  const state = readEconomicsFormState(form);
  if (!state) return undefined;
  debugLog("Importer economics form state", state);

  const priceValue = normalizeEconomicsNumber(state.price.value, {
    field: "price value"
  });
  const denomination = String(state.price.denomination ?? "").trim();
  if (!getSupportedDenominations().includes(denomination)) {
    throw new Error(localize(
      "SCRIPTORIA.Economics.Errors.PriceDenomination",
      `Price denomination "${denomination || "missing"}" is not supported.`
    ));
  }
  const weightValue = normalizeEconomicsNumber(state.weight.value, {
    field: "weight value"
  });
  const units = String(state.weight.units ?? "").trim();
  if (!units) {
    throw new Error(localize("SCRIPTORIA.Economics.Errors.WeightUnitMissing", "Scriptoria could not create the document because the weight unit is missing."));
  }

  const values = {
    price: { value: priceValue, denomination },
    weight: { value: weightValue, units }
  };
  debugLog("Importer economics values", values);
  return values;
}

export function activateEconomicsListeners(root) {
  const section = root.querySelector?.("[data-economics-section]");
  if (!section || section.dataset.scriptoriaListeners === "true") return;
  section.dataset.scriptoriaListeners = "true";
  initialiseEconomicsDirtyState(section);

  const source = root.querySelector("#scriptoria-source");
  const type = root.querySelector("#scriptoria-kind");
  const format = root.querySelector("#scriptoria-source-format");
  const priceValue = root.querySelector("[name='economics.price.value']");
  const priceDenomination = root.querySelector("[name='economics.price.denomination']");
  const weightValue = root.querySelector("[name='economics.weight.value']");

  source?.addEventListener("input", () => scheduleEconomicsRefresh(root, {
    updatePrice: false,
    updateWeight: true
  }));
  type?.addEventListener("change", () => scheduleEconomicsRefresh(root, {
    immediate: true,
    updatePrice: true,
    updateWeight: true
  }));
  format?.addEventListener("change", () => scheduleEconomicsRefresh(root, {
    immediate: true,
    updatePrice: false,
    updateWeight: true
  }));

  const markPriceDirty = () => {
    section.dataset.priceDirty = "true";
    refreshFinalPreview(root);
  };
  priceValue?.addEventListener("input", markPriceDirty);
  priceValue?.addEventListener("change", markPriceDirty);
  priceDenomination?.addEventListener("change", () => {
    section.dataset.priceDenominationDirty = "true";
    refreshFinalPreview(root);
  });
  const markWeightDirty = () => {
    section.dataset.weightDirty = "true";
    refreshFinalPreview(root);
  };
  weightValue?.addEventListener("input", markWeightDirty);
  weightValue?.addEventListener("change", markWeightDirty);

  section.addEventListener("click", (event) => {
    const action = event.target?.closest?.("[data-action]")?.dataset.action;
    if (action === "reset-price-default") {
      event.preventDefault();
      section.dataset.priceDirty = "false";
      section.dataset.priceDenominationDirty = "false";
      refreshEconomics(root, {
        updatePrice: true,
        updateWeight: false,
        forcePrice: true
      });
    }
    if (action === "recalculate-weight") {
      event.preventDefault();
      section.dataset.weightDirty = "false";
      refreshEconomics(root, {
        updatePrice: false,
        updateWeight: true,
        forceWeight: true
      });
    }
  });

  refreshEconomics(root, {
    updatePrice: true,
    updateWeight: true
  });
}

const economicsRefreshTimers = new WeakMap();
export function scheduleEconomicsRefresh(root, {
  immediate = false,
  updatePrice = true,
  updateWeight = true
} = {}) {
  const previous = economicsRefreshTimers.get(root);
  if (previous !== undefined) globalThis.clearTimeout?.(previous);
  if (immediate) {
    economicsRefreshTimers.delete(root);
    refreshEconomics(root, { updatePrice, updateWeight });
    return;
  }
  const timer = globalThis.setTimeout?.(() => {
    economicsRefreshTimers.delete(root);
    refreshEconomics(root, { updatePrice, updateWeight });
  }, 250);
  if (timer !== undefined) economicsRefreshTimers.set(root, timer);
}

export function refreshEconomics(root, {
  updatePrice = true,
  updateWeight = true,
  forcePrice = false,
  forceWeight = false
} = {}) {
  const section = root.querySelector?.("[data-economics-section]");
  if (!section) return undefined;
  initialiseEconomicsDirtyState(section);

  const typeId = String(root.querySelector("#scriptoria-kind")?.value ?? "book");
  const source = String(root.querySelector("#scriptoria-source")?.value ?? "");
  const sourceFormat = root.querySelector("#scriptoria-source-format")?.value === "html" ? "html" : "markdown";
  const result = calculateItemEconomics({ typeId, content: source, sourceFormat });
  section.dataset.calculatedPriceValue = String(result.calculatedPrice.value);
  section.dataset.calculatedPriceDenomination = result.calculatedPrice.denomination;
  section.dataset.calculatedWeight = String(result.calculatedWeight);
  section.dataset.weightUnits = result.weightUnits;

  setText(root, "[data-economics-type]", resolveScriptureTypeLabel(typeId));
  setText(root, "[data-economics-word-count]", result.wordCount);
  setText(root, "[data-calculated-price]", `${result.calculatedPrice.value} ${result.calculatedPrice.denomination}`);
  setText(root, "[data-calculated-weight]", `${result.calculatedWeight} ${result.weightUnits}`);
  setText(root, "[data-weight-multiplier]", `${result.multiplier.toFixed(2)}× ${localize("SCRIPTORIA.Economics.BaseWeight", "base weight")}`);
  setText(root, "[data-weight-units]", result.weightUnits);

  const dirty = readEconomicsDirtyState(root);
  const priceValue = root.querySelector("[name='economics.price.value']");
  const denomination = root.querySelector("[name='economics.price.denomination']");
  const weightValue = root.querySelector("[name='economics.weight.value']");

  if (updatePrice && (forcePrice || !dirty?.price) && priceValue) {
    priceValue.value = String(result.calculatedPrice.value);
  }
  if (updatePrice && (forcePrice || !dirty?.priceDenomination) && denomination) {
    denomination.value = result.calculatedPrice.denomination;
  }
  if (updateWeight && (forceWeight || !dirty?.weight) && weightValue) {
    weightValue.value = String(result.calculatedWeight);
  }

  refreshFinalPreview(root);
  return result;
}

export function refreshFinalPreview(root) {
  const section = root.querySelector?.("[data-economics-section]");
  if (!section) return;
  const price = readControlValue(root, "economics.price.value");
  const denomination = readControlValue(root, "economics.price.denomination");
  const weight = readControlValue(root, "economics.weight.value");
  setText(root, "[data-final-price]", formatPreviewValue(price, denomination));
  setText(root, "[data-final-weight]", formatPreviewValue(weight, section.dataset.weightUnits || "lb"));
}

function initialiseEconomicsDirtyState(section) {
  section.dataset.priceDirty ??= "false";
  section.dataset.priceDenominationDirty ??= "false";
  section.dataset.weightDirty ??= "false";
}

function readControlValue(form, name) {
  const control = form.querySelector?.(`[name='${name}']`);
  return control ? String(control.value ?? "") : "";
}

function formatPreviewValue(value, unit) {
  const raw = String(value ?? "").trim();
  return `${raw || "—"} ${String(unit ?? "").trim()}`.trim();
}

function setText(root, selector, value) {
  const element = root.querySelector(selector);
  if (element) element.textContent = String(value);
}

function option(value, label, selectedValue) {
  const selected = value === selectedValue ? " selected" : "";
  return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(label)}</option>`;
}

function localizeItemType(type) {
  const localized = game.i18n.localize(`TYPES.Item.${type}`);
  return localized === `TYPES.Item.${type}` ? type : localized;
}

function normalizeRoot(element) {
  const HTMLElementClass = globalThis.HTMLElement;
  if (typeof HTMLElementClass !== "function") return null;
  if (element instanceof HTMLElementClass) return element;
  return element?.[0] instanceof HTMLElementClass ? element[0] : null;
}
