export type ScriptoriaApiVersion = "1.2.0";

export type ScriptoriaReaderMode =
  | "foundry"
  | "enhanced-journal"
  | "simple-reader";

export interface ScriptoriaReaderModeDescriptor {
  readonly id: ScriptoriaReaderMode;
  readonly label: string;
  readonly icon: string;
  readonly available: boolean;
  readonly integrationId?: string | null;
}

export interface ScriptoriaDocumentViewOptions {
  readonly mode?: ScriptoriaReaderMode;
  readonly pageId?: string | null;
  readonly temporaryRead?: boolean;
  readonly source?: string;
  readonly notifyFallback?: boolean;
}

export interface ScriptoriaPlayerDisplayOptions {
  readonly mode?: ScriptoriaReaderMode;
  readonly pageId?: string | null;
  readonly application?: unknown;
}


export type ScriptoriaPriceDenomination =
  | "pp"
  | "gp"
  | "ep"
  | "sp"
  | "cp"
  | string;

export interface ScriptoriaPrice {
  readonly value: number;
  readonly denomination: ScriptoriaPriceDenomination;
}

export interface ScriptoriaWeightDefaults {
  readonly base: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly referenceWordCount: number;
  readonly adjustForContentLength: boolean;
}

export interface ScriptoriaTypeEconomics {
  readonly price: ScriptoriaPrice;
  readonly weight: ScriptoriaWeightDefaults;
}

export interface ScriptoriaItemEconomicsOverrides {
  readonly price?: ScriptoriaPrice;
  readonly weight?: number;
}

export interface ScriptoriaItemEconomicsResult {
  readonly schemaVersion: number;
  readonly typeId: string;
  readonly wordCount: number;
  readonly providerDefaults: ScriptoriaTypeEconomics;
  readonly worldOverride?: ScriptoriaTypeEconomics;
  readonly effectiveDefaults: ScriptoriaTypeEconomics;
  readonly calculatedPrice: ScriptoriaPrice;
  readonly calculatedWeight: number;
  readonly price: ScriptoriaPrice;
  readonly weight: number;
  readonly weightUnits: string;
  readonly multiplier: number;
  readonly priceOverridden: boolean;
  readonly weightOverridden: boolean;
}

export interface ScriptoriaEconomicsValidationError {
  readonly name: "TypeEconomicsValidationError";
  readonly code: string;
  readonly message: string;
  readonly typeId: string;
  readonly providerId: string;
}

export type ScriptoriaEconomicsValidationResult =
  | Readonly<{
      ok: true;
      value: ScriptoriaTypeEconomics;
      error: undefined;
    }>
  | Readonly<{
      ok: false;
      value: undefined;
      error: ScriptoriaEconomicsValidationError;
    }>;

export interface ScriptoriaCalculateEconomicsOptions {
  readonly typeId: string;
  readonly content?: string;
  readonly sourceFormat?: "markdown" | "html";
  readonly overrides?: ScriptoriaItemEconomicsOverrides;
}

export type ScriptureTypeCapability =
  | "creation"
  | "import"
  | "scenePlacement"
  | "reader";

export interface ScriptureTypeCapabilities {
  readonly creation: boolean;
  readonly import: boolean;
  readonly scenePlacement: boolean;
  readonly reader: boolean;
}

export interface ScriptureTypeValidationContext {
  readonly title: string;
  readonly typeId: string;
  readonly sourceFormat: "markdown" | "html";
  readonly source: string;
  readonly sourceFileName: string;
  readonly author: string;
  readonly access: "embedded" | "observer";
  readonly itemType: string;
}

export type ScriptureTypeValidator = (
  context: ScriptureTypeValidationContext,
) => void | boolean | string | Promise<void | boolean | string>;

export interface ScriptureTypeRegistrationDescriptor {
  readonly id: string;
  readonly provider?: string;
  readonly label?: string;
  readonly labelKey?: string;
  readonly plural?: string;
  readonly pluralKey?: string;
  readonly description?: string;
  readonly descriptionKey?: string;
  readonly icon?: string;
  readonly image?: string;
  readonly sort?: number;
  readonly variant?: string;
  readonly capabilities?: Partial<ScriptureTypeCapabilities>;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly economics?: ScriptoriaTypeEconomics;
  readonly validate?: ScriptureTypeValidator;
}

export interface ScriptureTypeDescriptor {
  readonly id: string;
  readonly provider: string;
  readonly providerVersion: string;
  readonly label: string;
  readonly labelKey: string;
  readonly plural: string;
  readonly pluralKey: string;
  readonly description: string;
  readonly descriptionKey: string;
  readonly icon: string;
  readonly image: string;
  readonly sort: number;
  readonly variant: string;
  readonly capabilities: ScriptureTypeCapabilities;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly economics: ScriptoriaTypeEconomics;
  readonly builtIn: boolean;
  readonly source: "built-in" | "api" | "fallback";
  readonly unavailable: boolean;
  readonly hasValidator: boolean;
}

