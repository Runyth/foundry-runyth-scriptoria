import {
  DEFAULT_SCRIPTURE_TYPE_ID,
  MODULE_ID,
  MODULE_VERSION,
  SCRIPTURE_TYPE_CAPABILITIES,
  TYPE_REGISTERED_HOOK,
  TYPE_UNREGISTERED_HOOK
} from "./constants.mjs";
import { format, localize } from "./i18n.mjs";
import {
  SAFE_FALLBACK_ECONOMICS,
  TypeEconomicsValidationError,
  normalizeTypeEconomics
} from "./economics-core.mjs";

const TYPE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*$/;
const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const VARIANT_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const FONT_AWESOME_PATTERN = /^fa-(?:solid|regular|brands) fa-[a-z0-9-]+(?:\s+fa-[a-z0-9-]+)*$/;
const MAX_SORT = 100_000;
const MIN_SORT = -100_000;
const ALLOWED_DESCRIPTOR_KEYS = new Set([
  "id",
  "provider",
  "label",
  "labelKey",
  "plural",
  "pluralKey",
  "description",
  "descriptionKey",
  "icon",
  "image",
  "sort",
  "variant",
  "capabilities",
  "metadata",
  "economics",
  "validate"
]);
const BLOCKED_KEYS = new Set(["__proto__", "prototype", "constructor"]);

const BUILT_IN_TYPES = Object.freeze([
  {
    id: "book",
    label: "Book",
    labelKey: "RUNYTH-SCRIPTORIA.Types.Book.Label",
    plural: "Books",
    pluralKey: "RUNYTH-SCRIPTORIA.Types.Book.Plural",
    description: "A bound book or substantial written volume.",
    descriptionKey: "RUNYTH-SCRIPTORIA.Types.Book.Description",
    icon: "fa-solid fa-book",
    image: "modules/runyth-scriptoria/assets/book.svg",
    sort: 100,
    variant: "book",
    economics: {
      price: { value: 25, denomination: "gp" },
      weight: {
        base: 5,
        minimum: 4,
        maximum: 8,
        referenceWordCount: 12_000,
        adjustForContentLength: true
      }
    }
  },
  {
    id: "journal",
    label: "Journal",
    labelKey: "RUNYTH-SCRIPTORIA.Types.Journal.Label",
    plural: "Journals",
    pluralKey: "RUNYTH-SCRIPTORIA.Types.Journal.Plural",
    description: "A personal journal, diary, log, or notebook.",
    descriptionKey: "RUNYTH-SCRIPTORIA.Types.Journal.Description",
    icon: "fa-solid fa-book-journal-whills",
    image: "modules/runyth-scriptoria/assets/journal.svg",
    sort: 200,
    variant: "journal",
    economics: {
      price: { value: 2, denomination: "gp" },
      weight: {
        base: 1,
        minimum: 0.8,
        maximum: 1.8,
        referenceWordCount: 4_000,
        adjustForContentLength: true
      }
    }
  },
  {
    id: "scripture",
    label: "Scripture",
    labelKey: "RUNYTH-SCRIPTORIA.Types.Scripture.Label",
    plural: "Scriptures",
    pluralKey: "RUNYTH-SCRIPTORIA.Types.Scripture.Plural",
    description: "A religious, doctrinal, prophetic, or sacred text.",
    descriptionKey: "RUNYTH-SCRIPTORIA.Types.Scripture.Description",
    icon: "fa-solid fa-scroll-torah",
    image: "modules/runyth-scriptoria/assets/scripture.svg",
    sort: 300,
    variant: "scripture",
    economics: {
      price: { value: 15, denomination: "gp" },
      weight: {
        base: 3,
        minimum: 2.4,
        maximum: 5,
        referenceWordCount: 8_000,
        adjustForContentLength: true
      }
    }
  },
  {
    id: "documentation",
    label: "Documentation",
    labelKey: "RUNYTH-SCRIPTORIA.Types.Documentation.Label",
    plural: "Documentation",
    pluralKey: "RUNYTH-SCRIPTORIA.Types.Documentation.Plural",
    description: "Technical, procedural, instructional, or reference material.",
    descriptionKey: "RUNYTH-SCRIPTORIA.Types.Documentation.Description",
    icon: "fa-solid fa-file-lines",
    image: "modules/runyth-scriptoria/assets/documentation.svg",
    sort: 400,
    variant: "documentation",
    economics: {
      price: { value: 5, denomination: "gp" },
      weight: {
        base: 1.5,
        minimum: 1.2,
        maximum: 3,
        referenceWordCount: 6_000,
        adjustForContentLength: true
      }
    }
  },
  {
    id: "pamphlet",
    label: "Pamphlet",
    labelKey: "RUNYTH-SCRIPTORIA.Types.Pamphlet.Label",
    plural: "Pamphlets",
    pluralKey: "RUNYTH-SCRIPTORIA.Types.Pamphlet.Plural",
    description: "A short handout, leaflet, notice, tract, or folded document.",
    descriptionKey: "RUNYTH-SCRIPTORIA.Types.Pamphlet.Description",
    icon: "fa-solid fa-newspaper",
    image: "modules/runyth-scriptoria/assets/pamphlet.svg",
    sort: 500,
    variant: "pamphlet",
    economics: {
      price: { value: 5, denomination: "cp" },
      weight: {
        base: 0.1,
        minimum: 0.08,
        maximum: 0.25,
        referenceWordCount: 800,
        adjustForContentLength: true
      }
    }
  }
]);

