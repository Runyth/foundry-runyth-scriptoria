# Runyth Scriptoria Extension API

Runyth Scriptoria module version **1.8.0** provides public extension API version
**1.2.0** for Foundry VTT v13. The module version, API version, and a helper
module's own version are independent values.

The API allows helper modules to extend Runyth Scriptoria without importing, patching,
wrapping, or replacing files from Runyth Scriptoria's installation directory.

## Accessing the API

The public API is published at:

```javascript
const api = game.modules.get("runyth-scriptoria")?.api;
```

Runyth Scriptoria also announces the same object through the synchronous, namespaced
hook:

```javascript
Hooks.callAll("runyth-scriptoria.apiReady", api);
```

The hook fires once per world load after the registry is ready to accept
registrations. It is not cancellable and listeners are not awaited.

## Canonical load-order-safe registration

Register the readiness listener before checking direct access. Guard the shared
function so the two paths cannot cause accidental duplicate work:

```javascript
const MODULE_ID = "example-runyth-scriptoria-helper";
let registered = false;

function registerWithScriptoria(api) {
  if (registered) return;
  registered = true;

  const result = api.registerScriptureType({
    id: `${MODULE_ID}.prophecy`,
    provider: MODULE_ID,
    label: "Prophecy",
    labelKey: `${MODULE_ID}.types.prophecy.label`,
    description: "A prophetic or visionary scripture.",
    descriptionKey: `${MODULE_ID}.types.prophecy.description`,
    icon: "fa-solid fa-eye",
    image: `modules/${MODULE_ID}/assets/prophecy.svg`,
    sort: 250,
  });

  if (!result.ok) {
    console.error(`${MODULE_ID} | ${result.error.message}`, result.error);
  }
}

Hooks.once("runyth-scriptoria.apiReady", registerWithScriptoria);

const existingApi = game.modules.get("runyth-scriptoria")?.api;
if (existingApi) registerWithScriptoria(existingApi);
```

All module scripts are normally loaded before Foundry fires `init`, and a helper
module should declare Runyth Scriptoria as a required relationship. The two-path
pattern also handles unusual development loaders and late module evaluation.

## Public API surface

```javascript
{
  version: "1.2.0",
  capabilities: [
    "scripture-types",
    "document-readers",
    "player-display",
    "item-economics",
  ],
  registerScriptureType,
  unregisterScriptureType,
  getScriptureType,
  getScriptureTypes,
  hasScriptureType,
  getTypeEconomics,
  getEffectiveTypeEconomics,
  calculateItemEconomics,
  validateTypeEconomics,
  openImporter,
  openReader,
  openDocumentView,
  getReaderModes,
  getDefaultSceneDocumentView,
  showToAllPlayers,
  showToSelectedPlayers,
  showPlayerSelectionDialog,
  createFromMarkdown,
  createFromSource,
  updateFromMarkdown,
  updateFromSource,
  isScriptoriaItem,
}
```

Registry objects, private classes, live applications, and mutable internal maps
are not exposed. Descriptors and result objects returned by the API are frozen
safe copies.

## Reader modes and player display in API 1.1.0

API 1.1.0 adds the `document-readers` and `player-display` capabilities. Reader
selection is centralized behind stable IDs:

- `foundry`
- `enhanced-journal`
- `simple-reader`

`getReaderModes()` returns frozen descriptors with localized labels, icons, and
current availability. `getDefaultSceneDocumentView()` returns the world-level
Scene default. `openDocumentView(target, options)` opens a supported Runyth Scriptoria
Item, generated Journal, Journal page, Note, context object, or UUID using the
requested mode and the same fallback rules used by Scene interactions.

The public display operations are Game-Master-only:

```javascript
await api.showToAllPlayers(document, {
  mode: "simple-reader",
});

await api.showToSelectedPlayers(
  document,
  ["PLAYER_USER_ID"],
  { mode: "foundry" },
);

await api.showPlayerSelectionDialog(document);
```

Display messages contain only validated references and view context. They do
not serialize complete document bodies or persist ownership changes. A target
client must therefore already be able to resolve the player-visible document;
Runyth Scriptoria's generated Scene Journals normally provide that access according to
the configured Journal ownership setting.

The built-in enhanced-journal adapter currently recognizes Monk's Enhanced
Journal when active and when a supported opening function is exposed. Missing
or incompatible integrations fall back to the normal Foundry Journal view.
Reader registration is deliberately not public in API 1.2.0. The centralized
resolver and stable mode IDs provide a clean future path without committing to
a premature third-party reader callback contract.

## Registering a scripture type

