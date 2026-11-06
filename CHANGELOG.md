# Changelog

## 1.9.3 — 2026-11-06

- Every fleet layer rule is keyed on the module-owned fleet class alone. The
  importer, the Item price and weight defaults, and the player selection
  windows never carried the document-window identity that the earlier
  compound selectors demanded, so the look stayed off for them in spite of the
  render-time look application introduced across 1.9.1 and 1.9.2.
- Confirmed live: the render-time marker and fleet classes are present on
  mounted windows, so the style key was the last missing structural link.

## 1.9.2 — 2026-11-06

- The fleet look stayed invisible in live builds even after 1.9.1: the direct
  render-time application carried only the fleet class, while the module's
  window rules (stock and fleet alike) require the base
  `runyth-scriptoria-document-window` and per-window identity classes on the
  rendered element, and those still rode the host's handling of the window
  `classes` option alone.
- The module-owned dialog base now mounts the full window identity — the
  base and per-window classes, the `data-runyth-scriptoria-window` marker,
  and the current look — directly on the rendered element at render time, so
  the appearance no longer depends on the host forwarding window options.
- Added a second, independent application point: the module-level
  `renderDialogV2` hook syncs any rendered Scriptoria DialogV2 window the
  class-level render step may bypass, and remains inert for foreign dialogs.
- Expanded the regression suite for identity mounting under option-black-hole
  hosts, the hook-path sync for both look states, and the hook registration.

## 1.9.1 — 2026-11-06

- The Garb & Grime UI on this module's windows now renders reliably; the text
  at 1.9.0 relied on the host Foundry build forwarding the window `classes`
  option onto the rendered element, which does not happen in every live
  Foundry build, so the fleet look never appeared there.
- Every Runyth Scriptoria DialogV2 window (reader, importer, player
  selection, Item price and weight defaults, importer window reset prompt)
  now derives from a module-owned dialog class that applies the look directly
  on the rendered window element at render time, mirroring the approach of
  Runyth Scene Folder Tools.
- Rendered windows carry a `data-runyth-scriptoria-window` marker attribute,
  and the settings-closure re-sync scans for it, so switching between the
  fleet look and the stock Foundry look reaches windows regardless of how
  their classes were mounted.
- Added regression coverage for render-time look application, stock look
  fidelity at both look states, toggling in both directions, and re-syncing
  windows whose classes never landed on the DOM.

## 1.9.0 — 2026-11-05

- Adopted the fleet-wide Garb & Grime UI design for the module's windows: the
  reader, Markdown/HTML importer, player selection dialog, and the Item price
  and weight defaults dialog now ride the petrol gradient shell with gold
  headings, gradient buttons, dark field controls, thin scrollbars, and the
  fleet focus ring. The tokens build on the module's existing dark-surface
  variables, so the look stays consistent on legacy and new windows alike.
- The earlier stock Foundry look remains available through a new client
  setting; it is disabled by default, so the fleet look applies out of the
  box and the stock look is restored verbatim when the toggle is enabled.
- The fleet class attaches at the shared window brand points — every
  DialogV2 factory, the sheet window mount, and the rendered-application
  enhancer — and closing the settings configuration re-syncs every mounted
  window immediately.
- Synced the runtime `MODULE_VERSION` constant with the published manifest
  version (it had been frozen at 1.8.0 while 1.8.1 shipped), and added a
  `ui-look` regression suite covering the disabled-by-default contract, the
  window-class synthesis for both looks, and the settings-closure resync.

## 1.8.1 — 2026-11-04

- The installable archive now ships every relative import the manifest entry needs, so the module's buttons and settings register on world load instead of silently failing.

## 1.8.0 — 2026-11-01

- Rebranded the module into Runyth Scriptoria: the Foundry module id is `runyth-scriptoria`, the display title is `Runyth Scriptoria — Markdown & HTML Books and Documents`, and the npm package is `runyth-scriptoria`.
- The rebrand reaches every real surface: hook and API-ready event namespaces, flag scope, CSS file name plus isolation and application class prefixes, scene control actions, asset paths, localization namespace, importer helpers and internal identifiers, and the TypeScript definition file.
- Adopted `AGPL-3.0-or-later` for the program with the standard two-line source notice on every module source, and replaced the MIT licence text with the GNU Affero General Public License served by the `LICENSE` file.
- Added the workspace publication standard tooling: deterministic release packaging, per-version checksums, a byte-identical rebuild gate, quality and release workflows, and repository contribution and security guidance.
- The public extension API keeps version 1.2.0; extension points move to the `runyth-scriptoria.*` hook namespace and modules relying on the old `scriptoria.*` hook names must update their listeners.
- Existing documents created with earlier versions keep their flags and data; the migration namespace now reads the `runyth-scriptoria` flag scope.

