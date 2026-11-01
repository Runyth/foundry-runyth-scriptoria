import {
  MODULE_ID,
  SETTINGS
} from "./constants.mjs";
import {
  ECONOMICS_SCHEMA_VERSION,
  SAFE_FALLBACK_ECONOMICS,
  calculateBoundedWeight,
  countNormalizedWords,
  getDefaultWeightUnit,
  getSupportedDenominations,
  mergeEconomics,
  normalizeTypeEconomics,
  validateTypeEconomics
} from "./economics-core.mjs";
import { debugLog } from "./debug.mjs";
import { format, localize } from "./i18n.mjs";
import {
  getScriptureType,
  getScriptureTypeOrFallback,
  getScriptureTypes
} from "./scripture-types.mjs";

export {
  ECONOMICS_SCHEMA_VERSION,
  countNormalizedWords,
  getSupportedDenominations,
  validateTypeEconomics
};


export class EconomicsValueError extends Error {
  constructor(message, {
    code = "INVALID_ECONOMICS_VALUE",
    field = "",
    received = undefined
  } = {}) {
    super(message);
    this.name = "EconomicsValueError";
    this.code = code;
    this.field = field;
    this.received = received;
  }
}

export function normalizeEconomicsNumber(rawValue, {
  field = "value",
  minimum = 0,
  required = true
} = {}) {
  if (rawValue === undefined || rawValue === null) {
    if (!required) return undefined;
    throw invalidEconomicsNumber(field, rawValue, "is missing");
  }

  const normalizedRaw = typeof rawValue === "string"
    ? rawValue.trim()
    : rawValue;
  if (normalizedRaw === "") {
    if (!required) return undefined;
    throw invalidEconomicsNumber(field, rawValue, "is empty");
  }

  // Number inputs expose a locale-independent decimal string in `value`. The
  // comma fallback also supports values collected by tests or integrations.
  const candidate = typeof normalizedRaw === "string"
    && normalizedRaw.includes(",")
    && !normalizedRaw.includes(".")
    ? normalizedRaw.replace(",", ".")
    : normalizedRaw;
  const numericValue = typeof candidate === "number"
    ? candidate
    : Number(candidate);

  if (!Number.isFinite(numericValue)) {
    throw invalidEconomicsNumber(field, rawValue, "is not a finite number");
  }
  if (numericValue < minimum) {
    throw invalidEconomicsNumber(
      field,
      rawValue,
      `must be at least ${minimum}`
    );
  }
  return numericValue;
}

export function validateResolvedItemEconomics(result) {
  const priceValue = result?.price?.value;
  const denomination = String(result?.price?.denomination ?? "").trim();
  const weightValue = result?.weight;
  const weightUnits = String(result?.weightUnits ?? "").trim();

  normalizeEconomicsNumber(priceValue, {
    field: "resolved price value"
  });
  if (!getSupportedDenominations().includes(denomination)) {
    throw new EconomicsValueError(
      format(
        "SCRIPTORIA.Economics.Errors.InvalidResolvedDenomination",
        { received: formatReceived(result?.price?.denomination) },
        `Scriptoria could not create the document because the resolved price denomination is invalid. Received: ${formatReceived(result?.price?.denomination)}.`
      ),
      {
        code: "INVALID_RESOLVED_DENOMINATION",
        field: "price.denomination",
        received: result?.price?.denomination
      }
    );
  }
  normalizeEconomicsNumber(weightValue, {
    field: "resolved weight value"
  });
  if (!weightUnits) {
    throw new EconomicsValueError(
      format(
        "SCRIPTORIA.Economics.Errors.InvalidResolvedWeightUnit",
        { received: formatReceived(result?.weightUnits) },
        `Scriptoria could not create the document because the resolved weight unit is invalid. Received: ${formatReceived(result?.weightUnits)}.`
      ),
      {
        code: "INVALID_RESOLVED_WEIGHT_UNITS",
        field: "weight.units",
        received: result?.weightUnits
      }
    );
  }
  return result;
}

export function getTypeEconomics(typeId) {
  const type = getScriptureType(String(typeId ?? ""));
  const defaults = type?.economics ?? SAFE_FALLBACK_ECONOMICS;
  return immutableCopy(defaults);
}

export function getEconomicsWorldOverrides() {
  let stored = {};
  try {
    stored = globalThis.game?.settings?.get?.(MODULE_ID, SETTINGS.itemEconomicsOverrides) ?? {};
  } catch {
    stored = {};
  }
  return immutableCopy(normalizeStoredOverrides(stored));
}

export async function setEconomicsWorldOverrides(overrides) {
  if (!globalThis.game?.user?.isGM) {
    throw new Error(localize("SCRIPTORIA.Economics.Errors.GmOnly", "Only a Game Master can change Scriptoria item economics defaults."));
  }
  const normalized = normalizeStoredOverrides(overrides);
  await globalThis.game.settings.set(MODULE_ID, SETTINGS.itemEconomicsOverrides, normalized);
  return immutableCopy(normalized);
}