export interface ScriptureTypeRegistrationError {
  readonly name: "ScriptureTypeValidationError";
  readonly code: string;
  readonly message: string;
  readonly typeId: string;
  readonly providerId: string;
}

export interface ScriptureTypeRegistrationSuccess {
  readonly ok: true;
  readonly status: "registered" | "unchanged" | "unregistered" | "absent";
  readonly id: string;
  readonly provider: string;
  readonly type: ScriptureTypeDescriptor | undefined;
}

export interface ScriptureTypeRegistrationFailure {
  readonly ok: false;
  readonly status: "rejected";
  readonly id: string;
  readonly provider: string;
  readonly type: undefined;
  readonly error: ScriptureTypeRegistrationError;
}

export type ScriptureTypeRegistration =
  | ScriptureTypeRegistrationSuccess
  | ScriptureTypeRegistrationFailure;

export interface ScriptoriaCreateSourceData {
  readonly typeId?: string;
  readonly kind?: string;
  readonly title?: string;
  readonly author?: string;
  readonly itemType?: string;
  readonly access?: "embedded" | "observer";
  readonly removeTitleHeading?: boolean;
  readonly sourceFormat: "markdown" | "html";
  readonly source: string;
  readonly sourceFileName?: string;
  readonly economicsOverrides?: ScriptoriaItemEconomicsOverrides;
}

export interface ScriptoriaApi {
  readonly version: ScriptoriaApiVersion;
  readonly capabilities: readonly [
    "scripture-types",
    "document-readers",
    "player-display",
    "item-economics",
  ];

  registerScriptureType(
    descriptor: ScriptureTypeRegistrationDescriptor,
  ): ScriptureTypeRegistration;

  unregisterScriptureType(
    id: string,
    options?: Readonly<{ provider?: string }>,
  ): ScriptureTypeRegistration;

  getScriptureType(
    id: string,
  ): ScriptureTypeDescriptor | undefined;

  getScriptureTypes(): readonly ScriptureTypeDescriptor[];

  hasScriptureType(id: string): boolean;

  getTypeEconomics(typeId: string): ScriptoriaTypeEconomics;

  getEffectiveTypeEconomics(typeId: string): ScriptoriaTypeEconomics;

  calculateItemEconomics(
    options: ScriptoriaCalculateEconomicsOptions,
  ): ScriptoriaItemEconomicsResult;

  validateTypeEconomics(
    economics: unknown,
    options?: Readonly<{
      typeId?: string;
      providerId?: string;
      fallback?: ScriptoriaTypeEconomics;
      allowPartial?: boolean;
    }>,
  ): ScriptoriaEconomicsValidationResult;

  openImporter(options?: Readonly<{ item?: unknown }>): unknown;

  openReader(
    itemOrContext: unknown,
    options?: Readonly<{
      temporaryRead?: boolean;
      pageId?: string | null;
      viewMode?: ScriptoriaReaderMode;
      source?: string;
    }>,
  ): Promise<unknown>;

  openDocumentView(
    target: unknown,
    options?: ScriptoriaDocumentViewOptions,
  ): Promise<unknown>;

  getReaderModes(): readonly ScriptoriaReaderModeDescriptor[];

  getDefaultSceneDocumentView(): ScriptoriaReaderMode;

  showToAllPlayers(
    target: unknown,
    options?: ScriptoriaPlayerDisplayOptions,
  ): Promise<false | Readonly<Record<string, unknown>>>;

  showToSelectedPlayers(
    target: unknown,
    userIds: readonly string[],
    options?: ScriptoriaPlayerDisplayOptions,
  ): Promise<false | Readonly<Record<string, unknown>>>;

  showPlayerSelectionDialog(
    target: unknown,
    options?: ScriptoriaPlayerDisplayOptions,
  ): Promise<unknown>;

  createFromSource(data: ScriptoriaCreateSourceData): Promise<unknown>;

  createFromMarkdown(
    data: Omit<ScriptoriaCreateSourceData, "sourceFormat"> & {
      readonly markdown?: string;
    },
  ): Promise<unknown>;

  updateFromSource(
    itemOrUuid: unknown,
    data: Partial<ScriptoriaCreateSourceData>,
  ): Promise<unknown>;

  updateFromMarkdown(
    itemOrUuid: unknown,
    data: Partial<ScriptoriaCreateSourceData> & {
      readonly markdown?: string;
    },
  ): Promise<unknown>;

  isScriptoriaItem(item: unknown): boolean;
}

export interface ScriptoriaApiReadyHookArguments {
  readonly api: ScriptoriaApi;
}

export interface ScriptoriaScriptureTypeHookArguments {
  readonly descriptor: ScriptureTypeDescriptor;
  readonly registration: ScriptureTypeRegistrationSuccess;
}
