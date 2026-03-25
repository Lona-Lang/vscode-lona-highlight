"use strict";

const KEYWORDS = new Set([
  "def",
  "struct",
  "var",
  "ret",
  "break",
  "continue",
  "if",
  "else",
  "for",
  "import",
  "ref",
  "const",
  "cast",
  "true",
  "false",
  "null"
]);

const BUILTIN_TYPES = new Set([
  "type",
  "u8",
  "i8",
  "u16",
  "i16",
  "u32",
  "i32",
  "u64",
  "i64",
  "int",
  "uint",
  "f32",
  "f64",
  "bool"
]);

function maskLine(line) {
  let out = "";
  let inDouble = false;
  let inSingle = false;
  let escaped = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];

    if (!inDouble && !inSingle && ch === "/" && next === "/") {
      out += " ".repeat(line.length - i);
      break;
    }

    if (inDouble) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "\"") {
        inDouble = false;
      }
      out += " ";
      continue;
    }

    if (inSingle) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "'") {
        inSingle = false;
      }
      out += " ";
      continue;
    }

    if (ch === "\"") {
      inDouble = true;
      out += " ";
      continue;
    }

    if (ch === "'") {
      inSingle = true;
      out += " ";
      continue;
    }

    out += ch;
  }

  return out.padEnd(line.length, " ");
}

function findMatchingParen(text, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") {
      depth++;
    } else if (ch === ")") {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

function splitTopLevel(text) {
  const parts = [];
  let start = 0;
  let paren = 0;
  let bracket = 0;
  let angle = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") {
      paren++;
    } else if (ch === ")") {
      paren--;
    } else if (ch === "[") {
      bracket++;
    } else if (ch === "]") {
      bracket--;
    } else if (ch === "<") {
      angle++;
    } else if (ch === ">") {
      angle--;
    } else if (ch === "," && paren === 0 && bracket === 0 && angle === 0) {
      parts.push({ text: text.slice(start, i), offset: start });
      start = i + 1;
    }
  }

  parts.push({ text: text.slice(start), offset: start });
  return parts;
}

function addSymbol(symbols, name, symbol) {
  if (!symbols.has(name)) {
    symbols.set(name, []);
  }
  symbols.get(name).push(symbol);
}

function addToken(tokens, seen, line, start, length, type, modifiers = []) {
  if (length <= 0) {
    return;
  }
  const key = `${line}:${start}:${length}:${type}:${modifiers.join(",")}`;
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  tokens.push({ line, start, length, type, modifiers });
}

function isIdentifierWord(name) {
  return !KEYWORDS.has(name) && !BUILTIN_TYPES.has(name);
}

function resolveSymbol(symbols, name, line, start) {
  const entries = symbols.get(name);
  if (!entries) {
    return null;
  }

  let best = null;
  for (const entry of entries) {
    if (entry.line > line || (entry.line === line && entry.start > start)) {
      continue;
    }
    if (
      best === null ||
      entry.line > best.line ||
      (entry.line === best.line && entry.start > best.start)
    ) {
      best = entry;
    }
  }
  return best;
}

function classifyIdentifier(symbols, name, line, start, nextChar) {
  const symbol = resolveSymbol(symbols, name, line, start);
  if (symbol) {
    if (symbol.kind === "parameter") {
      return "parameter";
    }
    if (symbol.kind === "namespace") {
      return "namespace";
    }
    if (symbol.kind === "type") {
      return "type";
    }
    if (symbol.kind === "function") {
      return nextChar === "(" || nextChar === "&" ? "function" : null;
    }
    return "variable";
  }

  if (nextChar === "(" || nextChar === "&") {
    return null;
  }

  return "variable";
}

function getPreviousWord(line, start) {
  let i = start - 1;
  while (i >= 0 && /\s/.test(line[i])) {
    i--;
  }
  if (i < 0 || !/[A-Za-z0-9_]/.test(line[i])) {
    return "";
  }

  let end = i + 1;
  while (i >= 0 && /[A-Za-z0-9_]/.test(line[i])) {
    i--;
  }
  return line.slice(i + 1, end);
}