export async function setTypeEconomicsOverride(typeId, economics) {
  const id = String(typeId ?? "").trim();
  if (!id) throw new Error(localize("SCRIPTORIA.Economics.Errors.TypeIdRequired", "A scripture type ID is required."));
  const type = getScriptureType(id);
  const providerId = type?.provider ?? deriveProviderId(id) ?? MODULE_ID;
  const providerDefaults = type?.economics ?? SAFE_FALLBACK_ECONOMICS;
  const normalized = normalizeTypeEconomics(economics, {
    typeId: id,
    providerId,
    fallback: providerDefaults,
    allowPartial: true
  });
  const overrides = mutableCopy(getEconomicsWorldOverrides());
  overrides[id] = normalized;
  return setEconomicsWorldOverrides(overrides);
}

export async function resetTypeEconomicsOverride(typeId) {
  const id = String(typeId ?? "").trim();
  const overrides = mutableCopy(getEconomicsWorldOverrides());
  delete overrides[id];
  return setEconomicsWorldOverrides(overrides);
}

export function getEffectiveTypeEconomics(typeId) {
  const id = String(typeId ?? "").trim();
  const type = getScriptureType(id);
  const providerDefaults = type?.economics ?? SAFE_FALLBACK_ECONOMICS;
  const stored = getEconomicsWorldOverrides();
  const worldOverride = stored[id];
  if (!worldOverride) return immutableCopy(providerDefaults);

  return immutableCopy(mergeEconomics(providerDefaults, worldOverride, {
    typeId: id,
    providerId: type?.provider ?? deriveProviderId(id) ?? MODULE_ID
  }));
}

export function calculateItemEconomics({
  typeId,
  content = "",
  sourceFormat = "markdown",
  overrides = {}
} = {}) {
  const id = String(typeId ?? "book").trim() || "book";
  const type = getScriptureTypeOrFallback(id);
  const providerDefaults = type.economics ?? SAFE_FALLBACK_ECONOMICS;
  const storedOverrides = getEconomicsWorldOverrides();
  const worldOverride = storedOverrides[id];
  const effectiveDefaults = worldOverride
    ? mergeEconomics(providerDefaults, worldOverride, {
      typeId: id,
      providerId: type.provider || MODULE_ID
    })
    : providerDefaults;
  const wordCount = countNormalizedWords(content, { sourceFormat });
  const weightCalculation = calculateBoundedWeight(effectiveDefaults.weight, wordCount);
  const normalizedOverrides = normalizeCreationOverrides(overrides, effectiveDefaults);
  const calculatedPrice = immutableCopy(effectiveDefaults.price);
  const calculatedWeight = weightCalculation.value;
  const finalPrice = normalizedOverrides.price ?? calculatedPrice;
  const finalWeight = normalizedOverrides.weight ?? calculatedWeight;

  const result = immutableCopy({
    schemaVersion: ECONOMICS_SCHEMA_VERSION,
    typeId: id,
    wordCount,
    providerDefaults: immutableCopy(providerDefaults),
    worldOverride: worldOverride ? immutableCopy(worldOverride) : undefined,
    effectiveDefaults: immutableCopy(effectiveDefaults),
    calculatedPrice,
    calculatedWeight,
    price: immutableCopy(finalPrice),
    weight: finalWeight,
    weightUnits: getDefaultWeightUnit(),
    multiplier: weightCalculation.multiplier,
    priceOverridden: Boolean(normalizedOverrides.price),
    weightOverridden: normalizedOverrides.weight !== undefined
  });
  debugLog("Economics calculation", {
    typeId: id,
    wordCount,
    providerDefaults,
    worldOverride,
    effectiveDefaults,
    calculatedPrice,
    calculatedWeight,
    finalPrice,
    finalWeight,
    weightUnits: result.weightUnits,
    multiplier: result.multiplier,
    priceOverridden: result.priceOverridden,
    weightOverridden: result.weightOverridden
  });
  return validateResolvedItemEconomics(result);
}