```javascript
const result = api.registerScriptureType({
  id: "orphan-black-runyth-scriptoria.imperial-decree",
  provider: "orphan-black-runyth-scriptoria",
  label: "Imperial Decree",
  labelKey: "orphan-black-runyth-scriptoria.types.imperialDecree.label",
  plural: "Imperial Decrees",
  description: "An official proclamation carrying imperial authority.",
  icon: "fa-solid fa-landmark-flag",
  image: "modules/orphan-black-runyth-scriptoria/assets/imperial-decree.svg",
  sort: 260,
  variant: "imperial-decree",
  capabilities: {
    creation: true,
    import: true,
    scenePlacement: true,
    reader: true,
  },
  metadata: {
    authority: "imperial",
  },
});
```

### Required identity and label fields

- `id`: a globally unique, namespaced ID such as `module-id.type-id`.
- `provider`: the active provider module ID. It must equal the first namespace
  segment of `id`. It may be omitted because Runyth Scriptoria derives it from `id`.
- `label` or `labelKey`: a user-facing literal fallback or a provider-owned
  localization key. Supplying both is recommended.

Built-in legacy IDs—`book`, `journal`, `scripture`, `documentation`, and
`pamphlet`—are registered through the same internal registry, but are protected
from replacement and unregistration.

### Supported optional fields

| Field | Purpose |
|---|---|
| `labelKey`, `pluralKey`, `descriptionKey` | Provider-owned localization keys |
| `plural`, `description` | Literal fallbacks |
| `icon` | Font Awesome class such as `fa-solid fa-eye` |
| `image` | Item image under `modules/<provider>/` or Foundry's `icons/` directory |
| `sort` | Integer display order from -100000 through 100000 |
| `variant` | Safe lowercase presentation token; no CSS selector is accepted |
| `capabilities` | Booleans for creation, import, scene placement, and reader use |
| `metadata` | Frozen JSON-safe helper metadata |
| `validate` | Optional awaited document validator |

A validator receives a frozen context object. It may return `true`, `undefined`,
or nothing to accept; `false` or a non-empty string rejects; thrown or rejected
errors are converted into clear Runyth Scriptoria document-validation errors.

```javascript
validate: async ({ title }) => {
  if (!title.startsWith("Imperial")) {
    return "Imperial decrees must use an Imperial title.";
  }
}
```

Callbacks are never serialized into documents.

## Registration results and errors

Registration and unregistration return frozen result objects instead of letting
a defective helper exception interrupt Runyth Scriptoria initialization.

```javascript
const result = api.registerScriptureType(descriptor);

if (result.ok) {
  console.log(result.status); // "registered" or "unchanged"
} else {
  console.error(result.error.code, result.error.message);
}
```

Equivalent repeated registration by the same provider returns `unchanged`.
Conflicting data, provider mismatches, inactive providers, malformed IDs,
unsupported fields, invalid callbacks, and built-in replacement attempts return
`rejected` with the type ID, provider ID, code, and reason.

Foundry's client JavaScript environment does not expose authenticated caller
identity. Runyth Scriptoria therefore enforces ownership through the descriptor's
namespace, matching provider field, and an active `game.modules` record. This
prevents accidental impersonation but is not a security boundary against a
malicious active client module.

## Registration timing

Registration remains open after initialization. New importers resolve the
current registry each time they open. An importer already open when a helper
registers or unregisters a type must be closed and reopened; Runyth Scriptoria never
partially mutates an open selector.

Existing readers resolve the type again when reopened.

## Unregistration

Unregistration exists primarily for tests, development reloads, and future
controlled extension management:

```javascript
const result = api.unregisterScriptureType(
  "example-runyth-scriptoria-helper.prophecy",
  { provider: "example-runyth-scriptoria-helper" },
);
```

Built-in types cannot be removed. A provider cannot unregister a type owned by a
different namespace. Existing documents are not deleted or rewritten.

## Unavailable provider behaviour

Documents persist only their stable type ID. When a helper is unavailable,
Runyth Scriptoria shows:

```text
Unavailable scripture type: example-runyth-scriptoria-helper.prophecy
```

The Item source, rendered content, actor copy, Scene Note, and generated Journal
remain readable. Re-enabling the provider and registering the same ID restores
normal labels and capabilities without migrating document data.

## Localization

A helper may provide literal strings, localization keys, or both. Keys must be
owned by the helper module namespace. Runyth Scriptoria resolves keys at display time.
A missing key falls back to the literal value and never prevents rendering.

Example `module.json` language entry:

```json
{
  "languages": [
    {
      "lang": "en",
      "name": "English",
      "path": "lang/en.json"
    }
  ]
}
```

## Item economics in API 1.2.0

API 1.2.0 adds the `item-economics` capability. A helper type may declare
provider defaults without executable callbacks:

```javascript
api.registerScriptureType({
  id: "example-runyth-scriptoria-helper.imperial-decree",
  provider: "example-runyth-scriptoria-helper",
  label: "Imperial Decree",
  icon: "fa-solid fa-scroll",
  economics: {
    price: {
      value: 3,
      denomination: "gp",
    },
    weight: {
      base: 0.5,
      minimum: 0.35,
      maximum: 0.9,
      referenceWordCount: 1500,
      adjustForContentLength: true,
    },
  },
});
```

