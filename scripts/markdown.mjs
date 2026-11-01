const PLACEHOLDER_PREFIX = "\uE000SCPT";

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function extractMarkdownTitle(markdown) {
  const lines = stripFrontmatter(normalizeMarkdown(markdown)).split("\n");
  let inFence = false;
  let fenceMarker = "";

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fence = line.match(/^\s*(`{3,}|~{3,})/);

    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceMarker = fence[1][0];
      } else if (fence[1][0] === fenceMarker) {
        inFence = false;
      }
      continue;
    }

    if (inFence) continue;

    const atx = line.match(/^\s{0,3}#\s+(.+?)\s*#*\s*$/);
    if (atx) return stripInlineMarkdown(atx[1]);

    if (index + 1 < lines.length && /^\s*=+\s*$/.test(lines[index + 1])) {
      const candidate = line.trim();
      if (candidate) return stripInlineMarkdown(candidate);
    }
  }

  const fallback = lines.find((line) => line.trim() && !/^\s*---\s*$/.test(line));
  return fallback ? stripInlineMarkdown(fallback.trim()) : "";
}

export function removeFirstLevelOneHeading(markdown) {
  const lines = stripFrontmatter(normalizeMarkdown(markdown)).split("\n");
  let inFence = false;
  let fenceMarker = "";

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fence = line.match(/^\s*(`{3,}|~{3,})/);

    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceMarker = fence[1][0];
      } else if (fence[1][0] === fenceMarker) {
        inFence = false;
      }
      continue;
    }

    if (inFence) continue;

    if (/^\s{0,3}#\s+/.test(line)) {
      lines.splice(index, 1);
      if (lines[index]?.trim() === "") lines.splice(index, 1);
      return lines.join("\n");
    }

    if (
      index + 1 < lines.length
      && line.trim()
      && /^\s*=+\s*$/.test(lines[index + 1])
    ) {
      lines.splice(index, 2);
      if (lines[index]?.trim() === "") lines.splice(index, 1);
      return lines.join("\n");
    }
  }

  return lines.join("\n");
}

