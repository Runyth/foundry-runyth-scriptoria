import { localize } from "./i18n.mjs";

export const MAX_IMPORT_FILE_SIZE = 5 * 1024 * 1024;
export const ACCEPTED_FILE_TYPES = ".md,.markdown,.html,.htm,text/markdown,text/html";

export function detectSourceFormat(file) {
  const name = String(file?.name ?? "").toLowerCase();
  const mimeType = String(file?.type ?? "").toLowerCase().split(";")[0].trim();

  if (name.endsWith(".md") || name.endsWith(".markdown")) return "markdown";
  if (name.endsWith(".html") || name.endsWith(".htm")) return "html";
  if (mimeType === "text/markdown" || mimeType === "text/x-markdown") return "markdown";
  if (mimeType === "text/html") return "html";

  throw new Error(localize("RUNYTH-SCRIPTORIA.FileImport.UnsupportedType", "Choose a Markdown (.md, .markdown) or HTML (.html, .htm) file."));
}

export async function readDocumentFile(file) {
  if (!file) throw new Error(localize("RUNYTH-SCRIPTORIA.FileImport.NoFile", "No document file was selected."));
  if (Number(file.size ?? 0) > MAX_IMPORT_FILE_SIZE) {
    throw new Error(localize("RUNYTH-SCRIPTORIA.FileImport.TooLarge", "The selected document is larger than 5 MiB."));
  }

  const sourceFormat = detectSourceFormat(file);
  const source = await readFileText(file);
  const normalized = String(source ?? "").replace(/^\uFEFF/, "");

  if (normalized.includes("\u0000")) {
    throw new Error(localize("RUNYTH-SCRIPTORIA.FileImport.NotText", "The selected file does not appear to be a plain-text document."));
  }
  if (!normalized.trim()) throw new Error(localize("RUNYTH-SCRIPTORIA.FileImport.Empty", "The selected document file is empty."));

  return {
    sourceFormat,
    source: normalized,
    fileName: String(file.name ?? "")
  };
}

async function readFileText(file) {
  if (typeof file.text === "function") return file.text();
  if (typeof globalThis.FileReader !== "function") {
    throw new Error(localize("RUNYTH-SCRIPTORIA.FileImport.UnsupportedBrowser", "This browser cannot read the selected document file."));
  }

  return new Promise((resolve, reject) => {
    const reader = new globalThis.FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")), {
      once: true
    });
    reader.addEventListener("error", () => reject(reader.error ?? new Error(localize("RUNYTH-SCRIPTORIA.FileImport.ReadFailed", "Unable to read the selected file."))), {
      once: true
    });
    reader.readAsText(file, "UTF-8");
  });
}
