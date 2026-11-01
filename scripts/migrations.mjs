// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import {
  FLAG_KEY,
  FLAG_SCOPE,
  MODULE_ID,
  SCHEMA_VERSION
} from "./constants.mjs";
import { buildEconomicsFlagData } from "./economics.mjs";
import {
  getScriptoriaData,
  isScriptoriaItem
} from "./documents.mjs";

export async function migrateLegacyEconomicsMetadata() {
  if (!globalThis.game?.user?.isGM) return 0;
  const candidates = [
    ...Array.from(globalThis.game?.items ?? []),
    ...Array.from(globalThis.game?.actors ?? []).flatMap((actor) => Array.from(actor.items ?? []))
  ];
  const legacy = candidates.filter((item) => {
    if (!isScriptoriaItem(item)) return false;
    const data = getScriptoriaData(item);
    return !data?.economics;
  });
  if (!legacy.length) return 0;

  const results = await Promise.allSettled(legacy.map((item) => item.update({
    [`flags.${FLAG_SCOPE}.${FLAG_KEY}.schemaVersion`]: SCHEMA_VERSION,
    [`flags.${FLAG_SCOPE}.${FLAG_KEY}.economics`]: buildEconomicsFlagData(null, {
      legacy: true
    })
  }, {
    render: false,
    runythScriptoriaMigration: true
  })));

  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length) {
    console.warn(`${MODULE_ID} | ${failures.length} legacy economics metadata migrations failed. Existing Item price and weight values were not changed.`, failures);
  }
  return results.length - failures.length;
}
