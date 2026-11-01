# Scriptoria — Markdown & HTML Books and Documents

Scriptoria creates normal Foundry VTT Items from pasted text or uploaded document
files. It is designed for books, journals, scriptures, documentation, pamphlets,
letters, dossiers, ledgers, handouts, and similar readable resources.

## Supported environment

- Foundry Virtual Tabletop 13
- Designed primarily for the D&D 5e system
- Other systems can use the Scriptoria reading dialog; their native Item sheet
  receives the rendered description only when it exposes a compatible
  `system.description.value` field.

## Features

- Paste Markdown or HTML directly into a Foundry dialog.
- Upload local Markdown files: `.md` and `.markdown`.
- Upload local HTML files: `.html` and `.htm`.
- Automatically detect the source format when a file is selected.
- Select a document kind: Book, Journal, Scripture, Documentation, or Pamphlet.
- Assign configurable default prices and type-aware, content-length-adjusted weights to newly created D&D 5e Items.
- Let Game Masters override provider economics per type through one dynamic world settings menu.
- Let helper modules declare economics through public API version 1.2.0.
- Use the first Markdown H1 or HTML `<h1>` as the Item name automatically.
- Use the HTML `<title>` element as a fallback when no `<h1>` exists.
- Optionally override the extracted title.
- Create a standard draggable Item, normally a D&D 5e `loot` Item.
- Keep the original source and uploaded filename for later editing.
- Render common Markdown and GitHub-Flavoured Markdown features locally.
- Sanitize imported HTML before storing or displaying it.
- Preserve Foundry enrichment syntax in Markdown, including `@UUID[...]` links
  and inline rolls.
- Add **Read** and **Edit Source** actions to Scriptoria Item sheets.
- Create a player-readable, selectable, movable, configurable, and removable
  native Journal Note when a Scriptoria Item is dropped on a Scene.
- Organise documents in `Scriptoria/<Kind>` Item folders.
- Organise generated scene Journals in `Scriptoria Scene Documents`.
- Continue reading and editing Items created with Scriptoria 1.0.x.
- Optionally remember the importer window's position and dimensions separately in each browser/client.
- Validate and clamp remembered layouts so the title bar, editor, and action buttons remain accessible after viewport or monitor changes.
- Keep Scene pamphlets on Foundry's native Notes layer, with permission-aware
  single-click selection and unchanged double-click reading.

## Installation

1. Extract the `scriptoria` directory into:

   ```text
   <Foundry user-data>/Data/modules/
   ```

2. Restart Foundry VTT.
3. Enable **Scriptoria — Markdown & HTML Books and Documents** in the world.
4. Open the **Items** directory.
5. Select **Create Scriptoria Document**.

When updating from an earlier version, replace the existing `scriptoria`
directory. Existing Scriptoria Items are retained.

## Creating a document

The importer supports two equivalent workflows.

### Paste or write content

1. Choose **Markdown** or **HTML** under **Source format**.
2. Paste or write the source in the full-width source field.
3. Choose the document kind, access mode, and optional author.
4. Create the Item.

### Upload a document file

1. Select **Import document file**.
2. Choose a supported `.md`, `.markdown`, `.html`, or `.htm` file.
3. Scriptoria detects the format and loads the source into the editable field.
4. Review or modify the source before creating the Item.

Selecting another file replaces the current source field. The maximum accepted
file size is 5 MiB. Files are read locally by the browser and are not uploaded to
an external service by Scriptoria.

## Item prices and content-aware weights

New Scriptoria Items receive a native D&D 5e price and weight. Open **Configure
Settings → Module Settings → Scriptoria → Item Price and Weight Defaults** to
configure every currently registered built-in or helper-provided type. The
settings are world-scoped and restricted to Game Masters. Existing Items are
never rewritten when defaults change.

Built-in provider defaults are centralized in the scripture-type registry:

| Type | Price | Base weight | Bounds | Reference length |
|---|---:|---:|---:|---:|
| Book | 25 gp | 5 lb | 4–8 lb | 12,000 words |
| Journal | 2 gp | 1 lb | 0.8–1.8 lb | 4,000 words |
| Scripture | 15 gp | 3 lb | 2.4–5 lb | 8,000 words |
| Documentation | 5 gp | 1.5 lb | 1.2–3 lb | 6,000 words |
| Pamphlet | 5 cp | 0.1 lb | 0.08–0.25 lb | 800 words |

Scriptoria counts normalized readable words rather than bytes or rendered HTML.
Markdown frontmatter, formatting markers, HTML tags, scripts, styles, links, and
template noise do not increase the count. Empty or exceptionally short content
uses a modest `0.80×` or `0.90×` multiplier; ordinary content remains at `1.00×`;
long content increases gradually through `1.08×` and `1.16×`; even extremely
large documents are capped at `1.25×` before the type's minimum and maximum are
applied. Price does not vary with text length.