Runyth Scriptoria v1.8.0 keeps API version 1.2.0. The rebrand to the Runyth identity does not change public extension API behaviour.

Runyth Scriptoria v1.7.3 keeps API version 1.2.0. The corrective release does not change
the helper contract: helper economics are normalized into the same complete
provider-default structure used by built-in types before the importer is built.
Partial world overrides are deeply merged and cannot erase required price,
denomination, weight bounds, reference counts, or units resolved by the active
system adapter.

The descriptor is cloned, validated, and frozen. Supported fields are exactly
`price.value`, `price.denomination`, `weight.base`, `weight.minimum`,
`weight.maximum`, `weight.referenceWordCount`, and
`weight.adjustForContentLength`. Runyth Scriptoria rejects negative or non-finite
values, unsupported denominations, invalid bounds, a base outside its bounds,
non-positive reference counts, non-boolean adjustment flags, accessors, and
unknown fields. The registration result identifies the provider and type. A bad
helper registration is isolated and does not prevent other types from loading.

World overrides are stored separately by stable type ID. Re-registering or
updating a helper never replaces a Game Master's override. Disabling a helper
preserves both existing Item values and the stored override; re-enabling the
provider restores normal type resolution.

The public methods are:

```javascript
api.getTypeEconomics(typeId);
api.getEffectiveTypeEconomics(typeId);
api.validateTypeEconomics(economics, { typeId, providerId });
api.calculateItemEconomics({
  typeId,
  content,
  sourceFormat: "markdown",
  overrides: {
    price: undefined,
    weight: undefined,
  },
});
```

`getTypeEconomics()` returns normalized provider defaults.
`getEffectiveTypeEconomics()` applies the current world override.
`calculateItemEconomics()` returns normalized word count, provider defaults,
world override, effective defaults, calculated and final price/weight, weight
multiplier, unit, and override provenance. Returned values are immutable copies.

The weight calculation uses normalized readable text and the documented bounded
bands: `0.80×`, `0.90×`, `1.00×`, `1.08×`, `1.16×`, and at most `1.25×`. Price
is never changed by content length in API 1.2.0.

## Required helper-module relationship

Foundry v13 uses `relationships.requires` for required package dependencies:

```json
{
  "relationships": {
    "requires": [
      {
        "id": "runyth-scriptoria",
        "type": "module",
        "compatibility": {
          "minimum": "1.7.0"
        }
      }
    ]
  }
}
```

The helper depends on Runyth Scriptoria. Runyth Scriptoria does not list helpers and is not a
pure `library` module because it retains normal user-facing functionality.

## Public hooks

### `runyth-scriptoria.apiReady`

- Fires once after the public API and built-in registry are ready.
- Argument: the public `ScriptoriaApi` object.
- Not cancellable; listeners are synchronous and are not awaited.
- Register types through the API object passed to the listener.

### `runyth-scriptoria.scriptureTypeRegistered`

- Fires after a new external type is committed to the registry.
- Arguments: frozen public descriptor, successful registration result.
- Does not fire for idempotent `unchanged` results or built-in initialization.
- Not cancellable; listeners are synchronous and are not awaited.

### `runyth-scriptoria.scriptureTypeUnregistered`

- Fires after an external type is removed.
- Arguments: frozen public descriptor, successful unregistration result.
- Not cancellable; listeners are synchronous and are not awaited.

Hook listeners must not mutate arguments. Exceptions are logged and isolated at
the Runyth Scriptoria integration boundary where practical.

## API compatibility policy

The public API follows semantic versioning independently from Runyth Scriptoria:

- **Patch**: compatible corrections.
- **Minor**: backward-compatible members or descriptor fields.
- **Major**: breaking signatures, behaviour, or hook contracts.

A helper should feature-detect `api.capabilities` and compare `api.version` when
it depends on functionality introduced after API 1.0.0. API 1.2.0 is a backward-compatible minor addition. It adds declarative item economics while preserving the scripture-type, reader, and player-display contracts from API 1.0.0 and 1.1.0.

TypeScript declarations are included at `types/runyth-scriptoria.d.ts`.

## Deliberate limitations in API 1.2.0

- Open importer windows do not live-update after a registration change; reopen
  them to rebuild the selector.
- No custom templates, unrestricted CSS selectors, or executable string fields
  are accepted.
- The API does not expose Runyth Scriptoria's registry map, application instances, or
  private rendering classes.
- Third-party reader registration is not public in API 1.2.0. Use the stable
  built-in reader IDs and `openDocumentView()`; future reader extensibility will
  build on the centralized resolver.
- Targeted display requests do not transmit private document bodies. Recipients
  must already be able to resolve the intended player-visible document.