const registry = new Map();

export class ScriptureTypeValidationError extends Error {
  constructor(message, {
    code = "INVALID_REGISTRATION",
    typeId = "",
    providerId = ""
  } = {}) {
    super(message);
    this.name = "ScriptureTypeValidationError";
    this.code = code;
    this.typeId = typeId;
    this.providerId = providerId;
  }
}

export function initializeBuiltInScriptureTypes() {
  for (const descriptor of BUILT_IN_TYPES) {
    if (registry.has(descriptor.id)) continue;
    const normalized = normalizeBuiltInType(descriptor);
    registry.set(normalized.id, normalized);
  }
}

export function registerScriptureType(descriptor) {
  try {
    initializeBuiltInScriptureTypes();
    const normalized = normalizeExternalType(descriptor);
    const existing = registry.get(normalized.id);

    if (existing) {
      if (existing.builtIn) {
        return rejectedResult(new ScriptureTypeValidationError(
          `Scripture type "${normalized.id}" from provider "${normalized.provider}" conflicts with a protected built-in type.`,
          {
            code: "BUILT_IN_CONFLICT",
            typeId: normalized.id,
            providerId: normalized.provider
          }
        ));
      }

      if (existing.provider !== normalized.provider) {
        return rejectedResult(new ScriptureTypeValidationError(
          `Scripture type "${normalized.id}" is already owned by provider "${existing.provider}" and cannot be registered by "${normalized.provider}".`,
          {
            code: "PROVIDER_CONFLICT",
            typeId: normalized.id,
            providerId: normalized.provider
          }
        ));
      }

      if (existing.fingerprint === normalized.fingerprint) {
        return successResult("unchanged", existing);
      }

      return rejectedResult(new ScriptureTypeValidationError(
        `Scripture type "${normalized.id}" from provider "${normalized.provider}" is already registered with incompatible data. Unregister it explicitly before registering a changed descriptor.`,
        {
          code: "INCOMPATIBLE_DUPLICATE",
          typeId: normalized.id,
          providerId: normalized.provider
        }
      ));
    }

    registry.set(normalized.id, normalized);
    const result = successResult("registered", normalized);
    emitExtensionHook(TYPE_REGISTERED_HOOK, result.type, result);
    return result;
  } catch (error) {
    return rejectedResult(normalizeRegistrationError(error, descriptor));
  }
}