## 1.7.3 — 2026-08-03

- Complete Runyth Scriptoria's Foundry-native localization adoption. The module already shipped language files, but many settings, importer labels, directory actions, scene controls, notifications, file-import errors, built-in scripture-type names, and fallback text were still literal English and could not be translated.
- Route all normal user-facing module settings and creation-window text through the `RUNYTH-SCRIPTORIA.*` localization namespace.
- Give every built-in scripture type stable label, plural, and description localization keys while retaining English literal fallbacks for resilience.
- Localize unavailable-type fallbacks, generated folder names, default untitled names, reader capability warnings, scene-placement messages, and document lifecycle notifications.
- Preserve Foundry's global language selector as the only language control; no Runyth Scriptoria dashboard or module-specific language selector is added.
- Add `docs/LOCALIZATION.md` with the manifest, file, key-parity, fallback, and contribution contract for adding further languages.
- Expand localization tests to verify manifest language declarations, English/German key parity, built-in type localization, settings localization, and absence of known hard-coded UI registrations.

## 1.7.2 — 2026-07-23

- Remove the importer’s `useDefault` checkbox and separate override-value state for price and weight.
- Replace the former read-only/activation workflow with ordinary enabled numeric creation fields, matching the existing Title and Author interaction model.
- Populate Price, denomination, Weight, and unit directly from the effective world/provider defaults when the importer opens.
- Treat the values currently visible in the enabled fields as the authoritative values written to the D&D 5e Item payload.
- Add independent lightweight dirty tracking for price, denomination, and weight so type or content recalculation never overwrites manually edited values.
- Add **Reset Price to Default** and **Recalculate Weight** convenience actions without reintroducing persistent default-versus-override toggles.
- Keep text changes from modifying price while still recalculating untouched content-aware weight.
- Preserve the public API’s backward-compatible calculation overrides for external callers, while removing that override object entirely from the importer form path.
- Add DOM-level and Chromium regression validation proving the enabled fields accept direct edits and that `12 gp` and `0.4 lb` are submitted exactly.
- Preserve world economics settings, helper-provided types, existing Items, reader modes, player display, Scene Notes, and remembered importer placement.

## 1.7.1 — 2026-07-23

- Fix the document-creation popup so price value, denomination, weight value, and weight unit are all visible as distinct controls.
- Root cause: the v1.7.0 economics cards placed disabled numeric controls inside Foundry's generic `.form-fields` layout without module-owned sizing. Host sheet/theme rules could collapse those disabled fields, leaving the separate `lb` unit element as the only visible weight control and making the price controls effectively disappear.
- Root cause: initial calculated economics were written into application state only after post-render listener activation. The submit path also treated a missing default-toggle control as `false`, entered override mode, and converted a missing value with `Number(undefined)`, producing `NaN` and the misleading finite-price validation failure.
- Serialize complete calculated price, denomination, weight, and units into the initial rendered economics section before listeners run.
- Replace disabled authoritative controls with visible module-scoped read-only controls; defaults never depend on disabled fields being submitted.
- Add explicit form state for `useDefault`, override value, denomination, and units, preserving valid zero values and active manual overrides during recalculation.
- Add centralized numeric parsing with clear missing, empty, `NaN`, infinite, negative, and unsupported-denomination errors that report the received value.
- Validate the final resolved economics result again before constructing D&D 5e Item data.
- Confirm the D&D 5e physical Item schema paths `system.price.value`, `system.price.denomination`, `system.weight.value`, and `system.weight.units` through the active public data-model schema when available.
- Add focused optional debug logging for economics boundaries without logging imported document content.
- Add real-Chromium layout validation at desktop and narrow widths, including hostile host styles that collapse disabled generic fields.
- Preserve helper economics, world overrides, content-aware recalculation, reader and player-display features, Scene pamphlets, and remembered importer placement.

## 1.7.0 — 2026-07-23

