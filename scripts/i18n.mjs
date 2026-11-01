// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
export function localize(key, fallback = key) {
  const localized = globalThis.game?.i18n?.localize?.(key);
  return localized && localized !== key ? localized : fallback;
}

export function format(key, data = {}, fallback = key) {
  const formatted = globalThis.game?.i18n?.format?.(key, data);
  if (formatted && formatted !== key) return formatted;

  return String(fallback).replace(/\{([^}]+)\}/g, (_match, name) => {
    return Object.hasOwn(data, name) ? String(data[name]) : `{${name}}`;
  });
}