export function unregisterScriptureType(id, {
  provider = deriveProviderId(id)
} = {}) {
  try {
    initializeBuiltInScriptureTypes();
    const typeId = normalizeIdentifier(id, "scripture type ID");
    const providerId = normalizeIdentifier(provider, "provider module ID");
    const existing = registry.get(typeId);

    if (!existing) {
      return deepFreeze({
        ok: true,
        status: "absent",
        id: typeId,
        provider: providerId,
        type: undefined
      });
    }

    if (existing.builtIn) {
      return rejectedResult(new ScriptureTypeValidationError(
        `Built-in scripture type "${typeId}" cannot be unregistered.`,
        {
          code: "BUILT_IN_PROTECTED",
          typeId,
          providerId
        }
      ));
    }

    if (existing.provider !== providerId || deriveProviderId(typeId) !== providerId) {
      return rejectedResult(new ScriptureTypeValidationError(
        `Provider "${providerId}" cannot unregister scripture type "${typeId}", which is owned by "${existing.provider}".`,
        {
          code: "UNREGISTER_OWNERSHIP_MISMATCH",
          typeId,
          providerId
        }
      ));
    }

    registry.delete(typeId);
    const result = successResult("unregistered", existing);
    emitExtensionHook(TYPE_UNREGISTERED_HOOK, result.type, result);
    return result;
  } catch (error) {
    return rejectedResult(normalizeRegistrationError(error, {
      id,
      provider
    }));
  }
}

export function getScriptureType(id) {
  initializeBuiltInScriptureTypes();
  const record = registry.get(String(id ?? ""));
  return record ? toPublicDescriptor(record) : undefined;
}

export function getScriptureTypes() {
  initializeBuiltInScriptureTypes();
  return Object.freeze(
    Array.from(registry.values())
      .sort(compareTypes)
      .map(toPublicDescriptor)
  );
}

export function hasScriptureType(id) {
  initializeBuiltInScriptureTypes();
  return registry.has(String(id ?? ""));
}

export function listScriptureTypes({
  capability = null
} = {}) {
  initializeBuiltInScriptureTypes();
  const records = Array.from(registry.values())
    .filter((record) => !capability || record.capabilities[capability] === true)
    .sort(compareTypes);
  return Object.freeze(records.map(toPublicDescriptor));
}

export function getScriptureTypeOrFallback(id) {
  const typeId = String(id ?? DEFAULT_SCRIPTURE_TYPE_ID).trim() || DEFAULT_SCRIPTURE_TYPE_ID;
  return getScriptureType(typeId) ?? createUnavailableType(typeId);
}

export function getStoredScriptureTypeId(data) {
  return String(data?.typeId ?? data?.kind ?? DEFAULT_SCRIPTURE_TYPE_ID).trim()
    || DEFAULT_SCRIPTURE_TYPE_ID;
}

export function resolveScriptureTypeLabel(descriptorOrId) {
  const descriptor = typeof descriptorOrId === "string"
    ? getScriptureTypeOrFallback(descriptorOrId)
    : descriptorOrId;
  return resolveLocalizedField(descriptor, "label", "labelKey")
    || format("RUNYTH-SCRIPTORIA.Types.Unavailable.Label", { id: descriptor?.id ?? "unknown" }, `Unavailable scripture type: ${descriptor?.id ?? "unknown"}`);
}

export function resolveScriptureTypePlural(descriptorOrId) {
  const descriptor = typeof descriptorOrId === "string"
    ? getScriptureTypeOrFallback(descriptorOrId)
    : descriptorOrId;
  const localized = resolveLocalizedField(descriptor, "plural", "pluralKey");
  if (localized) return localized;
  return descriptor?.unavailable
    ? localize("RUNYTH-SCRIPTORIA.Types.Unavailable.Plural", "Unavailable Scripture Types")
    : format("RUNYTH-SCRIPTORIA.Types.GenericPlural", { label: resolveScriptureTypeLabel(descriptor) }, `${resolveScriptureTypeLabel(descriptor)}s`);
}