export function renderMarkdown(markdown) {
  const source = stripFrontmatter(normalizeMarkdown(markdown));
  const lines = source.split("\n");
  const output = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^\s{0,3}(`{3,}|~{3,})\s*([^\s`]*)\s*$/);
    if (fence) {
      const marker = fence[1][0];
      const minimumLength = fence[1].length;
      const language = fence[2].trim();
      const code = [];
      index += 1;

      while (index < lines.length) {
        const closingPattern = new RegExp(`^\\s{0,3}${escapeRegExp(marker)}{${minimumLength},}\\s*$`);
        if (closingPattern.test(lines[index])) {
          index += 1;
          break;
        }
        code.push(lines[index]);
        index += 1;
      }

      const className = language
        ? ` class="language-${escapeHtml(language.replace(/[^a-zA-Z0-9_-]/g, ""))}"`
        : "";
      output.push(`<pre><code${className}>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    const atxHeading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (atxHeading) {
      const level = atxHeading[1].length;
      output.push(`<h${level}>${renderInline(atxHeading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (index + 1 < lines.length && line.trim()) {
      const setext = lines[index + 1].match(/^\s{0,3}(=+|-+)\s*$/);
      if (setext) {
        const level = setext[1][0] === "=" ? 1 : 2;
        output.push(`<h${level}>${renderInline(line.trim())}</h${level}>`);
        index += 2;
        continue;
      }
    }

    if (/^\s{0,3}((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})$/.test(line)) {
      output.push("<hr>");
      index += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      const table = parseTable(lines, index);
      output.push(table.html);
      index = table.nextIndex;
      continue;
    }

    if (/^\s{0,3}>\s?/.test(line)) {
      const quoted = [];
      while (index < lines.length && /^\s{0,3}>\s?/.test(lines[index])) {
        quoted.push(lines[index].replace(/^\s{0,3}>\s?/, ""));
        index += 1;
      }
      output.push(`<blockquote>${renderMarkdown(quoted.join("\n"))}</blockquote>`);
      continue;
    }

    if (matchListItem(line)) {
      const list = parseList(lines, index);
      output.push(list.html);
      index = list.nextIndex;
      continue;
    }

    const paragraph = [];
    while (index < lines.length && lines[index].trim() && !startsBlock(lines, index)) {
      paragraph.push(lines[index]);
      index += 1;
    }

    if (paragraph.length === 0) {
      paragraph.push(line);
      index += 1;
    }

    const text = paragraph
      .map((paragraphLine) => {
        const hardBreak = /\s{2,}$/.test(paragraphLine);
        const rendered = renderInline(paragraphLine.trimEnd());
        return hardBreak ? `${rendered}<br>` : rendered;
      })
      .join(" ");
    output.push(`<p>${text}</p>`);
  }

  return output.join("\n");
}

export function stripInlineMarkdown(value) {
  return String(value ?? "")
    .replace(/!\[([^\]]*)]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/(`+)([\s\S]*?)\1/g, "$2")
    .replace(/[*_~]+/g, "")
    .replace(/\\([\\`*{}\[\]()#+\-.!_>~|])/g, "$1")
    .trim();
}

function normalizeMarkdown(markdown) {
  return String(markdown ?? "")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replace(/^\uFEFF/, "");
}

function stripFrontmatter(source) {
  const lines = source.split("\n");
  if (lines[0]?.trim() !== "---") return source;

  const closing = lines.slice(1).findIndex((line) => line.trim() === "---");
  if (closing < 0) return source;
  return lines.slice(closing + 2).join("\n").replace(/^\n+/, "");
}

function renderInline(input) {
  const placeholders = [];
  const protect = (value) => {
    const token = `${PLACEHOLDER_PREFIX}${placeholders.length}\uE001`;
    placeholders.push(value);
    return token;
  };

  let text = String(input ?? "");

  text = text.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_match, _ticks, code) => {
    return protect(`<code>${escapeHtml(code.trim())}</code>`);
  });

  text = text.replace(/(@(?:UUID|Compendium|Actor|Item|JournalEntry|Scene|Macro|RollTable)\[[^\]\n]+](?:\{[^}\n]*})?)/g, (match) => {
    return protect(escapeHtml(match));
  });

  text = text.replace(/(\[\[[^\]\n]+]](?:\{[^}\n]*})?)/g, (match) => {
    return protect(escapeHtml(match));
  });

  text = text.replace(/!\[([^\]]*)]\((\S+?)(?:\s+["']([^"']*)["'])?\)/g, (_match, alt, url, title) => {
    const safeUrl = sanitizeUrl(url);
    if (!safeUrl) return escapeHtml(alt);
    const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
    return protect(`<img src="${escapeHtml(safeUrl)}" alt="${escapeHtml(alt)}"${titleAttribute}>`);
  });

  text = text.replace(/\[([^\]]+)]\((\S+?)(?:\s+["']([^"']*)["'])?\)/g, (_match, label, url, title) => {
    const safeUrl = sanitizeUrl(url);
    if (!safeUrl) return escapeHtml(label);
    const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
    return protect(`<a href="${escapeHtml(safeUrl)}"${titleAttribute}>${renderInline(label)}</a>`);
  });

  text = escapeHtml(text);
  text = text.replace(/\\([\\`*{}\[\]()#+\-.!_>~|])/g, "$1");
  text = text.replace(/~~(?=\S)(.+?\S)~~/g, "<del>$1</del>");
  text = text.replace(/\*\*(?=\S)(.+?\S)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/__(?=\S)(.+?\S)__/g, "<strong>$1</strong>");
  text = text.replace(/(?<!\*)\*(?!\*)(?=\S)(.+?\S)\*(?!\*)/g, "<em>$1</em>");
  text = text.replace(/(?<!_)_(?!_)(?=\S)(.+?\S)_(?!_)/g, "<em>$1</em>");

  for (let index = 0; index < placeholders.length; index += 1) {
    const token = escapeHtml(`${PLACEHOLDER_PREFIX}${index}\uE001`);
    text = text.replaceAll(token, placeholders[index]);
  }

  return text;
}

function sanitizeUrl(url) {
  const trimmed = String(url ?? "").trim().replace(/^<|>$/g, "");
  if (!trimmed) return "";

  if (/^(?:https?:|mailto:)/i.test(trimmed)) return trimmed;
  if (/^(?:javascript:|data:|vbscript:)/i.test(trimmed)) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return "";
  return trimmed;
}

function startsBlock(lines, index) {
  const line = lines[index] ?? "";
  if (!line.trim()) return true;
  if (/^\s{0,3}(`{3,}|~{3,})/.test(line)) return true;
  if (/^\s{0,3}#{1,6}\s+/.test(line)) return true;
  if (/^\s{0,3}>\s?/.test(line)) return true;
  if (/^\s{0,3}((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})$/.test(line)) return true;
  if (matchListItem(line)) return true;
  if (isTableStart(lines, index)) return true;
  return index + 1 < lines.length
    && line.trim()
    && /^\s{0,3}(=+|-+)\s*$/.test(lines[index + 1]);
}

function matchListItem(line) {
  return line.match(/^\s{0,3}([-+*]|\d+[.)])\s+(.+)$/);
}

