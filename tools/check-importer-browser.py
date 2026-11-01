#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
"""Validate directly editable Runyth Scriptoria economics fields in Chromium."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

NODE_FIXTURE = r'''
globalThis.CONFIG = {
  DND5E: {
    currencies: { pp: {}, gp: {}, ep: {}, sp: {}, cp: {} },
    defaultUnits: { weight: { imperial: "lb", metric: "kg" } }
  }
};
globalThis.game = {
  modules: new Map(),
  i18n: { localize: (key) => key },
  settings: { get: (_scope, key) => key === "itemEconomicsOverrides" ? {} : false },
  documentTypes: { Item: ["base", "loot"] }
};
const { buildImporterContent } = await import("./scripts/importer.mjs");
const html = buildImporterContent({
  kind: "pamphlet",
  title: "",
  author: "",
  itemType: "loot",
  access: "embedded",
  removeTitleHeading: true,
  sourceFormat: "markdown",
  source: "Short text with `code`.",
  sourceFileName: ""
}, false);
process.stdout.write(JSON.stringify(html));
'''

BASE_CSS = r'''
html, body { margin: 0; min-height: 100%; background: #111318; color: #e5e7eb; font: 14px sans-serif; }
* { box-sizing: border-box; }
.app { background: #1a1d23; height: calc(100vh - 20px); margin: 10px; max-width: calc(100vw - 20px); overflow: hidden; padding: 12px; }
.window-content, form { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.standard-form .form-group { display: grid; grid-template-columns: 10rem minmax(0, 1fr); gap: .5rem; }
.standard-form .form-fields { display: flex; gap: .35rem; min-width: 0; }
input, select, textarea, button, output { background: #25282e; border: 1px solid #65707d; color: #f8fafc; }
/* Host rules must not affect the enabled module-owned economics controls. */
.form-fields input:disabled, .form-fields select:disabled { max-width: 0; opacity: 0; padding: 0; }
.form-footer { flex: 0 0 auto; min-height: 38px; }
'''


def render_fixture() -> str:
  result = subprocess.run(
    ["node", "--input-type=module", "--eval", NODE_FIXTURE],
    cwd=ROOT,
    check=True,
    capture_output=True,
    text=True,
  )
  return json.loads(result.stdout)


def main() -> None:
  importer_html = render_fixture()
  module_css = (ROOT / "styles" / "runyth-scriptoria.css").read_text(encoding="utf-8")
  document = f"""<!doctype html>
<html>
<head><meta charset="utf-8"><style>{BASE_CSS}\n{module_css}</style></head>
<body>
  <section class="app runyth-scriptoria-importer-window">
    <div class="window-content">
      <form class="standard-form">{importer_html}<footer class="form-footer">Actions</footer></form>
    </div>
  </section>
</body>
</html>"""

  with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
      headless=True,
      executable_path="/usr/bin/chromium",
      args=["--no-sandbox"],
    )
    page = browser.new_page(viewport={"width": 920, "height": 820})
    page.set_content(document)

    selectors = [
      "[data-economics-price-card]",
      "#runyth-scriptoria-economics-price-value",
      "#runyth-scriptoria-economics-price-denomination",
      "[data-economics-weight-card]",
      "#runyth-scriptoria-economics-weight-value",
      "#runyth-scriptoria-economics-weight-units",
    ]
    for selector in selectors:
      element = page.locator(selector)
      assert element.count() == 1, f"missing or duplicate control: {selector}"
      box = element.bounding_box()
      assert box and box["width"] > 35 and box["height"] > 15, (
        f"collapsed control: {selector}: {box}"
      )

    price = page.locator("#runyth-scriptoria-economics-price-value")
    denomination = page.locator("#runyth-scriptoria-economics-price-denomination")
    weight = page.locator("#runyth-scriptoria-economics-weight-value")

    assert price.is_enabled() and weight.is_enabled() and denomination.is_enabled()
    assert price.get_attribute("readonly") is None
    assert weight.get_attribute("readonly") is None
    assert price.input_value() == "5"
    assert weight.input_value() == "0.08"
    assert page.locator("#runyth-scriptoria-economics-weight-units").inner_text().strip() == "lb"
    assert weight.input_value() != "lb"
    assert page.locator("[name='economics.price.useDefault']").count() == 0
    assert page.locator("[name='economics.weight.useDefault']").count() == 0

    price.fill("12")
    denomination.select_option("gp")
    weight.fill("0.4")
    price.focus()
    assert page.evaluate("document.activeElement.id") == "runyth-scriptoria-economics-price-value"
    weight.focus()
    assert page.evaluate("document.activeElement.id") == "runyth-scriptoria-economics-weight-value"

    submitted = page.locator("form").evaluate(
      "form => Object.fromEntries(new FormData(form).entries())"
    )
    assert submitted["economics.price.value"] == "12"
    assert submitted["economics.price.denomination"] == "gp"
    assert submitted["economics.weight.value"] == "0.4"

    for width in (920, 600, 480):
      page.set_viewport_size({"width": width, "height": 820})
      page.wait_for_timeout(25)
      overflow = page.locator("["runyth-scriptoria"]-importer").evaluate(
        "element => element.scrollWidth - element.clientWidth"
      )
      assert overflow <= 1, f"horizontal overflow at {width}px: {overflow}px"
      footer_box = page.locator(".form-footer").bounding_box()
      assert footer_box and footer_box["height"] >= 15

    browser.close()

  print(
    "Validated enabled editable Runyth Scriptoria price and weight fields, exact "
    "FormData values, and narrow-width layout."
  )


if __name__ == "__main__":
  main()