export function resolveScriptureTypeDescription(descriptorOrId) {
  const descriptor = typeof descriptorOrId === "string"
    ? getScriptureTypeOrFallback(descriptorOrId)
    : descriptorOrId;
  return resolveLocalizedField(descriptor, "description", "descriptionKey");
}

export async function validateDocumentForScriptureType(typeId, documentData) {
  initializeBuiltInScriptureTypes();
  const record = registry.get(String(typeId ?? ""));
  if (!record?.validate) return true;

  try {
    const result = await record.validate(deepFreeze(cloneSafe(documentData)));
    if (result === false) {
      throw new Error("The provider validator rejected the document without a reason.");
    }
    if (typeof result === "string" && result.trim()) {
      throw new Error(result.trim());
    }
    return true;
  } catch (error) {
    throw new ScriptureTypeValidationError(
      `Scripture type "${record.id}" from provider "${record.provider}" rejected the document: ${error?.message ?? String(error)}`,
      {
        code: "DOCUMENT_VALIDATION_FAILED",
        typeId: record.id,
        providerId: record.provider
      }
    );
  }
}

export function resetScriptureTypeRegistryForTests() {
  registry.clear();
  initializeBuiltInScriptureTypes();
}

function normalizeBuiltInType(descriptor) {
  const capabilities = normalizeCapabilities(descriptor.capabilities);
  const economics = normalizeTypeEconomics(descriptor.economics, {
    typeId: descriptor.id,
    providerId: MODULE_ID
  });
  const publicData = {
    id: descriptor.id,
    provider: MODULE_ID,
    providerVersion: MODULE_VERSION,
    label: descriptor.label,
    labelKey: descriptor.labelKey ?? "",
    plural: descriptor.plural,
    pluralKey: descriptor.pluralKey ?? "",
    description: descriptor.description,
    descriptionKey: descriptor.descriptionKey ?? "",
    icon: descriptor.icon,
    image: descriptor.image,
    sort: descriptor.sort,
    variant: descriptor.variant,
    capabilities,
    metadata: deepFreeze({}),
    economics,
    builtIn: true,
    source: "built-in",
    unavailable: false,
    hasValidator: false
  };
  return deepFreeze({
    ...publicData,
    validate: null,
    fingerprint: stableFingerprint(publicData, null)
  });
}

