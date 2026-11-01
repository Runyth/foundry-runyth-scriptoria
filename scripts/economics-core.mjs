// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { MODULE_ID } from "./constants.mjs";

export const ECONOMICS_SCHEMA_VERSION = 1;

export const WEIGHT_BANDS = Object.freeze([
  Object.freeze({ maximumRatio: 0.10, multiplier: 0.80 }),
  Object.freeze({ maximumRatio: 0.35, multiplier: 0.90 }),
  Object.freeze({ maximumRatio: 1.50, multiplier: 1.00 }),
  Object.freeze({ maximumRatio: 3.00, multiplier: 1.08 }),
  Object.freeze({ maximumRatio: 7.00, multiplier: 1.16 }),
  Object.freeze({ maximumRatio: Number.POSITIVE_INFINITY, multiplier: 1.25 })
]);

export const SAFE_FALLBACK_ECONOMICS = deepFreeze({
  price: {
    value: 0,
    denomination: "gp"
  },
  weight: {
    base: 1,
    minimum: 0.8,
    maximum: 1.25,
    referenceWordCount: 2_000,
    adjustForContentLength: true
  }
});

const ECONOMICS_KEYS = new Set(["price", "weight"]);
const PRICE_KEYS = new Set(["value", "denomination"]);
const WEIGHT_KEYS = new Set([
  "base",
  "minimum",
  "maximum",
  "referenceWordCount",
  "adjustForContentLength"
]);
const BLOCKED_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const DENOMINATION_PATTERN = /^[a-z][a-z0-9-]*$/;

export class TypeEconomicsValidationError extends Error {
  constructor(message, {
    code = "INVALID_ECONOMICS",
    typeId = "",
    providerId = ""
  } = {}) {
    super(message);
    this.name = "TypeEconomicsValidationError";
    this.code = code;
    this.typeId = typeId;
    this.providerId = providerId;
  }
}

export function normalizeTypeEconomics(economics, {
  typeId = "",
  providerId = MODULE_ID,
  fallback = SAFE_FALLBACK_ECONOMICS,
  allowPartial = false
} = {}) {
  const context = { typeId, providerId };
  if (economics === undefined || economics === null) {
    return deepFreeze(cloneSafe(fallback));
  }
  assertPlainRecord(economics, "economics", context);
  rejectKeys(economics, ECONOMICS_KEYS, "economics", context);

  const normalizedFallback = cloneSafe(fallback);
  const price = normalizePrice(economics.price, {
    ...context,
    fallback: normalizedFallback.price,
    allowPartial
  });
  const weight = normalizeWeight(economics.weight, {
    ...context,
    fallback: normalizedFallback.weight,
    allowPartial
  });

  return deepFreeze({ price, weight });
}

export function validateTypeEconomics(economics, options = {}) {
  try {
    const normalized = normalizeTypeEconomics(economics, options);
    return deepFreeze({
      ok: true,
      value: cloneSafe(normalized),
      error: undefined
    });
  } catch (error) {
    const normalized = normalizeEconomicsError(error, options);
    return deepFreeze({
      ok: false,
      value: undefined,
      error: deepFreeze({
        name: normalized.name,
        code: normalized.code,
        message: normalized.message,
        typeId: normalized.typeId,
        providerId: normalized.providerId
      })
    });
  }
}

export function mergeEconomics(base, override, options = {}) {
  const normalizedBase = normalizeTypeEconomics(base, options);
  if (override === undefined || override === null) return normalizedBase;
  assertPlainRecord(override, "economics override", options);
  rejectKeys(override, ECONOMICS_KEYS, "economics override", options);

  const merged = {
    price: {
      ...cloneSafe(normalizedBase.price),
      ...(isPlainRecord(override.price) ? cloneSafe(override.price) : {})
    },
    weight: {
      ...cloneSafe(normalizedBase.weight),
      ...(isPlainRecord(override.weight) ? cloneSafe(override.weight) : {})
    }
  };
  return normalizeTypeEconomics(merged, {
    ...options,
    fallback: normalizedBase
  });
}

