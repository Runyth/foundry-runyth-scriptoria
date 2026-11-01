# Runyth Scriptoria localization

Runyth Scriptoria uses Foundry VTT v13's native package-localization mechanism.

## Runtime selection

Foundry's global language setting selects the active language. Runyth Scriptoria does not maintain a second language preference and does not add a language switch to its dashboard or document windows.

## Manifest declaration

Every bundled translation is declared in `module.json`:

```json
{
  "languages": [
    { "lang": "en", "name": "English", "path": "lang/en.json" },
    { "lang": "de", "name": "Deutsch", "path": "lang/de.json" }
  ]
}
```

To add a language, add a JSON file under `lang/` and one matching manifest entry. Use a canonical lower-case language code accepted by Foundry.

## Key contract

All Runyth Scriptoria-owned strings use the `RUNYTH-SCRIPTORIA.*` namespace. A new language file must contain exactly the same key paths as `lang/en.json`. English is the complete source and resilient fallback language.

Built-in scripture types expose stable localization keys:

- `RUNYTH-SCRIPTORIA.Types.Book.*`
- `RUNYTH-SCRIPTORIA.Types.Journal.*`
- `RUNYTH-SCRIPTORIA.Types.Scripture.*`
- `RUNYTH-SCRIPTORIA.Types.Documentation.*`
- `RUNYTH-SCRIPTORIA.Types.Pamphlet.*`

Helper modules continue to own and ship their own localization keys. Runyth Scriptoria resolves a helper's `labelKey`, `pluralKey`, and `descriptionKey` at display time and falls back to the helper's literal strings when a key is unavailable.

## Formatting

Use `{name}` placeholders for values passed through `game.i18n.format`. Preserve HTML elements in the few keys intentionally rendered as safe module-authored markup, such as the accepted-file hint. User-provided content is never inserted into localization files.

## Validation

Run `npm test` and `npm run check`. The suite checks language-key parity, manifest declarations, built-in type keys, and localized settings.