- Add centralized declarative price and weight defaults to every built-in scripture type.
- Use D&D 5e physical Item price and weight structures while isolating system-specific mapping behind an adapter.
- Add deterministic normalized-word counting and bounded content-length weight multipliers from 0.80× through 1.25×.
- Add the Game-Master-only **Item Price and Weight Defaults** world settings menu for built-in and helper-provided types.
- Persist only actual world overrides keyed by stable type ID and preserve inactive-helper overrides.
- Add creation-time calculated values, optional price/denomination/weight overrides, debounced live recalculation, reset controls, and final previews.
- Store economics provenance in Runyth Scriptoria flags while keeping native Item fields authoritative.
- Add a safe legacy migration that records unknown economics provenance without rewriting existing Item values.
- Extend scripture-type descriptors with validated, immutable `economics` metadata.
- Increase the public API to **1.2.0** and add the `item-economics` capability plus economics lookup, validation, and calculation methods.
- Update the reference helper to version **1.1.0** with Prophecy and Imperial Decree economics defaults.
- Add English and German localization and automated coverage for defaults, normalization, bounded weight calculation, settings precedence, creation overrides, helper types, migration, and D&D 5e field mapping.

## 1.6.0 — 2026-07-23

- Add the world-scoped, Game-Master-restricted **Default view for scene documents** setting.
- Preserve the existing Scene default by selecting the Runyth Scriptoria simple reader for new and existing worlds.
- Add stable reader mode IDs for the standard Foundry view, enhanced journal view, and Runyth Scriptoria simple reader.
- Centralize Scene reader resolution and keep direct sidebar opening behavior unchanged.
- Add a compatible Monk's Enhanced Journal adapter with console warning, optional one-time GM notification, and safe Foundry-view fallback when unavailable.
- Add **Open with** actions to supported document-window menus without changing the stored default.
- Add an always-visible, high-contrast **Show to All Players** title-bar control for Game Masters.
- Add **Show to Selected Players…** with connected-player selection, Select All, Clear Selection, Show, and Cancel controls.
- Add one namespaced `module.runyth-scriptoria` socket service using validated document references, target IDs, reader modes, page context, and deduplicated request IDs.
- Reject non-GM senders, malformed messages, unsupported documents, invalid reader modes, non-target clients, and duplicate requests.
- Never serialize private document bodies through the socket or permanently change ownership.
- Preserve native Foundry permissions, player-safe generated Journals, existing reader contrast, remembered importer layout, and movable Scene Notes.
- Expand the public API to version **1.1.0** with `document-readers` and `player-display` capabilities and explicit view/display operations.
- Add English and German localization for settings, reader modes, display controls, selection dialogs, fallbacks, and errors.
- Add automated coverage for settings, reader resolution, enhanced-view fallback, socket validation, recipient filtering, deduplication, Game Master restrictions, and scoped window controls.

## 1.5.0 — 2026-07-23

- Add public extension API version **1.0.0** at `game.modules.get("runyth-scriptoria")?.api`.
- Announce API readiness once through `runyth-scriptoria.apiReady` after the registry can accept registrations.
- Add a shared scripture-type registry used by built-in and helper-provided types.
- Add validated, idempotent registration and ownership-aware unregistration operations.
- Add immutable type lookup and discovery operations with the `scripture-types` capability marker.
- Accept late registrations safely; newly opened importers rebuild their selectors from the current registry.
- Persist only stable scripture-type IDs in documents while retaining the legacy `kind` field as a compatible alias.
- Keep documents readable when a helper provider is unavailable by displaying an explicit unavailable-type fallback.
- Add provider, namespace, active-module, localization, icon, image-scope, capability, metadata, callback, and prototype-pollution validation.
- Add awaited provider document validators behind a Runyth Scriptoria error boundary.
- Add `runyth-scriptoria.scriptureTypeRegistered` and `runyth-scriptoria.scriptureTypeUnregistered` hooks.
- Add `docs/EXTENSION_API.md` and `types/runyth-scriptoria.d.ts`.
- Add a separate installable `runyth-scriptoria-example-extension` reference helper with Prophecy and Imperial Decree types.
- Add automated coverage for publication, registration, invalid descriptors, failure isolation, idempotency, immutability, unregistration, unavailable providers, UI discovery, and document creation.

## 1.4.0 — 2026-07-23

- Replace the obsolete parchment/light reader with one shared dark Runyth Scriptoria reader.
- Route Item-sheet Read actions, directory actions, post-import reading, public API reading, and Scene pamphlet activation through the same reader.
- Reuse an already-open reader for the same document.
- Add module-owned application-frame classes for Runyth Scriptoria Item, Journal, and reader windows.
- Restore dark Foundry-style title bars with high-contrast controls, menus, hover states, and focus states.
- Keep all header styling scoped to Runyth Scriptoria windows.

## 1.3.1 — 2026-07-23

- Fix unreadable inline code by assigning an explicit high-contrast foreground, opaque background, border, padding, and selection palette.
- Scope inline-code styling to Runyth Scriptoria-rendered content.
- Keep fenced `<pre><code>` blocks outside the inline-code selector so syntax highlighting remains intact.
- Root cause: the previous rule supplied only a translucent background and inherited an arbitrary foreground colour from Foundry, the active theme, or another module.