export function normalizeReadableText(content, {
  sourceFormat = "markdown"
} = {}) {
  const raw = String(content ?? "");
  const format = sourceFormat === "html" ? "html" : "markdown";
  const withoutMetadata = format === "markdown"
    ? stripMarkdownFrontmatter(raw)
    : raw;
  const readable = format === "html"
    ? htmlToReadableText(withoutMetadata)
    : markdownToReadableText(withoutMetadata);
  return decodeHtmlEntities(readable)
    .replace(/[\u200B-\u200D\u2060\uFEFF]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

export function countNormalizedWords(content, options = {}) {
  const text = normalizeReadableText(content, options);
  if (!text) return 0;

  if (typeof Intl?.Segmenter === "function") {
    try {
      const segmenter = new Intl.Segmenter(undefined, {
        granularity: "word"
      });
      let count = 0;
      for (const segment of segmenter.segment(text)) {
        if (segment.isWordLike) count += 1;
      }
      return count;
    } catch {
      // The Unicode-aware regular expression below is the deterministic fallback.
    }
  }

  return text.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

export function getWeightMultiplier(wordCount, referenceWordCount) {
  const words = finiteNonNegative(wordCount, "word count", {});
  const reference = finitePositive(referenceWordCount, "reference word count", {});
  const ratio = words / reference;
  return WEIGHT_BANDS.find((band) => ratio <= band.maximumRatio)?.multiplier ?? 1.25;
}

export function calculateBoundedWeight(weight, wordCount) {
  const normalized = normalizeWeight(weight, {
    typeId: "",
    providerId: MODULE_ID,
    fallback: SAFE_FALLBACK_ECONOMICS.weight,
    allowPartial: false
  });
  const multiplier = normalized.adjustForContentLength
    ? getWeightMultiplier(wordCount, normalized.referenceWordCount)
    : 1;
  const unbounded = normalized.base * multiplier;
  const calculated = clamp(unbounded, normalized.minimum, normalized.maximum);
  return deepFreeze({
    value: roundWeight(calculated),
    multiplier,
    unbounded: roundWeight(unbounded),
    minimum: normalized.minimum,
    maximum: normalized.maximum
  });
}

export function getSupportedDenominations() {
  const configured = globalThis.CONFIG?.DND5E?.currencies;
  if (configured && typeof configured === "object") {
    const denominations = Object.keys(configured).filter((key) => DENOMINATION_PATTERN.test(key));
    if (denominations.length) return Object.freeze(denominations);
  }
  return Object.freeze(["pp", "gp", "ep", "sp", "cp"]);
}

export function getDefaultWeightUnit() {
  const defaultUnits = globalThis.CONFIG?.DND5E?.defaultUnits?.weight;
  if (defaultUnits && typeof defaultUnits === "object") {
    let metric = false;
    try {
      metric = Boolean(globalThis.game?.settings?.get?.("dnd5e", "metricWeightUnits"));
    } catch {
      metric = false;
    }
    return String(defaultUnits[metric ? "metric" : "imperial"] ?? (metric ? "kg" : "lb"));
  }
  return "lb";
}

export function roundWeight(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function normalizePrice(value, {
  typeId,
  providerId,
  fallback,
  allowPartial
}) {
  if (value === undefined || value === null) {
    if (allowPartial) return deepFreeze(cloneSafe(fallback));
    return deepFreeze(cloneSafe(fallback));
  }
  const context = { typeId, providerId };
  assertPlainRecord(value, "economics.price", context);
  rejectKeys(value, PRICE_KEYS, "economics.price", context);

  const priceValue = value.value ?? fallback.value;
  const denomination = value.denomination ?? fallback.denomination;
  const normalizedValue = finiteNonNegative(priceValue, "price.value", context);
  const normalizedDenomination = normalizeDenomination(denomination, context);
  return deepFreeze({
    value: roundMoney(normalizedValue),
    denomination: normalizedDenomination
  });
}

function normalizeWeight(value, {
  typeId,
  providerId,
  fallback,
  allowPartial
}) {
  if (value === undefined || value === null) {
    return deepFreeze(cloneSafe(fallback));
  }
  const context = { typeId, providerId };
  assertPlainRecord(value, "economics.weight", context);
  rejectKeys(value, WEIGHT_KEYS, "economics.weight", context);

  const base = finiteNonNegative(value.base ?? fallback.base, "weight.base", context);
  const minimum = finiteNonNegative(value.minimum ?? fallback.minimum, "weight.minimum", context);
  const maximum = finiteNonNegative(value.maximum ?? fallback.maximum, "weight.maximum", context);
  const referenceWordCount = finitePositiveInteger(
    value.referenceWordCount ?? fallback.referenceWordCount,
    "weight.referenceWordCount",
    context
  );
  const adjustForContentLength = value.adjustForContentLength ?? fallback.adjustForContentLength;

  if (typeof adjustForContentLength !== "boolean") {
    throw economicsError(
      `Scripture type "${typeId || "unknown"}" from provider "${providerId || "unknown"}" weight.adjustForContentLength must be boolean.`,
      "INVALID_WEIGHT_ADJUSTMENT",
      context
    );
  }
  if (minimum > maximum) {
    throw economicsError(
      `Scripture type "${typeId || "unknown"}" from provider "${providerId || "unknown"}" has minimum weight ${minimum} greater than maximum weight ${maximum}.`,
      "INVALID_WEIGHT_BOUNDS",
      context
    );
  }
  if (base < minimum || base > maximum) {
    throw economicsError(
      `Scripture type "${typeId || "unknown"}" from provider "${providerId || "unknown"}" base weight ${base} must be between ${minimum} and ${maximum}.`,
      "BASE_WEIGHT_OUT_OF_BOUNDS",
      context
    );
  }

  return deepFreeze({
    base: roundWeight(base),
    minimum: roundWeight(minimum),
    maximum: roundWeight(maximum),
    referenceWordCount,
    adjustForContentLength
  });
}

function normalizeDenomination(value, context) {
  const denomination = String(value ?? "").trim();
  if (!DENOMINATION_PATTERN.test(denomination)) {
    throw economicsError(
      `Scripture type "${context.typeId || "unknown"}" from provider "${context.providerId || "unknown"}" has invalid price denomination "${denomination || "missing"}".`,
      "INVALID_DENOMINATION",
      context
    );
  }
  const supported = getSupportedDenominations();
  if (!supported.includes(denomination)) {
    throw economicsError(
      `Scripture type "${context.typeId || "unknown"}" from provider "${context.providerId || "unknown"}" uses unsupported denomination "${denomination}". Supported values: ${supported.join(", ")}.`,
      "UNSUPPORTED_DENOMINATION",
      context
    );
  }
  return denomination;
}

function markdownToReadableText(source) {
  return String(source)
    .replace(/```[^\n]*\n([\s\S]*?)```/g, "$1")
    .replace(/~~~[^\n]*\n([\s\S]*?)~~~/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
    .replace(/^\s*\[[^\]]+\]:\s+\S+.*$/gm, "")
    .replace(/^\s{0,3}(?:#{1,6}|>|[-+*]|\d+[.)])\s+/gm, "")
    .replace(/^\s*[-*_]{3,}\s*$/gm, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/[`*_~]/g, "")
    .replace(/\\([\\`*_{}\[\]()#+\-.!>])/g, "$1");
}

function htmlToReadableText(source) {
  const raw = String(source);
  if (typeof globalThis.DOMParser === "function") {
    try {
      const document = new globalThis.DOMParser().parseFromString(raw, "text/html");
      document.querySelectorAll?.("script, style, template, noscript, svg, math, head, form, button, input, select, textarea").forEach((node) => node.remove());
      return document.body?.textContent ?? document.documentElement?.textContent ?? "";
    } catch {
      // Fall through to the deterministic non-DOM implementation.
    }
  }
  return raw
    .replace(/<(script|style|template|noscript|svg|math|head|form)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<[^>]+>/g, " ");
}

function stripMarkdownFrontmatter(source) {
  const text = String(source).replace(/^\uFEFF/, "");
  if (!/^---\s*\r?\n/.test(text)) return text;
  return text.replace(/^---\s*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)\s*(?:\r?\n|$)/, "");
}

function decodeHtmlEntities(value) {
  const text = String(value);
  if (typeof globalThis.DOMParser === "function") {
    try {
      const document = new globalThis.DOMParser().parseFromString(`<body>${text}</body>`, "text/html");
      return document.body?.textContent ?? text;
    } catch {
      // Use the safe finite entity table below.
    }
  }
  const named = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"'
  };
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === "#") {
      const hexadecimal = entity[1]?.toLowerCase() === "x";
      const raw = entity.slice(hexadecimal ? 2 : 1);
      const codePoint = Number.parseInt(raw, hexadecimal ? 16 : 10);
      if (Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff) {
        try {
          return String.fromCodePoint(codePoint);
        } catch {
          return match;
        }
      }
      return match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

function assertPlainRecord(value, field, context) {
  if (!isPlainRecord(value)) {
    throw economicsError(
      `Scripture type "${context.typeId || "unknown"}" from provider "${context.providerId || "unknown"}" ${field} must be a plain object.`,
      "ECONOMICS_NOT_OBJECT",
      context
    );
  }
}

function rejectKeys(value, allowed, field, context) {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || BLOCKED_KEYS.has(key) || !allowed.has(key)) {
      throw economicsError(
        `Scripture type "${context.typeId || "unknown"}" from provider "${context.providerId || "unknown"}" ${field} contains unsupported field "${String(key)}".`,
        "UNSUPPORTED_ECONOMICS_FIELD",
        context
      );
    }
    const property = Object.getOwnPropertyDescriptor(value, key);
    if (!property || !("value" in property)) {
      throw economicsError(
        `Scripture type "${context.typeId || "unknown"}" from provider "${context.providerId || "unknown"}" ${field}.${key} must be a plain data property.`,
        "ECONOMICS_ACCESSOR_REJECTED",
        context
      );
    }
  }
}

function finiteNonNegative(value, field, context) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw economicsError(
      `Scripture type "${context.typeId || "unknown"}" from provider "${context.providerId || "unknown"}" ${field} must be a finite non-negative number.`,
      "INVALID_ECONOMICS_NUMBER",
      context
    );
  }
  return number;
}

function finitePositive(value, field, context) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw economicsError(
      `Scripture type "${context.typeId || "unknown"}" from provider "${context.providerId || "unknown"}" ${field} must be a finite positive number.`,
      "INVALID_REFERENCE_WORD_COUNT",
      context
    );
  }
  return number;
}

function finitePositiveInteger(value, field, context) {
  const number = finitePositive(value, field, context);
  if (!Number.isInteger(number)) {
    throw economicsError(
      `Scripture type "${context.typeId || "unknown"}" from provider "${context.providerId || "unknown"}" ${field} must be a positive integer.`,
      "INVALID_REFERENCE_WORD_COUNT",
      context
    );
  }
  return number;
}

function economicsError(message, code, context) {
  return new TypeEconomicsValidationError(message, {
    code,
    typeId: context.typeId ?? "",
    providerId: context.providerId ?? ""
  });
}

function normalizeEconomicsError(error, options) {
  if (error instanceof TypeEconomicsValidationError) return error;
  return new TypeEconomicsValidationError(error?.message ?? String(error), {
    typeId: options.typeId ?? "",
    providerId: options.providerId ?? ""
  });
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function isPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneSafe(value) {
  if (Array.isArray(value)) return value.map(cloneSafe);
  if (isPlainRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, cloneSafe(nested)])
    );
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