The importer displays the normalized word count, calculated defaults, and final
values. Price and weight are ordinary enabled numeric fields, while denomination
and weight units remain separate. The initial values come from the current world
and provider defaults, but the visible field values become authoritative as soon
as the window opens. Type changes update untouched values, and content changes
update only an untouched content-aware weight. Manual edits are never silently
replaced. **Reset Price to Default** and **Recalculate Weight** restore the current
suggestions without requiring an activation checkbox. Valid zero values are
preserved. Initial-value precedence is:

1. Game Master world override
2. built-in or helper provider default
3. safe system-compatible fallback

The values visibly present at submission are written exactly to the new Item.

D&D 5e Items store the authoritative values in `system.price` and
`system.weight`. Scriptoria flags retain calculation provenance for diagnostics
and future recalculation previews. Older Scriptoria Items receive only legacy
provenance metadata during migration; their existing price and weight are not
changed. Dragging, moving, reading, displaying, or deleting a Scene pamphlet
never recalculates the source Item.

For focused diagnostics, a Game Master can enable **Enable Scriptoria debug
logging** in the module settings. Scriptoria then logs normalized provider
defaults, effective world defaults, calculated economics, importer form state,
and the final Item economics payload. Imported document bodies are never logged.

## Markdown example

```markdown
# The First Scripture of Ash

> What is remembered cannot be buried.

## Fragment I

The road east of Velia was old before the Empire learned its name.

- The first witness carried no seal.
- The second witness had no shadow.
- The third witness never arrived.
```

Scriptoria extracts `The First Scripture of Ash` as the Item name and, by
default, removes the repeated top-level heading from the reading body.

## HTML example

```html
<!doctype html>
<html lang="en">
  <head>
    <title>The Salt Ledger</title>
  </head>
  <body>
    <h1>The Salt Ledger</h1>
    <blockquote>Every honest tally has a dishonest shadow.</blockquote>
    <h2>Third Harbour Entry</h2>
    <p>Thirty-three barrels entered the warehouse.</p>
  </body>
</html>
```

For HTML, Scriptoria uses the first `<h1>` as the Item name. When there is no
`<h1>`, it uses `<title>`. The first `<h1>` can be removed from the reading body
with the same **Remove the first H1 from the body** option used for Markdown.

Example files are included in the module under `examples/`.

## HTML safety

HTML files are treated as untrusted document input. Before display, Scriptoria
removes active or unsafe constructs, including:

- Scripts and inline event handlers
- Embedded frames, objects, and executable embedded content
- Forms and interactive form controls
- Inline styles
- SVG and MathML namespaces
- `javascript:`, `data:`, `vbscript:`, `file:`, and other unsupported URL schemes

Normal semantic document markup such as headings, paragraphs, lists, tables,
blockquotes, links, and images remains available when safe.

Markdown continues to escape raw HTML rather than interpreting it.

## Making a resource available to players

### Player-character inventory

Drag the Scriptoria Item from the Items directory into the character's inventory.
The resource remains a normal embedded Item. A player who can view that actor can
open the Item and use **Read**. In D&D 5e, the rendered text is also stored in the
normal Item description.

### Merchant or Item Piles inventory

Drag the Item into the merchant or pile actor like any other Item. Because it is
not a proprietary document type, inventory modules can retain and transfer it in
the normal way. Actual visibility still follows the permissions and behaviour of
the actor or inventory module.

### Scene

Drag the Item from the Items directory onto the Scene canvas. Scriptoria creates:

1. A Journal Entry containing a snapshot of the rendered document.
2. A native Foundry Note pinned at the drop location.
3. Observer ownership for all players on that Journal by default.

The newly placed Note is unlocked by default where the configured Foundry Note
document supports locking. Scriptoria selects it for the placing Game Master and
uses Foundry's normal Notes layer for every subsequent interaction.

#### Managing a placed pamphlet or document

- **Single-click:** activate the Notes layer and select the Note when the current
  user has Foundry permission to control, drag, and update it.
- **Drag:** move it with Foundry's native Note drag handling. Grid scenes use the
  normal grid behavior; gridless scenes retain free placement.
- **Arrow keys:** move a selected Note precisely using Foundry's standard
  placeable-object keyboard movement where supported.
- **Double-click:** open the linked Journal page and read the document.
- **Right-click:** use Foundry's normal Note HUD or configuration controls after
  selecting it.
- **Delete or Backspace:** delete the selected placed Note through Foundry's
  normal deletion workflow.

A **Manage Scriptoria scene documents** button is also added to the Token scene
controls for Game Masters. It switches directly to Foundry's Notes/Select tool.
The normal Foundry Notes control remains available as well.

Deleting a placed Note removes only that Scene-embedded Note. It does not delete
the generated Journal Entry, its Journal page, the original Scriptoria Item, a
compendium source, or any other reusable document. The original Item remains in
the Items directory.