function normalizeExternalType(descriptor) {
  if (!isPlainRecord(descriptor)) {
    throw new ScriptureTypeValidationError(
      "A scripture type descriptor must be a plain object.",
      { code: "DESCRIPTOR_NOT_OBJECT" }
    );
  }

  rejectDangerousOrUnsupportedKeys(descriptor);

  const rawId = String(descriptor.id ?? "").trim();
  const provider = String(descriptor.provider ?? deriveProviderId(rawId)).trim();

  if (!rawId) {
    throw new ScriptureTypeValidationError(
      `Scripture type registration from provider "${provider || "unknown"}" is missing an ID.`,
      {
        code: "MISSING_ID",
        providerId: provider
      }
    );
  }

  if (registry.get(rawId)?.builtIn) {
    throw new ScriptureTypeValidationError(
      `Scripture type "${rawId}" from provider "${provider || "unknown"}" conflicts with a protected built-in type.`,
      {
        code: "BUILT_IN_CONFLICT",
        typeId: rawId,
        providerId: provider
      }
    );
  }

  if (!TYPE_ID_PATTERN.test(rawId)) {
    throw new ScriptureTypeValidationError(
      `Scripture type "${rawId}" from provider "${provider || "unknown"}" must use a namespaced ID such as "module-id.type-id".`,
      {
        code: "INVALID_ID",
        typeId: rawId,
        providerId: provider
      }
    );
  }

  if (!PROVIDER_ID_PATTERN.test(provider)) {
    throw new ScriptureTypeValidationError(
      `Scripture type "${rawId}" has invalid provider module ID "${provider || "unknown"}".`,
      {
        code: "INVALID_PROVIDER",
        typeId: rawId,
        providerId: provider
      }
    );
  }

  const namespace = deriveProviderId(rawId);
  if (provider !== namespace) {
    throw new ScriptureTypeValidationError(
      `Scripture type "${rawId}" claims provider "${provider}", but its namespace belongs to "${namespace}".`,
      {
        code: "PROVIDER_IMPERSONATION",
        typeId: rawId,
        providerId: provider
      }
    );
  }

  const providerModule = globalThis.game?.modules?.get?.(provider);
  if (!providerModule?.active) {
    throw new ScriptureTypeValidationError(
      `Scripture type "${rawId}" cannot be registered because provider module "${provider}" is not active.`,
      {
        code: "PROVIDER_INACTIVE",
        typeId: rawId,
        providerId: provider
      }
    );
  }

  const label = normalizeOptionalText(descriptor.label, "label", rawId, provider);
  const labelKey = normalizeLocalizationKey(descriptor.labelKey, "labelKey", rawId, provider);
  if (!label && !labelKey) {
    throw new ScriptureTypeValidationError(
      `Scripture type "${rawId}" from provider "${provider}" requires a literal label or labelKey.`,
      {
        code: "MISSING_LABEL",
        typeId: rawId,
        providerId: provider
      }
    );
  }

  const plural = normalizeOptionalText(descriptor.plural, "plural", rawId, provider);
  const pluralKey = normalizeLocalizationKey(descriptor.pluralKey, "pluralKey", rawId, provider);
  const description = normalizeOptionalText(descriptor.description, "description", rawId, provider);
  const descriptionKey = normalizeLocalizationKey(descriptor.descriptionKey, "descriptionKey", rawId, provider);
  const icon = normalizeIcon(descriptor.icon, rawId, provider);
  const image = normalizeImage(descriptor.image, provider, rawId);
  const sort = normalizeSort(descriptor.sort, rawId, provider);
  const variant = normalizeVariant(descriptor.variant, rawId, provider);
  const capabilities = normalizeCapabilities(descriptor.capabilities, rawId, provider);
  const metadata = deepFreeze(cloneJsonRecord(descriptor.metadata, rawId, provider));
  const economics = normalizeTypeEconomics(descriptor.economics, {
    typeId: rawId,
    providerId: provider
  });
  const validate = normalizeValidator(descriptor.validate, rawId, provider);

  const publicData = {
    id: rawId,
    provider,
    providerVersion: String(providerModule.version ?? ""),
    label,
    labelKey,
    plural,
    pluralKey,
    description,
    descriptionKey,
    icon,
    image,
    sort,
    variant,
    capabilities,
    metadata,
    economics,
    builtIn: false,
    source: "api",
    unavailable: false,
    hasValidator: Boolean(validate)
  };

  return deepFreeze({
    ...publicData,
    validate,
    fingerprint: stableFingerprint(publicData, validate)
  });
}

function createUnavailableType(id) {
  return deepFreeze({
    id,
    provider: deriveProviderId(id),
    providerVersion: "",
    label: format("RUNYTH-SCRIPTORIA.Types.Unavailable.Label", { id }, `Unavailable scripture type: ${id}`),
    labelKey: "",
    plural: localize("RUNYTH-SCRIPTORIA.Types.Unavailable.Plural", "Unavailable Scripture Types"),
    pluralKey: "",
    description: format("RUNYTH-SCRIPTORIA.Types.Unavailable.Description", { id }, `The provider for scripture type "${id}" is not currently available. The stored document remains readable.`),
    descriptionKey: "",
    icon: "fa-solid fa-triangle-exclamation",
    image: "modules/runyth-scriptoria/assets/scripture.svg",
    sort: MAX_SORT,
    variant: "unavailable",
    capabilities: deepFreeze({
      creation: false,
      import: false,
      scenePlacement: true,
      reader: true
    }),
    metadata: deepFreeze({}),
    economics: SAFE_FALLBACK_ECONOMICS,
    builtIn: false,
    source: "fallback",
    unavailable: true,
    hasValidator: false
  });
}