export function resolveItemEconomicsValues({
  typeId,
  content = "",
  sourceFormat = "markdown",
  values,
  dirty = {}
} = {}) {
  const calculated = calculateItemEconomics({
    typeId,
    content,
    sourceFormat
  });
  if (values === undefined || values === null) return calculated;

  const priceValue = normalizeEconomicsNumber(values?.price?.value, {
    field: "price value"
  });
  const denomination = String(values?.price?.denomination ?? "").trim();
  if (!getSupportedDenominations().includes(denomination)) {
    throw new EconomicsValueError(
      format(
        "SCRIPTORIA.Economics.Errors.InvalidPriceDenomination",
        { received: formatReceived(values?.price?.denomination) },
        `Scriptoria could not create the document because the price denomination is invalid. Received: ${formatReceived(values?.price?.denomination)}.`
      ),
      {
        code: "INVALID_RESOLVED_DENOMINATION",
        field: "price.denomination",
        received: values?.price?.denomination
      }
    );
  }
  const weightValue = normalizeEconomicsNumber(values?.weight?.value, {
    field: "weight value"
  });
  const weightUnits = String(values?.weight?.units ?? calculated.weightUnits).trim();
  if (!weightUnits || weightUnits !== calculated.weightUnits) {
    throw new EconomicsValueError(
      format(
        "SCRIPTORIA.Economics.Errors.InvalidWeightUnit",
        { received: formatReceived(values?.weight?.units) },
        `Scriptoria could not create the document because the weight unit is invalid. Received: ${formatReceived(values?.weight?.units)}.`
      ),
      {
        code: "INVALID_RESOLVED_WEIGHT_UNITS",
        field: "weight.units",
        received: values?.weight?.units
      }
    );
  }

  const result = immutableCopy({
    ...calculated,
    price: {
      value: Math.round((priceValue + Number.EPSILON) * 100) / 100,
      denomination
    },
    weight: Math.round((weightValue + Number.EPSILON) * 100) / 100,
    weightUnits,
    priceOverridden: dirty?.price === true || dirty?.priceDenomination === true,
    weightOverridden: dirty?.weight === true
  });
  debugLog("Resolved importer economics values", {
    typeId: result.typeId,
    price: result.price,
    weight: result.weight,
    weightUnits: result.weightUnits,
    priceDirty: result.priceOverridden,
    weightDirty: result.weightOverridden
  });
  return validateResolvedItemEconomics(result);
}

export function buildEconomicsFlagData(result, {
  legacy = false
} = {}) {
  if (!result) {
    return immutableCopy({
      schemaVersion: ECONOMICS_SCHEMA_VERSION,
      status: legacy ? "legacy" : "unknown"
    });
  }
  return immutableCopy({
    schemaVersion: ECONOMICS_SCHEMA_VERSION,
    status: "calculated",
    typeId: result.typeId,
    normalizedWordCount: result.wordCount,
    calculatedPrice: result.calculatedPrice,
    calculatedWeight: result.calculatedWeight,
    weightMultiplier: result.multiplier,
    weightUnits: result.weightUnits,
    priceOverridden: result.priceOverridden,
    weightOverridden: result.weightOverridden,
    createdPrice: result.price,
    createdWeight: result.weight
  });
}

export function getKnownEconomicsRows() {
  const types = getScriptureTypes();
  const overrides = getEconomicsWorldOverrides();
  const rows = types.map((type) => ({
    type,
    providerDefaults: type.economics ?? SAFE_FALLBACK_ECONOMICS,
    effective: getEffectiveTypeEconomics(type.id),
    overridden: Object.hasOwn(overrides, type.id),
    unavailable: false
  }));

  const known = new Set(rows.map((row) => row.type.id));
  for (const [id, economics] of Object.entries(overrides)) {
    if (known.has(id)) continue;
    const type = getScriptureTypeOrFallback(id);
    rows.push({
      type,
      providerDefaults: SAFE_FALLBACK_ECONOMICS,
      effective: economics,
      overridden: true,
      unavailable: true
    });
  }

  return Object.freeze(rows.map((row) => immutableCopy(row)));
}

export function buildSystemEconomicsData(result, {
  itemType = "loot"
} = {}) {
  if (!result) return undefined;
  validateResolvedItemEconomics(result);
  const adapter = resolveSystemAdapter(itemType);
  if (!adapter) return undefined;
  return adapter(result);
}

function resolveSystemAdapter(itemType) {
  if (globalThis.game?.system?.id !== "dnd5e") {
    warnUnsupportedSystemOnce();
    return null;
  }
  if (!supportsDnd5ePhysicalFields(itemType)) {
    console.warn(`${MODULE_ID} | D&D 5e Item type "${itemType}" does not expose physical price and weight fields; Scriptoria retained economics metadata without writing invalid system data.`);
    return null;
  }
  return (result) => ({
    price: {
      value: result.price.value,
      denomination: result.price.denomination
    },
    weight: {
      value: result.weight,
      units: result.weightUnits
    }
  });
}

function supportsDnd5ePhysicalFields(itemType) {
  const model = globalThis.CONFIG?.Item?.dataModels?.[itemType];
  const schema = model?.schema;
  if (typeof schema?.getField === "function") {
    const nestedFields = [
      "price.value",
      "price.denomination",
      "weight.value",
      "weight.units"
    ].map((path) => schema.getField(path));
    if (nestedFields.some(Boolean)) return nestedFields.every(Boolean);
  }
  if (typeof schema?.has === "function") {
    return schema.has("price") && schema.has("weight");
  }
  // All of these D&D 5e item data models mix in PhysicalItemTemplate.
  return new Set([
    "consumable",
    "container",
    "equipment",
    "facility",
    "loot",
    "tool",
    "weapon"
  ]).has(String(itemType));
}