Players can double-click and read the Note when the generated Journal grants
them Observer permission. Scriptoria does not grant players Scene-editing rights.
A non-GM can select, move, configure, or delete the Note only when Foundry's own
placeable permission checks explicitly allow control, drag, and update actions.

Scriptoria does not add a separate module lock state. If the active Foundry Note
implementation exposes locking, use its normal HUD or configuration sheet to
lock or unlock the placed Note.

## Scene document reader modes and player display

Game Masters can choose the default reader used when a Scriptoria-supported
document is opened from a Scene. Open **Configure Settings → Module Settings →
Scriptoria** and set **Default view for scene documents**. The setting is
world-scoped, restricted to Game Masters, and defaults to **Scriptoria simple
reader**. It affects placed Scriptoria Notes and equivalent Scene document
interactions only; opening unrelated Items or Journals directly from Foundry's
sidebar retains their normal behavior.

The available modes are:

- **Standard Foundry document view** opens the generated Journal or supported
  document sheet through Foundry's normal sheet lifecycle.
- **Enhanced journal-module view** uses the supported active enhanced-journal
  integration. Scriptoria currently detects Monk's Enhanced Journal through its
  module API when present and its established `game.MonksEnhancedJournal`
  compatibility surface otherwise. If no supported opener is available,
  Scriptoria writes a console warning, optionally notifies the Game Master once,
  and safely opens the standard Foundry view instead. The optional integration
  is never required for Scriptoria to load.
- **Scriptoria simple reader** opens the shared dark, high-contrast reader and
  retains its normal window behavior and code styling.

The three-dot menu on a supported Scriptoria window lists the available **Open
with** actions. The active mode is identified and disabled. Choosing another
view opens the same document without changing the world-level default.

Every supported Scriptoria document window also provides Game Master display
controls:

- **Show to All Players** is an always-visible title-bar action. It sends one
  namespaced display request targeting every currently connected non-GM player.
- **Show to Selected Players…** is available in the three-dot menu and opens a
  multi-selection dialog with **Select All**, **Clear Selection**, **Show**, and
  **Cancel** controls. Only connected non-GM users are eligible.

Display requests preserve the current reader mode where possible and otherwise
use the configured Scene default. They contain stable document references, the
requested mode, target user IDs, page context, and a deduplication ID—not full
document bodies. Receiving clients validate the sender, target list, UUIDs,
mode, and request ID before opening anything. No ownership or Scene-editing
permission is changed. Consequently, the target must already be able to resolve
the player-visible Journal or document. Scene documents generated by Scriptoria
are readable under the configured Scene Journal ownership setting. Private or
secret pages are not serialized or bypassed by the display service.

Repeated socket messages are deduplicated, existing simple-reader windows are
focused instead of duplicated, disconnected targets are ignored, and players
never receive broadcast controls merely because they can read a document.

## Permissions

The importer provides two Item access modes:

- **When held or placed**: the world Item remains hidden; actor ownership or the
  generated Scene Journal determines player access.
- **All players immediately**: all players receive Observer access to the world
  Item as soon as it is created.

Scene-drop Journals use Observer access for all players by default. This can be
changed in the module settings.

## Markdown support

The bundled renderer supports:

- ATX and Setext headings
- Paragraphs and explicit line breaks
- Bold, italic, strikethrough, and inline code
- Links and images with URL-scheme validation
- Ordered, unordered, and task lists
- Blockquotes
- Fenced code blocks
- Horizontal rules
- GFM-style tables
- Foundry `@UUID[...]`, `@Compendium[...]`, and inline-roll syntax

Raw HTML inside Markdown is displayed as text rather than trusted markup.

## Importer window placement and size

The client setting **Remember importer window position and size** is enabled by
default. When enabled, Scriptoria remembers the latest importer width, height,
left position, and top position in the current browser. Moving or resizing the
window schedules one debounced save rather than writing a setting for every
pixel of movement. The latest layout is also saved when the importer closes.

The remembered layout is validated against the current browser viewport each
time the importer opens. Scriptoria clamps off-screen or negative coordinates,
reduces dimensions that no longer fit, and preserves its minimum usable size
whenever the viewport is large enough. The complete importer, including its
title bar and bottom action buttons, is kept within the available viewport. An
invalid saved value is ignored and the normal centered default is used.

Disable the setting to always open the importer with its normal default
dimensions and centered placement. The saved layout is not restored while the
setting is disabled.

To clear the saved layout for the current browser:

1. Open **Configure Settings** and select **Module Settings**.
2. Find **Reset importer window position and size** under Scriptoria.
3. Select **Reset importer window** and confirm the action.
4. The next importer opens with the default centered layout.

The preference and hidden layout data use Foundry's client scope, so they are
stored independently for each browser/client rather than shared with other
players or devices.