function toPublicDescriptor(record) {
  return deepFreeze({
    id: record.id,
    provider: record.provider,
    providerVersion: record.providerVersion,
    label: record.label,
    labelKey: record.labelKey,
    plural: record.plural,
    pluralKey: record.pluralKey,
    description: record.description,
    descriptionKey: record.descriptionKey,
    icon: record.icon,
    image: record.image,
    sort: record.sort,
    variant: record.variant,
    capabilities: cloneSafe(record.capabilities),
    metadata: cloneSafe(record.metadata),
    economics: cloneSafe(record.economics),
    builtIn: record.builtIn,
    source: record.source,
    unavailable: record.unavailable,
    hasValidator: record.hasValidator
  });
}

function successResult(status, record) {
  return deepFreeze({
    ok: true,
    status,
    id: record.id,
    provider: record.provider,
    type: toPublicDescriptor(record)
  });
}

function rejectedResult(error) {
  const normalized = error instanceof ScriptureTypeValidationError
    ? error
    : new ScriptureTypeValidationError(error?.message ?? String(error));
  const publicError = deepFreeze({
    name: normalized.name,
    code: normalized.code,
    message: normalized.message,
    typeId: normalized.typeId,
    providerId: normalized.providerId
  });
  console.error(`${MODULE_ID} | Scripture type registration rejected: ${publicError.message}`, publicError);
  return deepFreeze({
    ok: false,
    status: "rejected",
    id: publicError.typeId,
    provider: publicError.providerId,
    type: undefined,
    error: publicError
  });
}

function normalizeRegistrationError(error, descriptor) {
  if (error instanceof ScriptureTypeValidationError) return error;

  const typeId = String(descriptor?.id ?? "").trim();
  const providerId = String(
    descriptor?.provider ?? deriveProviderId(typeId) ?? "unknown"
  ).trim();

  if (error instanceof TypeEconomicsValidationError) {
    return new ScriptureTypeValidationError(
      error.message,
      {
        code: error.code ?? "INVALID_ECONOMICS",
        typeId: error.typeId || typeId,
        providerId: error.providerId || providerId
      }
    );
  }

  return new ScriptureTypeValidationError(
    `Scripture type "${typeId || "unknown"}" from provider "${providerId || "unknown"}" could not be registered: ${error?.message ?? String(error)}`,
    {
      code: "UNEXPECTED_REGISTRATION_ERROR",
      typeId,
      providerId
    }
  );
}

function rejectDangerousOrUnsupportedKeys(descriptor) {
  for (const key of Reflect.ownKeys(descriptor)) {
    if (typeof key !== "string") {
      throw new ScriptureTypeValidationError(
        "Scripture type descriptors may contain only string property names.",
        { code: "UNSUPPORTED_SYMBOL_KEY" }
      );
    }
    if (BLOCKED_KEYS.has(key)) {
      throw new ScriptureTypeValidationError(
        `Scripture type descriptor contains prohibited key "${key}".`,
        { code: "PROTOTYPE_POLLUTION_KEY" }
      );
    }
    if (!ALLOWED_DESCRIPTOR_KEYS.has(key)) {
      throw new ScriptureTypeValidationError(
        `Scripture type descriptor contains unsupported field "${key}".`,
        { code: "UNSUPPORTED_FIELD" }
      );
    }
    const property = Object.getOwnPropertyDescriptor(descriptor, key);
    if (!property || !("value" in property)) {
      throw new ScriptureTypeValidationError(
        `Scripture type descriptor field "${key}" must be a plain data property, not an accessor.`,
        { code: "ACCESSOR_FIELD_REJECTED" }
      );
    }
  }
}

