import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const en = JSON.parse(await readFile(new URL("../lang/en.json", import.meta.url), "utf8"));
const de = JSON.parse(await readFile(new URL("../lang/de.json", import.meta.url), "utf8"));

function flatten(value, prefix = "") {
  const result = [];
  for (const [key, nested] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      result.push(...flatten(nested, path));
    } else {
      result.push(path);
    }
  }
  return result.sort();
}

test("English and German localization files contain the same keys", () => {
  assert.deepEqual(flatten(de), flatten(en));
});

test("economics UI and validation keys are localized", () => {
  const economics = en["RUNYTH-SCRIPTORIA"].Economics;
  assert.equal(economics.SettingsMenu.Name, "Item Price and Weight Defaults");
  assert.ok(economics.PriceAndWeight);
  assert.ok(economics.NormalizedWordCount);
  assert.ok(economics.FinalPrice);
  assert.ok(economics.FinalWeight);
  assert.ok(economics.Errors.InvalidHelper);
});


test("manifest declares Foundry-native English and German language files", async () => {
  const manifest = JSON.parse(await readFile(new URL("../module.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.languages, [
    { lang: "en", name: "English", path: "lang/en.json" },
    { lang: "de", name: "Deutsch", path: "lang/de.json" }
  ]);
});

test("English is complete for core module surfaces", () => {
  assert.equal(en["RUNYTH-SCRIPTORIA"].Types.Book.Label, "Book");
  assert.equal(en["RUNYTH-SCRIPTORIA"].Importer.CreateTitle, "Create Runyth Scriptoria Document");
  assert.equal(en["RUNYTH-SCRIPTORIA"].Settings.RootFolder.Name, "Root Item folder");
  assert.equal(en["RUNYTH-SCRIPTORIA"].Actions.Read, "Read");
  assert.equal(en["RUNYTH-SCRIPTORIA"].FileImport.NoFile, "No document file was selected.");
});

test("German translates built-in types and importer surfaces", () => {
  assert.equal(de["RUNYTH-SCRIPTORIA"].Types.Book.Label, "Buch");
  assert.equal(de["RUNYTH-SCRIPTORIA"].Importer.CreateTitle, "Runyth Scriptoria-Dokument erstellen");
  assert.equal(de["RUNYTH-SCRIPTORIA"].Settings.RootFolder.Name, "Stammordner für Items");
  assert.equal(de["RUNYTH-SCRIPTORIA"].Actions.Read, "Lesen");
});