function analyzeLona(text) {
  const lines = text.split(/\r?\n/);
  const masked = lines.map(maskLine);
  const symbols = new Map();
  const tokens = [];
  const seen = new Set();

  for (let lineIndex = 0; lineIndex < masked.length; lineIndex++) {
    const line = masked[lineIndex];

    for (const match of line.matchAll(/\bimport\b\s+([A-Za-z0-9_./-]+)/g)) {
      const path = match[1];
      const segments = path.split("/").filter(Boolean);
      const localName = segments[segments.length - 1];
      if (!localName) {
        continue;
      }
      addSymbol(symbols, localName, {
        kind: "namespace",
        line: lineIndex,
        start: match.index + match[0].length - localName.length
      });
    }

    for (const match of line.matchAll(/\bstruct\b\s+([A-Za-z_][A-Za-z0-9_]*)/g)) {
      const name = match[1];
      const start = match.index + match[0].length - name.length;
      addSymbol(symbols, name, { kind: "type", line: lineIndex, start });
      addToken(tokens, seen, lineIndex, start, name.length, "type", ["declaration"]);
    }

    for (const match of line.matchAll(/\bdef\b\s+([A-Za-z_][A-Za-z0-9_]*)/g)) {
      const name = match[1];
      const start = match.index + match[0].length - name.length;
      addSymbol(symbols, name, { kind: "function", line: lineIndex, start });
      addToken(tokens, seen, lineIndex, start, name.length, "function", ["declaration"]);

      const openParen = line.indexOf("(", match.index + match[0].length);
      if (openParen === -1) {
        continue;
      }
      const closeParen = findMatchingParen(line, openParen);
      if (closeParen === -1) {
        continue;
      }

      const paramText = line.slice(openParen + 1, closeParen);
      for (const part of splitTopLevel(paramText)) {
        const paramMatch = /^(\s*)(ref\b\s+)?([A-Za-z_][A-Za-z0-9_]*)/.exec(part.text);
        if (!paramMatch) {
          continue;
        }
        const nameStart =
          openParen +
          1 +
          part.offset +
          paramMatch[1].length +
          (paramMatch[2] ? paramMatch[2].length : 0);
        const paramName = paramMatch[3];
        addSymbol(symbols, paramName, {
          kind: "parameter",
          line: lineIndex,
          start: nameStart
        });
        addToken(tokens, seen, lineIndex, nameStart, paramName.length, "parameter", [
          "declaration"
        ]);
      }
    }

    for (const match of line.matchAll(/\bvar\b\s+([A-Za-z_][A-Za-z0-9_]*)/g)) {
      const name = match[1];
      const start = match.index + match[0].length - name.length;
      addSymbol(symbols, name, { kind: "variable", line: lineIndex, start });
      addToken(tokens, seen, lineIndex, start, name.length, "variable", ["declaration"]);
    }

    const refMatch = /^\s*ref\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(line);
    if (refMatch) {
      const start = refMatch[0].length - refMatch[1].length;
      addSymbol(symbols, refMatch[1], {
        kind: "variable",
        line: lineIndex,
        start
      });
      addToken(tokens, seen, lineIndex, start, refMatch[1].length, "variable", [
        "declaration"
      ]);
    }
  }

  for (let lineIndex = 0; lineIndex < masked.length; lineIndex++) {
    const line = masked[lineIndex];

    for (const match of line.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g)) {
      const name = match[1];
      const start = match.index;
      const end = start + name.length;
      const prevChar = start > 0 ? line[start - 1] : "";
      const nextSlice = line.slice(end);
      const nextMatch = /^\s*([.(]|&<|&)/.exec(nextSlice);
      const nextChar = nextMatch ? nextMatch[1][0] : "";
      const previousWord = getPreviousWord(line, start);

      if (!isIdentifierWord(name) || name === "self") {
        continue;
      }
      if (prevChar === ".") {
        continue;
      }

      const decl = resolveSymbol(symbols, name, lineIndex, start);
      if (decl && decl.line === lineIndex && decl.start === start) {
        continue;
      }

      if (
        !decl &&
        previousWord &&
        previousWord !== "if" &&
        previousWord !== "ret" &&
        previousWord !== "for" &&
        previousWord !== "else"
      ) {
        continue;
      }

      const type = classifyIdentifier(symbols, name, lineIndex, start, nextChar);
      if (!type) {
        continue;
      }
      addToken(tokens, seen, lineIndex, start, name.length, type);
    }
  }

  tokens.sort((a, b) => a.line - b.line || a.start - b.start || a.length - b.length);
  return tokens;
}

module.exports = {
  analyzeLona
};