let unsupportedSystemWarned = false;
function warnUnsupportedSystemOnce() {
  if (unsupportedSystemWarned) return;
  unsupportedSystemWarned = true;
  console.warn(`${MODULE_ID} | No item economics adapter is available for system "${globalThis.game?.system?.id ?? "unknown"}". Document creation continues without writing system price or weight fields.`);
  globalThis.ui?.notifications?.warn?.(localize("SCRIPTORIA.Economics.Errors.UnsupportedSystem", "Scriptoria could not write item price or weight because the active game system is unsupported."));
}

function normalizeCreationOverrides(overrides, effectiveDefaults) {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    return immutableCopy({ price: undefined, weight: undefined });
  }
  let price;
  if (overrides.price !== undefined && overrides.price !== null) {
    const normalized = normalizeTypeEconomics({
      price: overrides.price,
      weight: effectiveDefaults.weight
    }, {
      fallback: effectiveDefaults,
      allowPartial: true
    });
    price = normalized.price;
  }
  let weight;
  if (overrides.weight !== undefined && overrides.weight !== null) {
    const number = normalizeEconomicsNumber(overrides.weight, {
      field: "weight override",
      required: false
    });
    if (number !== undefined) {
      weight = Math.round((number + Number.EPSILON) * 100) / 100;
    }
  }
  return immutableCopy({ price, weight });
}

function normalizeStoredOverrides(stored) {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
  const result = {};
  for (const [typeId, economics] of Object.entries(stored)) {
    if (!typeId || !economics || typeof economics !== "object" || Array.isArray(economics)) continue;
    try {
      const type = getScriptureType(typeId);
      result[typeId] = normalizeTypeEconomics(economics, {
        typeId,
        providerId: type?.provider ?? deriveProviderId(typeId) ?? MODULE_ID,
        fallback: type?.economics ?? SAFE_FALLBACK_ECONOMICS,
        allowPartial: true
      });
    } catch (error) {
      console.error(`${MODULE_ID} | Ignoring invalid stored economics override for "${typeId}".`, error);
    }
  }
  return result;
}

function deriveProviderId(typeId) {
  const value = String(typeId ?? "");
  return value.includes(".") ? value.split(".", 1)[0] : MODULE_ID;
}

function invalidEconomicsNumber(field, received, reason) {
  const localizedField = localizeEconomicsField(field);
  const localizedReason = localizeEconomicsReason(reason);
  const rendered = format(
    "SCRIPTORIA.Economics.Errors.InvalidNumber",
    {
      field: localizedField,
      reason: localizedReason,
      received: formatReceived(received)
    },
    `Scriptoria could not create the document because the ${field} ${reason}. Received: ${formatReceived(received)}.`
  );
  return new EconomicsValueError(rendered, {
    code: "INVALID_ECONOMICS_NUMBER",
    field,
    received
  });
}

function localizeEconomicsField(field) {
  const key = {
    "value": "Value",
    "price value": "PriceValue",
    "weight value": "WeightValue",
    "resolved price value": "ResolvedPriceValue",
    "resolved weight value": "ResolvedWeightValue",
    "price override": "PriceOverrideValue",
    "weight override": "WeightOverrideValue"
  }[field];
  return key
    ? localize(`SCRIPTORIA.Economics.Fields.${key}`, field)
    : field;
}

function localizeEconomicsReason(reason) {
  if (reason === "is missing") {
    return localize("SCRIPTORIA.Economics.Reasons.Missing", reason);
  }
  if (reason === "is empty") {
    return localize("SCRIPTORIA.Economics.Reasons.Empty", reason);
  }
  if (reason === "is not a finite number") {
    return localize("SCRIPTORIA.Economics.Reasons.NotFinite", reason);
  }
  const minimum = /^must be at least (.+)$/.exec(reason)?.[1];
  if (minimum !== undefined) {
    return format(
      "SCRIPTORIA.Economics.Reasons.Minimum",
      { minimum },
      reason
    );
  }
  return reason;
}

function formatReceived(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "number" && Number.isNaN(value)) return "NaN";
  if (value === Infinity) return "Infinity";
  if (value === -Infinity) return "-Infinity";
  return JSON.stringify(value);
}

function immutableCopy(value) {
  return deepFreeze(mutableCopy(value));
}

function mutableCopy(value) {
  if (Array.isArray(value)) return value.map(mutableCopy);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, mutableCopy(nested)])
    );
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