function normalizeCapabilities(value, typeId = "", providerId = MODULE_ID) {
  const defaults = {
    creation: true,
    import: true,
    scenePlacement: true,
    reader: true
  };
  if (value === undefined) return deepFreeze(defaults);
  if (!isPlainRecord(value)) {
    throw new ScriptureTypeValidationError(
      `Scripture type "${typeId}" from provider "${providerId}" has invalid capabilities; expected a plain object.`,
      {
        code: "INVALID_CAPABILITIES",
        typeId,
        providerId
      }
    );
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !SCRIPTURE_TYPE_CAPABILITIES.includes(key)) {
      throw new ScriptureTypeValidationError(
        `Scripture type "${typeId}" from provider "${providerId}" has unsupported capability "${String(key)}".`,
        {
          code: "UNSUPPORTED_CAPABILITY",
          typeId,
          providerId
        }
      );
    }
    if (typeof value[key] !== "boolean") {
      throw new ScriptureTypeValidationError(
        `Scripture type "${typeId}" from provider "${providerId}" capability "${key}" must be boolean.`,
        {
          code: "INVALID_CAPABILITY_VALUE",
          typeId,
          providerId
        }
      );
    }
  }
  return deepFreeze({
    ...defaults,
    ...value
  });
}

function normalizeOptionalText(value, field, typeId, providerId) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw new ScriptureTypeValidationError(
      `Scripture type "${typeId}" from provider "${providerId}" field "${field}" must be a string.`,
      {
        code: "INVALID_TEXT_FIELD",
        typeId,
        providerId
      }
    );
  }
  return value.trim();
}

function normalizeLocalizationKey(value, field, typeId, providerId) {
  const key = normalizeOptionalText(value, field, typeId, providerId);
  if (!key) return "";
  if (!key.startsWith(`${providerId}.`)) {
    throw new ScriptureTypeValidationError(
      `Scripture type "${typeId}" localization key "${key}" must be owned by provider "${providerId}".`,
      {
        code: "LOCALIZATION_NAMESPACE_MISMATCH",
        typeId,
        providerId
      }
    );
  }
  return key;
}

function normalizeIcon(value, typeId, providerId) {
  if (value === undefined || value === null || value === "") return "fa-solid fa-book-open";
  if (typeof value !== "string" || !FONT_AWESOME_PATTERN.test(value.trim())) {
    throw new ScriptureTypeValidationError(
      `Scripture type "${typeId}" from provider "${providerId}" has invalid Font Awesome icon "${String(value)}".`,
      {
        code: "INVALID_ICON",
        typeId,
        providerId
      }
    );
  }
  return value.trim();
}

function normalizeImage(value, providerId, typeId) {
  if (value === undefined || value === null || value === "") {
    return "modules/runyth-scriptoria/assets/scripture.svg";
  }
  if (typeof value !== "string") {
    throw new ScriptureTypeValidationError(
      `Scripture type "${typeId}" from provider "${providerId}" image must be a string path.`,
      {
        code: "INVALID_IMAGE",
        typeId,
        providerId
      }
    );
  }
  const image = value.trim();
  if (
    !image.startsWith(`modules/${providerId}/`)
    && !image.startsWith("icons/")
  ) {
    throw new ScriptureTypeValidationError(
      `Scripture type "${typeId}" image must be inside "modules/${providerId}/" or Foundry's "icons/" directory.`,
      {
        code: "IMAGE_OUTSIDE_PROVIDER_SCOPE",
        typeId,
        providerId
      }
    );
  }
  return image;
}

function normalizeSort(value, typeId, providerId) {
  if (value === undefined || value === null || value === "") return 1000;
  if (!Number.isInteger(value) || value < MIN_SORT || value > MAX_SORT) {
    throw new ScriptureTypeValidationError(
      `Scripture type "${typeId}" from provider "${providerId}" sort must be an integer between ${MIN_SORT} and ${MAX_SORT}.`,
      {
        code: "INVALID_SORT",
        typeId,
        providerId
      }
    );
  }
  return value;
}

function normalizeVariant(value, typeId, providerId) {
  if (value === undefined || value === null || value === "") return "extension";
  if (typeof value !== "string" || !VARIANT_PATTERN.test(value.trim())) {
    throw new ScriptureTypeValidationError(
      `Scripture type "${typeId}" from provider "${providerId}" variant must contain only lowercase letters, numbers, and hyphens.`,
      {
        code: "INVALID_VARIANT",
        typeId,
        providerId
      }
    );
  }
  return value.trim();
}