## 1.3.0 — 2026-07-23

- Keep placed Runyth Scriptoria documents as native Foundry v13 `Note` placeables on the Notes layer.
- Add permission-aware single-click selection without replacing the Note or overlaying it with an HTML interaction surface.
- Activate Foundry's Notes/Select scene control before controlling a permitted Runyth Scriptoria Note.
- Preserve native dragging, grid snapping, gridless movement, keyboard nudging, right-click configuration, double-click Journal reading, and Delete/Backspace handling.
- Select newly placed documents automatically for the placing Game Master.
- Keep double-clicked documents selected after their Journal reader is closed.
- Add a **Manage Runyth Scriptoria scene documents** convenience button to the Token scene controls for Game Masters.
- Use Foundry's own placeable permission checks for non-GM users and do not grant players additional Scene-editing permissions.
- Mark placed Notes as globally visible while retaining Journal ownership as the authority for reading access.
- Explicitly create Notes unlocked when the configured Note schema exposes a lock field; Runyth Scriptoria adds no proprietary lock state.
- Ensure deleting a placed Note removes only the Scene instance and leaves the linked Journal and original Runyth Scriptoria Item intact.
- Prevent duplicate pointer-handler registration and remove listeners when Notes are destroyed or the Canvas is torn down.
- Add automated coverage for Note identification, permissions, native control activation, listener cleanup, unlocked creation, persistent coordinates, and player read-only interaction.

## 1.2.0 — 2026-07-23

- Add the client setting **Remember importer window position and size**, enabled by default.
- Persist importer width, height, left position, and top position separately in each browser/client.
- Restore the last importer layout after reloading Foundry or reopening the world.
- Debounce placement writes during drag and resize operations and flush the latest layout when the importer closes.
- Validate remembered dimensions and coordinates before applying them.
- Clamp negative, oversized, or off-screen layouts to the current browser viewport.
- Preserve the importer minimum usable size whenever the viewport can support it.
- Keep the complete title bar and bottom action buttons inside the available viewport.
- Fall back to Runyth Scriptoria's default dimensions and centered placement when saved state is missing or invalid.
- Add a **Reset importer window position and size** module-settings action for the current browser.
- Prevent an already-open importer from re-saving an old layout after the reset action is used.
- Keep the importer resizable, full-width, initially empty, and compatible with pasted or uploaded Markdown and HTML.
- Add automated coverage for layout restoration, clamping, small viewports, invalid state, client settings, reset behavior, and debounced persistence.

## 1.1.0 — 2026-07-23

- Import local Markdown files with the `.md` and `.markdown` extensions.
- Import local HTML files with the `.html` and `.htm` extensions.
- Add automatic source-format detection based on the selected file.
- Add an explicit Markdown or HTML source selector for directly pasted content.
- Extract HTML Item titles from the first `<h1>`, falling back to `<title>`.
- Sanitize imported HTML by removing scripts, event handlers, embedded frames,
  forms, active embedded content, inline styles, and unsafe URL schemes.
- Preserve the original uploaded source and its filename for later editing.
- Keep all Runyth Scriptoria 1.0.x Markdown Items fully editable through a backwards-
  compatible source-data migration path.
- Add a 5 MiB import limit and reject unsupported, empty, or binary-looking files.
- Rename Item-sheet editing actions from **Edit Markdown** to **Edit Source**.
- Add automated coverage for file reading, format detection, HTML title extraction,
  sanitization, source preparation, and legacy Item compatibility.

## 1.0.1 — 2026-07-23

- Fix the Markdown field being constrained to the right-hand form column.
- Start new documents with an empty Markdown field and a non-destructive placeholder.
- Remove the invalid nested form from the Foundry `DialogV2` importer.
- Keep importer action buttons visible with a scrollable, resizable dialog layout.
- Allow vertical resizing of the Markdown field.

## 1.0.0 — 2026-07-23

- Add Markdown importer for books, journals, scriptures, documentation, and pamphlets.
- Extract the Item name from the first level-one Markdown heading.
- Store source Markdown and rendered HTML in module flags.
- Mirror rendered content into the D&D 5e Item description.
- Add player-facing reading view and GM Markdown editor to Item sheets.
- Add Item Directory creation button and context-menu actions.
- Create readable Journal notes when Runyth Scriptoria Items are dropped onto a Scene.
- Organise created Items and scene Journals into automatic folders.
- Add safe local Markdown rendering with common GFM features.
