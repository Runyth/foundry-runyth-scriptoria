import assert from "node:assert/strict";
import test from "node:test";

class DialogV2Stub {
  constructor(options) {
    this.options = options;
  }

  render() {
    return this;
  }
}

test("creates a responsive DialogV2 importer with file and source controls", async () => {
  globalThis.game = {
    user: {
      isGM: true
    },
    settings: {
      get: () => "embedded"
    },
    documentTypes: {
      Item: ["base", "loot"]
    },
    i18n: {
      localize: (key) => key
    }
  };
  globalThis.ui = {
    notifications: {
      warn: () => undefined
    }
  };
  globalThis.foundry = {
    applications: {
      api: {
        DialogV2: DialogV2Stub
      }
    }
  };

  const { openImporter } = await import("../scripts/importer.mjs");
  const dialog = openImporter();
  const content = dialog.options.content;

  assert.equal(dialog.options.window.resizable, true);
  assert.doesNotMatch(content, /<form(?:\s|>)/i);
  assert.match(content, /type="file"[^>]+\.md,\.markdown,\.html,\.htm/);
  assert.match(content, /name="sourceFormat"/);
  assert.match(content, /<textarea[^>]+name="source"[^>]+placeholder="Paste, write, or upload Markdown here\."[^>]*><\/textarea>/);
  assert.match(content, /class="runyth-scriptoria-importer__source"/);
  assert.match(content, /data-economics-section/);
  assert.match(content, /id="runyth-scriptoria-economics-price-value"[^>]+name="economics\.price\.value"[^>]+type="number"/);
  assert.match(content, /id="runyth-scriptoria-economics-price-denomination"[^>]+name="economics\.price\.denomination"/);
  assert.match(content, /id="runyth-scriptoria-economics-weight-value"[^>]+name="economics\.weight\.value"[^>]+type="number"/);
  assert.match(content, /id="runyth-scriptoria-economics-weight-units"[^>]*>lb<\/output>/);
  assert.doesNotMatch(content, /economics\.(?:price|weight)\.useDefault/);
  assert.doesNotMatch(content, /readonly|disabled/);
  assert.match(content, /data-final-price/);
  assert.match(content, /data-final-weight/);
});
