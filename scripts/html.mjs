// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
const FORBIDDEN_ELEMENTS = Object.freeze([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "template",
  "noscript",
  "base",
  "meta",
  "link",
  "form",
  "input",
  "button",
  "select",
  "textarea",
  "svg",
  "math"
]);

const URL_ATTRIBUTES = new Set([
  "href",
  "src",
  "poster",
  "cite",
  "action",
  "formaction",
  "xlink:href"
]);

export function extractHtmlTitle(html) {
  const source = String(html ?? "");
  const parsed = parseHtml(source);

  if (parsed) {
    const heading = normalizeText(parsed.body.querySelector("h1")?.textContent);
    if (heading) return heading;

    const documentTitle = normalizeText(parsed.querySelector("title")?.textContent);
    if (documentTitle) return documentTitle;
  }

  const headingMatch = source.match(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i);
  if (headingMatch) return normalizeText(stripTags(headingMatch[1]));

  const titleMatch = source.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
  return titleMatch ? normalizeText(stripTags(titleMatch[1])) : "";
}

export function removeFirstHtmlHeading(html) {
  const source = String(html ?? "");
  const parsed = parseHtml(source);

  if (parsed) {
    parsed.body.querySelector("h1")?.remove();
    return parsed.body.innerHTML.trim();
  }

  return extractHtmlBody(source)
    .replace(/<h1\b[^>]*>[\s\S]*?<\/h1\s*>/i, "")
    .trim();
}

export function extractHtmlBody(html) {
  const source = String(html ?? "");
  const parsed = parseHtml(source);
  if (parsed) return parsed.body.innerHTML.trim();

  const body = source.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i);
  return (body?.[1] ?? source)
    .replace(/<!doctype[^>]*>/gi, "")
    .replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi, "")
    .trim();
}

export function sanitizeImportedHtml(html) {
  const source = extractHtmlBody(html);
  const parsed = parseHtml(source);
  let sanitized;

  if (parsed) {
    for (const selector of FORBIDDEN_ELEMENTS) {
      parsed.body.querySelectorAll(selector).forEach((element) => element.remove());
    }

    parsed.body.querySelectorAll("*").forEach((element) => {
      for (const attribute of Array.from(element.attributes)) {
        const name = attribute.name.toLowerCase();
        if (
          name.startsWith("on")
          || name === "style"
          || name === "srcdoc"
          || name === "xmlns"
          || name === "contenteditable"
          || name === "srcset"
          || name === "ping"
          || name === "background"
        ) {
          element.removeAttribute(attribute.name);
          continue;
        }

        if (URL_ATTRIBUTES.has(name) && !sanitizeUrl(attribute.value)) {
          element.removeAttribute(attribute.name);
        }
      }

      if (element.tagName === "A" && element.getAttribute("target") === "_blank") {
        element.setAttribute("rel", "noopener noreferrer");
      }
    });

    sanitized = parsed.body.innerHTML;
  } else {
    sanitized = sanitizeWithoutDom(source);
  }

  const cleanHtml = globalThis.foundry?.utils?.cleanHTML;
  if (typeof cleanHtml === "function") {
    try {
      sanitized = cleanHtml(sanitized);
    } catch (error) {
      console.warn("runyth-scriptoria | Foundry HTML cleaning failed; using the local sanitizer output.", error);
    }
  }

  return String(sanitized ?? "").trim();
}

export function htmlToPlainText(html) {
  const parsed = parseHtml(String(html ?? ""));
  if (parsed) return normalizeText(parsed.body.textContent);
  return normalizeText(stripTags(String(html ?? "")));
}

function parseHtml(source) {
  if (typeof globalThis.DOMParser !== "function") return null;

  try {
    return new globalThis.DOMParser().parseFromString(source, "text/html");
  } catch {
    return null;
  }
}

function sanitizeWithoutDom(source) {
  let sanitized = String(source ?? "");

  for (const tag of FORBIDDEN_ELEMENTS) {
    const paired = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, "gi");
    const standalone = new RegExp(`<${tag}\\b[^>]*\\/?\\s*>`, "gi");
    sanitized = sanitized.replace(paired, "").replace(standalone, "");
  }

  sanitized = sanitized
    .replace(/\s(?:on[a-z0-9_-]+|style|srcdoc|xmlns|contenteditable|srcset|ping|background)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(href|src|poster|cite|action|formaction|xlink:href)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi, (match, name, _whole, doubleQuoted, singleQuoted, unquoted) => {
      const value = doubleQuoted ?? singleQuoted ?? unquoted ?? "";
      return sanitizeUrl(value) ? match : "";
    });

  return sanitized;
}

function sanitizeUrl(value) {
  const url = String(value ?? "").trim().replace(/^<|>$/g, "");
  if (!url) return false;
  if (/^(?:https?:|mailto:)/i.test(url)) return true;
  if (/^(?:javascript:|data:|vbscript:|file:)/i.test(url)) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return false;
  return true;
}

function stripTags(value) {
  return String(value ?? "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/gi, "'");
}

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