function parseList(lines, startIndex) {
  const first = matchListItem(lines[startIndex]);
  const ordered = /^\d/.test(first[1]);
  const tag = ordered ? "ol" : "ul";
  const items = [];
  let index = startIndex;

  while (index < lines.length) {
    const match = matchListItem(lines[index]);
    if (!match || /^\d/.test(match[1]) !== ordered) break;

    let content = match[2];
    const continuation = [];
    index += 1;

    while (
      index < lines.length
      && lines[index].trim()
      && !matchListItem(lines[index])
      && /^\s{2,}/.test(lines[index])
    ) {
      continuation.push(lines[index].trim());
      index += 1;
    }

    if (continuation.length) content = `${content} ${continuation.join(" ")}`;

    const task = content.match(/^\[([ xX])]\s+(.+)$/);
    if (task) {
      const checked = task[1].toLowerCase() === "x" ? " checked" : "";
      items.push(`<li class="task-list-item"><input type="checkbox" disabled${checked}> ${renderInline(task[2])}</li>`);
    } else {
      items.push(`<li>${renderInline(content)}</li>`);
    }
  }

  const className = items.some((item) => item.includes("task-list-item"))
    ? ' class="contains-task-list"'
    : "";
  return {
    html: `<${tag}${className}>${items.join("")}</${tag}>`,
    nextIndex: index
  };
}

function isTableStart(lines, index) {
  if (index + 1 >= lines.length) return false;
  if (!lines[index].includes("|")) return false;
  const delimiterCells = splitTableRow(lines[index + 1]);
  return delimiterCells.length > 0
    && delimiterCells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function parseTable(lines, startIndex) {
  const headers = splitTableRow(lines[startIndex]);
  const delimiters = splitTableRow(lines[startIndex + 1]);
  const alignments = delimiters.map((cell) => {
    const trimmed = cell.trim();
    if (trimmed.startsWith(":") && trimmed.endsWith(":")) return "center";
    if (trimmed.endsWith(":")) return "right";
    if (trimmed.startsWith(":")) return "left";
    return "";
  });

  const headerHtml = headers.map((header, index) => {
    const align = alignments[index] ? ` style="text-align:${alignments[index]}"` : "";
    return `<th${align}>${renderInline(header.trim())}</th>`;
  }).join("");

  const rows = [];
  let index = startIndex + 2;
  while (index < lines.length && lines[index].trim() && lines[index].includes("|")) {
    const cells = splitTableRow(lines[index]);
    const row = headers.map((_header, cellIndex) => {
      const align = alignments[cellIndex] ? ` style="text-align:${alignments[cellIndex]}"` : "";
      return `<td${align}>${renderInline((cells[cellIndex] ?? "").trim())}</td>`;
    }).join("");
    rows.push(`<tr>${row}</tr>`);
    index += 1;
  }

  return {
    html: `<table><thead><tr>${headerHtml}</tr></thead><tbody>${rows.join("")}</tbody></table>`,
    nextIndex: index
  };
}

function splitTableRow(line) {
  let source = line.trim();
  if (source.startsWith("|")) source = source.slice(1);
  if (source.endsWith("|")) source = source.slice(0, -1);

  const cells = [];
  let current = "";
  let escaped = false;

  for (const character of source) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = true;
      current += character;
      continue;
    }

    if (character === "|") {
      cells.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  cells.push(current);
  return cells;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