function normalizeValidator(value, typeId, providerId) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "function") {
    throw new ScriptureTypeValidationError(
      `Scripture type "${typeId}" from provider "${providerId}" validate callback must be callable.`,
      {
        code: "INVALID_CALLBACK",
        typeId,
        providerId
      }
    );
  }
  return value;
}

function cloneJsonRecord(value, typeId, providerId) {
  if (value === undefined || value === null) return {};
  if (!isPlainRecord(value)) {
    throw new ScriptureTypeValidationError(
      `Scripture type "${typeId}" from provider "${providerId}" metadata must be a plain JSON object.`,
      {
        code: "INVALID_METADATA",
        typeId,
        providerId
      }
    );
  }

  try {
    return cloneJsonValue(value, "metadata", new WeakSet());
  } catch (error) {
    throw new ScriptureTypeValidationError(
      `Scripture type "${typeId}" from provider "${providerId}" metadata is not safe JSON: ${error.message}.`,
      {
        code: "UNSAFE_METADATA",
        typeId,
        providerId
      }
    );
  }
}

function cloneJsonValue(value, path, seen) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${path} contains a non-finite number`);
    return value;
  }
  if (typeof value !== "object") {
    throw new Error(`${path} contains unsupported value type "${typeof value}"`);
  }
  if (seen.has(value)) throw new Error(`${path} contains a circular reference`);
  seen.add(value);

  if (Array.isArray(value)) {
    const result = value.map((entry, index) => cloneJsonValue(entry, `${path}[${index}]`, seen));
    seen.delete(value);
    return result;
  }
  if (!isPlainRecord(value)) throw new Error(`${path} contains a non-plain object`);

  const result = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") throw new Error(`${path} contains a symbol key`);
    if (BLOCKED_KEYS.has(key)) throw new Error(`${path} contains prohibited key "${key}"`);
    const property = Object.getOwnPropertyDescriptor(value, key);
    if (!property || !("value" in property)) {
      throw new Error(`${path}.${key} is an accessor property`);
    }
    result[key] = cloneJsonValue(property.value, `${path}.${key}`, seen);
  }
  seen.delete(value);
  return result;
}

function resolveLocalizedField(descriptor, literalField, keyField) {
  const key = String(descriptor?.[keyField] ?? "").trim();
  if (key) {
    try {
      const localized = globalThis.game?.i18n?.localize?.(key);
      if (localized && localized !== key) return localized;
    } catch {
      // Missing or unavailable localization gracefully falls back to literals.
    }
  }
  return String(descriptor?.[literalField] ?? "").trim();
}

function compareTypes(left, right) {
  return left.sort - right.sort
    || resolveScriptureTypeLabel(left).localeCompare(resolveScriptureTypeLabel(right))
    || left.id.localeCompare(right.id);
}

function stableFingerprint(publicData, validate) {
  return JSON.stringify(sortObject({
    ...publicData,
    validateSource: validate ? Function.prototype.toString.call(validate) : ""
  }));
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!isPlainRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortObject(value[key])])
  );
}

function emitExtensionHook(name, ...args) {
  try {
    globalThis.Hooks?.callAll?.(name, ...args);
  } catch (error) {
    console.error(`${MODULE_ID} | Extension hook "${name}" failed.`, error);
  }
}

function deriveProviderId(id) {
  const value = String(id ?? "").trim();
  return value.includes(".") ? value.split(".", 1)[0] : "";
}

function normalizeIdentifier(value, label) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new ScriptureTypeValidationError(`${label} is required.`, {
      code: "MISSING_IDENTIFIER"
    });
  }
  return normalized;
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
      Object.entries(value).map(([key, nestedValue]) => [key, cloneSafe(nestedValue)])
    );
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nestedValue of Object.values(value)) deepFreeze(nestedValue);
  return Object.freeze(value);
}

initializeBuiltInScriptureTypes();