## Module settings

- Root Item folder name
- Create document-kind subfolders
- Default Item access mode
- Enable or disable Scene-drop Journal creation
- Default Scene Journal player access
- Default view for Scene documents
- Item Price and Weight Defaults for every built-in and helper-provided type
- Enable focused Scriptoria debug logging without document-body content
- Open the reader immediately after creation
- Remember importer window position and size
- Reset importer window position and size for the current browser

## Public extension API

Scriptoria module version **1.7.3** exposes public API version **1.2.0** at:

```javascript
const api = game.modules.get("scriptoria")?.api;
```

The API retains the document operations from earlier releases and adds a stable,
versioned scripture-type registry for optional helper modules:

- `version`
- `capabilities`
- `registerScriptureType(descriptor)`
- `unregisterScriptureType(id, options)`
- `getScriptureType(id)`
- `getScriptureTypes()`
- `hasScriptureType(id)`
- `getTypeEconomics(typeId)` and `getEffectiveTypeEconomics(typeId)`
- `calculateItemEconomics(options)` and `validateTypeEconomics(economics)`
- `openImporter(options)`
- `openReader(itemOrUuid)`
- `openDocumentView(target, options)`
- `getReaderModes()` and `getDefaultSceneDocumentView()`
- `showToAllPlayers(target, options)`
- `showToSelectedPlayers(target, userIds, options)`
- `showPlayerSelectionDialog(target, options)`
- `createFromSource(data)` and `createFromMarkdown(data)`
- `updateFromSource(itemOrUuid, data)` and `updateFromMarkdown(...)`
- `isScriptoriaItem(item)`

Scriptoria announces the same API object through `scriptoria.apiReady`. Helper
modules should declare Scriptoria as a required relationship and combine the
readiness hook with direct API access using one duplicate-safe registration
function.

Built-in and helper types use the same registry and validation path. Helper IDs
must be namespaced, for example `module-id.type-id`. Equivalent repeated
registration is idempotent; incompatible duplicates return structured errors
and never overwrite existing types.

Documents store only their stable type ID. Disabling a helper does not delete or
rewrite documents: readers display an **Unavailable scripture type** fallback,
and re-enabling the helper restores normal resolution.

Complete lifecycle rules, descriptor fields, localization, hooks, semantic
versioning, security constraints, TypeScript declarations, and working examples
are documented in [`docs/EXTENSION_API.md`](docs/EXTENSION_API.md).

## Reader and code styling

All Scriptoria reading paths use the same dark reader presentation, including
Item actions, directory actions, post-import reading, public API calls, and
Scene pamphlet activation. Scriptoria Item, generated Journal, and reader window
headers use scoped dark chrome with visible controls.

Inline code uses an explicit WCAG-AA-compatible foreground, opaque background,
border, focus state, and selection palette. The selector excludes
`pre > code`, preserving fenced code-block and syntax-highlighting styles.

## Development validation

With Node.js 22 or later:

```text
npm test
npm run check
```

These checks validate file-format detection, source loading, HTML sanitization,
Markdown rendering, importer layout validation and persistence, scripture-type
registration, Scene reader resolution, targeted display-message validation and
deduplication, scoped window controls, settings registration, manifest structure,
module imports, and JavaScript syntax.
They do not replace testing in a live Foundry world.
## Directly editable creation economics

The creation importer resolves the current type’s world/provider defaults and places
them directly into ordinary enabled **Price** and **Weight** fields. These values
behave like Title and Author: leave them unchanged to use the suggestion, or type a
different value and create the Item immediately. No activation checkbox or separate
override field is involved.

- **Price** is an enabled numeric value beside a D&D 5e denomination selector.
- **Weight** is an enabled numeric value with the current D&D 5e unit shown
  separately.
- **Reset Price to Default** restores the current type’s configured price.
- **Recalculate Weight** restores the current content-aware weight.
- Type changes update untouched fields but preserve manually edited values.
- Content changes update only an untouched weight; they never change price.
- The exact visible values are written to `system.price` and `system.weight`.
- Editing one creation does not alter the world defaults shown by the next importer.

The public economics API still accepts its documented optional calculation
`overrides` for backward compatibility. The importer itself no longer uses the old
default/override toggle model.

## Localization

Scriptoria uses Foundry VTT's package-localization system. Its `module.json` declares the bundled language files under `languages`, and runtime text is resolved through `game.i18n` using the `SCRIPTORIA.*` namespace.

The active language is selected through Foundry's normal global language setting. Scriptoria deliberately does not add a dashboard switch or a separate per-module language preference. English is the complete fallback language, German is bundled, and additional translations can be added without changing Scriptoria's application logic.

See [`docs/LOCALIZATION.md`](docs/LOCALIZATION.md) for the translation-file contract and contribution procedure.

