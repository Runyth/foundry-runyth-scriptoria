// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { access, readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(path.join(root, "module.json"), "utf8"));
const required = [
  "module.json",
  "README.md",
  "LICENSE",
  "docs/EXTENSION_API.md",
  "types/runyth-scriptoria.d.ts",
  ...manifest.esmodules,
  ...manifest.styles
];

for (const relativePath of required) {
  await access(path.join(root, relativePath));
}

const scripts = await collectFiles(path.join(root, "scripts"), ".mjs");
for (const script of scripts) {
  const result = spawnSync(process.execPath, ["--check", script], {
    cwd: root,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
}

console.log(`Validated ${required.length} required files and ${scripts.length} module scripts.`);

async function collectFiles(directory, extension) {
  const entries = await readdir(directory, {
    withFileTypes: true
  });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(absolutePath, extension));
    } else if (entry.name.endsWith(extension)) {
      files.push(absolutePath);
    }
  }

  return files;
}
