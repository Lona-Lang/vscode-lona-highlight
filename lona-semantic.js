"use strict";

const KEYWORDS = new Set([
  "def",
  "struct",
  "trait",
  "impl",
  "var",
  "global",
  "set",
  "ret",
  "break",
  "continue",
  "if",
  "else",
  "for",
  "import",
  "ref",
  "const",
  "dyn",
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

const MULTI_CHAR_OPERATORS = [
  "&<",
  "<<=",
  ">>=",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "&=",
  "^=",
  "|=",
  "==",
  "!=",
  "<=",
  ">=",
  "<<",
  ">>",
  "&&",
  "||"
];

const PUNCTUATION = new Set(["{", "}", "(", ")", "[", "]", ",", ".", ":", "#"]);
const TYPE_CONTEXT_BREAKS = new Set([",", ")", "]", "}", "=", "{"]);
const TOKEN_PRIORITY = new Map([
  ["namespace", 1],
  ["type", 2],
  ["function", 3],
  ["parameter", 4],
  ["variable", 5]
]);

function tokenize(text) {
  const tokens = [];
  let i = 0;
  let line = 0;
  let column = 0;

  function push(kind, value, start, end) {
    tokens.push({
      ordinal: tokens.length,
      kind,
      value,
      line,
      start,
      end
    });
  }

  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === "\r" && next === "\n") {
      push("newline", "\n", column, column + 1);
      i += 2;
      line++;
      column = 0;
      continue;
    }

    if (ch === "\n") {
      push("newline", "\n", column, column + 1);
      i++;
      line++;
      column = 0;
      continue;
    }

    if (ch === " " || ch === "\t") {
      i++;
      column++;
      continue;
    }

    if (ch === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n" && text[i] !== "\r") {
        i++;
        column++;
      }
      continue;
    }

    if (ch === "\"" || ch === "'") {
      const quote = ch;
      const start = column;
      const startIndex = i;
      i++;
      column++;
      let escaped = false;
      while (i < text.length) {
        const current = text[i];
        if (current === "\r" || current === "\n") {
          break;
        }
        i++;
        column++;
        if (escaped) {
          escaped = false;
        } else if (current === "\\") {
          escaped = true;
        } else if (current === quote) {
          break;
        }
      }
      push(quote === "\"" ? "string" : "char", text.slice(startIndex, i), start, column);
      continue;
    }

    if (/[0-9]/.test(ch)) {
      const start = column;
      let j = i;
      while (j < text.length && /[0-9]/.test(text[j])) {
        j++;
      }
      if (text[j] === "." && /[0-9]/.test(text[j + 1])) {
        j++;
        while (j < text.length && /[0-9]/.test(text[j])) {
          j++;
        }
      }
      const value = text.slice(i, j);
      push("number", value, start, start + value.length);
      column += value.length;
      i = j;
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      const start = column;
      let j = i + 1;
      while (j < text.length && /[A-Za-z0-9_]/.test(text[j])) {
        j++;
      }
      const value = text.slice(i, j);
      const kind = KEYWORDS.has(value)
        ? "keyword"
        : BUILTIN_TYPES.has(value)
          ? "builtinType"
          : "identifier";
      push(kind, value, start, start + value.length);
      column += value.length;
      i = j;
      continue;
    }

    let matchedOperator = null;
    for (const operator of MULTI_CHAR_OPERATORS) {
      if (text.startsWith(operator, i)) {
        matchedOperator = operator;
        break;
      }
    }
    if (matchedOperator) {
      push("operator", matchedOperator, column, column + matchedOperator.length);
      i += matchedOperator.length;
      column += matchedOperator.length;
      continue;
    }

    if (PUNCTUATION.has(ch)) {
      push("punctuation", ch, column, column + 1);
      i++;
      column++;
      continue;
    }

    push("operator", ch, column, column + 1);
    i++;
    column++;
  }

  return tokens;
}

function createScope(parent, startOrdinal) {
  const scope = {
    parent,
    start: startOrdinal,
    end: Infinity,
    children: [],
    symbols: new Map()
  };

  if (parent) {
    parent.children.push(scope);
  }

  return scope;
}

function addSymbol(scope, symbol) {
  if (!scope.symbols.has(symbol.name)) {
    scope.symbols.set(symbol.name, []);
  }
  scope.symbols.get(symbol.name).push(symbol);
}

function getPriority(type) {
  return TOKEN_PRIORITY.get(type) || Number.MAX_SAFE_INTEGER;
}

function mergeModifiers(existing, modifiers) {
  const merged = new Set(existing);
  for (const modifier of modifiers) {
    merged.add(modifier);
  }
  return Array.from(merged);
}

function setTokenClassification(state, token, type, modifiers = []) {
  if (!token || token.kind !== "identifier") {
    return;
  }

  const current = state.classifications.get(token.ordinal);
  if (!current) {
    state.classifications.set(token.ordinal, { type, modifiers: [...modifiers] });
    return;
  }

  if (current.type === type) {
    current.modifiers = mergeModifiers(current.modifiers, modifiers);
    return;
  }

  if (getPriority(type) < getPriority(current.type)) {
    state.classifications.set(token.ordinal, { type, modifiers: [...modifiers] });
  }
}

function declareSymbol(state, scope, token, kind, extra = {}) {
  const symbol = {
    name: token.value,
    kind,
    ordinal: token.ordinal,
    scope,
    readonly: Boolean(extra.readonly)
  };
  addSymbol(scope, symbol);

  const type =
    kind === "namespace"
      ? "namespace"
      : kind === "type"
        ? "type"
        : kind === "function"
          ? "function"
          : kind === "parameter"
            ? "parameter"
            : "variable";
  const modifiers = ["declaration"];
  if (symbol.readonly) {
    modifiers.push("readonly");
  }
  setTokenClassification(state, token, type, modifiers);
  return symbol;
}

function declareMember(state, token, kind, extra = {}) {
  void extra;
  setTokenClassification(state, token, kind === "method" ? "function" : "variable", [
    "declaration"
  ]);
}

function isAtEnd(state) {
  return state.cursor >= state.tokens.length;
}

function peek(state, offset = 0) {
  return state.tokens[state.cursor + offset] || null;
}

function consume(state) {
  const token = peek(state);
  if (token) {
    state.cursor++;
  }
  return token;
}

function skipNewlines(state) {
  while (!isAtEnd(state) && peek(state).kind === "newline") {
    state.cursor++;
  }
}

function isLineBreakToken(token) {
  return token === null || token.kind === "newline";
}

function isKeyword(token, value) {
  return token && token.kind === "keyword" && token.value === value;
}

function isTokenValue(token, value) {
  return token && token.value === value;
}

function previousSignificant(tokens, index) {
  for (let i = index - 1; i >= 0; i--) {
    if (tokens[i].kind !== "newline") {
      return tokens[i];
    }
  }
  return null;
}

function nextSignificant(tokens, index) {
  for (let i = index + 1; i < tokens.length; i++) {
    if (tokens[i].kind !== "newline") {
      return tokens[i];
    }
  }
  return null;
}

function findInnermostScope(scope, ordinal) {
  if (ordinal < scope.start || ordinal >= scope.end) {
    return null;
  }

  for (const child of scope.children) {
    const nested = findInnermostScope(child, ordinal);
    if (nested) {
      return nested;
    }
  }

  return scope;
}

function resolveSymbol(rootScope, ordinal, name) {
  let scope = findInnermostScope(rootScope, ordinal);
  while (scope) {
    const entries = scope.symbols.get(name);
    if (entries) {
      for (let i = entries.length - 1; i >= 0; i--) {
        if (entries[i].ordinal <= ordinal) {
          return entries[i];
        }
      }
    }
    scope = scope.parent;
  }
  return null;
}

function getSymbolClassification(symbol) {
  if (!symbol) {
    return null;
  }

  if (symbol.kind === "namespace") {
    return { type: "namespace", modifiers: [] };
  }
  if (symbol.kind === "type") {
    return { type: "type", modifiers: [] };
  }
  if (symbol.kind === "function") {
    return { type: "function", modifiers: [] };
  }
  if (symbol.kind === "parameter") {
    return { type: "parameter", modifiers: symbol.readonly ? ["readonly"] : [] };
  }
  if (symbol.kind === "variable") {
    return { type: "variable", modifiers: symbol.readonly ? ["readonly"] : [] };
  }

  return null;
}

function findMatchingToken(tokens, startOrdinal, openValue, closeValue) {
  let depth = 0;
  for (let i = startOrdinal; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.value === openValue) {
      depth++;
    } else if (token.value === closeValue) {
      depth--;
      if (depth === 0) {
        return token;
      }
    }
  }

  return null;
}

function nextAfterBracketSuffix(tokens, ordinal) {
  let next = nextSignificant(tokens, ordinal);
  while (isTokenValue(next, "[")) {
    const closing = findMatchingToken(tokens, next.ordinal, "[", "]");
    if (!closing) {
      return null;
    }
    next = nextSignificant(tokens, closing.ordinal);
  }
  return next;
}

function isTypeStartToken(token) {
  return Boolean(
    token &&
      (token.kind === "builtinType" ||
        token.kind === "identifier" ||
        token.value === "<" ||
        token.value === "(")
  );
}

function markSelectorTokens(state, parts, finalType) {
  for (let i = 0; i < parts.length; i++) {
    setTokenClassification(state, parts[i], i === parts.length - 1 ? finalType : "namespace");
  }
}

function parseQualifiedTypeName(state) {
  const parts = [];
  let lastName = null;

  while (!isAtEnd(state)) {
    const token = peek(state);
    if (!token || token.kind !== "identifier") {
      break;
    }

    parts.push(consume(state));
    lastName = token.value;

    if (!isTokenValue(peek(state), ".")) {
      break;
    }

    consume(state);
    if (peek(state)?.kind !== "identifier") {
      break;
    }
  }

  if (parts.length > 0) {
    markSelectorTokens(state, parts, "type");
  }

  return lastName;
}

function parseType(state, stopPredicate) {
  let lastTypeName = null;

  function parseTypeSequence(terminatorValues) {
    while (!isAtEnd(state)) {
      skipNewlines(state);
      const token = peek(state);
      if (!token || terminatorValues.has(token.value)) {
        break;
      }

      if (isKeyword(token, "ref")) {
        consume(state);
      }

      const nestedName = parseType(state, current =>
        !current || terminatorValues.has(current.value) || current.kind === "newline"
      );
      if (nestedName) {
        lastTypeName = nestedName;
      }

      skipNewlines(state);
      if (isTokenValue(peek(state), ",")) {
        consume(state);
      }
    }
  }

  const token = peek(state);
  if (!token || stopPredicate(token)) {
    return lastTypeName;
  }

  if (token.kind === "builtinType") {
    consume(state);
    lastTypeName = token.value;
  } else if (token.kind === "identifier") {
    lastTypeName = parseQualifiedTypeName(state);
  } else if (isTokenValue(token, "<")) {
    consume(state);
    parseTypeSequence(new Set([">"]));
    if (isTokenValue(peek(state), ">")) {
      consume(state);
    }
  } else if (isTokenValue(token, "(")) {
    consume(state);
    skipNewlines(state);
    if (isTokenValue(peek(state), ":")) {
      consume(state);
      skipNewlines(state);
      if (!isTokenValue(peek(state), ")")) {
        const nestedName = parseType(state, current => !current || current.value === ")");
        if (nestedName) {
          lastTypeName = nestedName;
        }
      }
    } else if (!isTokenValue(peek(state), ")")) {
      parseTypeSequence(new Set([":", ")"]));
      skipNewlines(state);
      if (isTokenValue(peek(state), ":")) {
        consume(state);
        skipNewlines(state);
        if (!isTokenValue(peek(state), ")")) {
          const nestedName = parseType(state, current => !current || current.value === ")");
          if (nestedName) {
            lastTypeName = nestedName;
          }
        }
      }
    }
    if (isTokenValue(peek(state), ")")) {
      consume(state);
    }
  } else {
    return lastTypeName;
  }

  while (!isAtEnd(state)) {
    skipNewlines(state);
    const current = peek(state);
    if (!current || stopPredicate(current)) {
      break;
    }

    if (isTokenValue(current, "*")) {
      consume(state);
      continue;
    }

    if (isTokenValue(current, "[")) {
      consume(state);
      skipNewlines(state);
      if (isTokenValue(peek(state), "*")) {
        consume(state);
      } else if (isTypeStartToken(peek(state))) {
        parseTypeSequence(new Set(["]"]));
      } else if (!isTokenValue(peek(state), "]")) {
        let depth = 1;
        while (!isAtEnd(state) && depth > 0) {
          const inner = peek(state);
          if (isKeyword(inner, "cast")) {
            consumeCastType(state);
            continue;
          }
          if (inner?.kind === "identifier" && isTokenValue(peek(state, 1), "&<")) {
            consumeFunctionPointerReference(state);
            continue;
          }
          if (isTokenValue(inner, "[")) {
            depth++;
          } else if (isTokenValue(inner, "]")) {
            depth--;
            if (depth === 0) {
              break;
            }
          }
          consume(state);
        }
      }
      if (isTokenValue(peek(state), "]")) {
        consume(state);
      }
      continue;
    }

    if (isKeyword(current, "const")) {
      consume(state);
      continue;
    }

    if (isKeyword(current, "dyn")) {
      consume(state);
      continue;
    }

    if (TYPE_CONTEXT_BREAKS.has(current.value)) {
      break;
    }

    break;
  }

  return lastTypeName;
}

function consumeCastType(state) {
  if (!isKeyword(peek(state), "cast")) {
    return;
  }

  consume(state);
  if (!isTokenValue(peek(state), "[")) {
    return;
  }

  consume(state);
  parseType(state, token => !token || token.value === "]");
  if (isTokenValue(peek(state), "]")) {
    consume(state);
  }
}

function consumeFunctionPointerReference(state) {
  const nameToken = peek(state);
  if (!nameToken || nameToken.kind !== "identifier" || !isTokenValue(peek(state, 1), "&<")) {
    return false;
  }

  setTokenClassification(state, consume(state), "function");
  consume(state);
  if (!isTokenValue(peek(state), ">")) {
    while (!isAtEnd(state) && !isTokenValue(peek(state), ">")) {
      skipNewlines(state);
      if (isKeyword(peek(state), "ref")) {
        consume(state);
      }
      parseType(state, token => !token || token.value === "," || token.value === ">");
      skipNewlines(state);
      if (isTokenValue(peek(state), ",")) {
        consume(state);
      } else {
        break;
      }
    }
  }
  if (isTokenValue(peek(state), ">")) {
    consume(state);
  }

  return true;
}

function skipExpression(state, options = {}) {
  let paren = 0;
  let bracket = 0;
  let brace = 0;

  while (!isAtEnd(state)) {
    const token = peek(state);
    if (!token) {
      return;
    }

    if (paren === 0 && bracket === 0 && brace === 0) {
      if (options.stopAtBlock && token.value === "{") {
        return;
      }
      if (options.stopAtLineEnd && token.kind === "newline") {
        return;
      }
      if (options.stopAtClosingBrace && token.value === "}") {
        return;
      }
    }

    if (isKeyword(token, "cast")) {
      consumeCastType(state);
      continue;
    }

    if (token.kind === "identifier" && isTokenValue(peek(state, 1), "&<")) {
      consumeFunctionPointerReference(state);
      continue;
    }

    if (token.value === "(") {
      paren++;
    } else if (token.value === ")") {
      if (paren === 0 && !options.stopAtLineEnd) {
        return;
      }
      paren = Math.max(paren - 1, 0);
    } else if (token.value === "[") {
      bracket++;
    } else if (token.value === "]") {
      bracket = Math.max(bracket - 1, 0);
    } else if (token.value === "{") {
      brace++;
    } else if (token.value === "}") {
      brace = Math.max(brace - 1, 0);
    }

    consume(state);
  }
}

function consumeLineEnd(state) {
  if (peek(state)?.kind === "newline") {
    consume(state);
  }
}

function parseTagLines(state) {
  while (isTokenValue(peek(state), "#") && isTokenValue(peek(state, 1), "[")) {
    consume(state);
    consume(state);
    let depth = 1;
    while (!isAtEnd(state) && depth > 0) {
      const token = consume(state);
      if (token.value === "[") {
        depth++;
      } else if (token.value === "]") {
        depth--;
      }
    }
    consumeLineEnd(state);
    skipNewlines(state);
  }
}

function parseImport(state, scope) {
  consume(state);
  let lastIdentifier = null;
  while (!isAtEnd(state) && peek(state).kind !== "newline") {
    if (peek(state).kind === "identifier") {
      lastIdentifier = consume(state);
    } else {
      consume(state);
    }
  }

  if (lastIdentifier) {
    declareSymbol(state, scope, lastIdentifier, "namespace");
  }

  consumeLineEnd(state);
}

function parseFieldDeclaration(state) {
  let writable = false;
  if (isKeyword(peek(state), "set") && !isKeyword(peek(state, 1), "def")) {
    writable = true;
    consume(state);
  }

  const nameToken = peek(state);
  if (!nameToken || nameToken.kind !== "identifier") {
    skipExpression(state, { stopAtLineEnd: true, stopAtClosingBrace: true });
    consumeLineEnd(state);
    return;
  }

  consume(state);
  const lastTypeName = parseType(
    state,
    token => !token || token.kind === "newline" || token.value === "}"
  );

  if (nameToken.value !== "_") {
    declareMember(state, nameToken, "property", { readonly: !writable });
  } else if (lastTypeName) {
    void lastTypeName;
  }

  consumeLineEnd(state);
}

function parseGlobalDeclaration(state, scope) {
  consume(state);

  const nameToken = peek(state);
  if (!nameToken || nameToken.kind !== "identifier") {
    skipExpression(state, { stopAtLineEnd: true, stopAtClosingBrace: true });
    consumeLineEnd(state);
    return;
  }

  consume(state);
  declareSymbol(state, scope, nameToken, "variable");

  if (!isTokenValue(peek(state), "=") && !isLineBreakToken(peek(state))) {
    parseType(state, token => !token || token.kind === "newline" || token.value === "=");
  }

  if (isTokenValue(peek(state), "=")) {
    consume(state);
    skipExpression(state, { stopAtLineEnd: true, stopAtClosingBrace: true });
  }

  consumeLineEnd(state);
}

function parseGenericParameters(state, scope) {
  if (!isTokenValue(peek(state), "[")) {
    return;
  }

  consume(state);
  while (!isAtEnd(state) && !isTokenValue(peek(state), "]")) {
    skipNewlines(state);
    if (isTokenValue(peek(state), ",")) {
      consume(state);
      continue;
    }

    const nameToken = peek(state);
    if (nameToken?.kind === "identifier") {
      consume(state);
      declareSymbol(state, scope, nameToken, "type");
      skipNewlines(state);
      if (!isTokenValue(peek(state), ",") && !isTokenValue(peek(state), "]")) {
        parseType(state, token => !token || token.value === "," || token.value === "]");
      }
    } else {
      const parsedName = parseType(state, token => !token || token.value === "," || token.value === "]");
      if (!parsedName) {
        consume(state);
      }
    }

    skipNewlines(state);
    if (isTokenValue(peek(state), ",")) {
      consume(state);
    }
  }

  if (isTokenValue(peek(state), "]")) {
    consume(state);
  }
}

function parseParameters(state, parameterScope) {
  if (!isTokenValue(peek(state), "(")) {
    return;
  }

  consume(state);
  while (!isAtEnd(state) && !isTokenValue(peek(state), ")")) {
    skipNewlines(state);
    if (isTokenValue(peek(state), ",")) {
      consume(state);
      continue;
    }

    if (isKeyword(peek(state), "ref")) {
      consume(state);
    }

    const nameToken = peek(state);
    if (nameToken?.kind === "identifier") {
      consume(state);
      declareSymbol(state, parameterScope, nameToken, "parameter");
      parseType(state, token => !token || token.value === "," || token.value === ")");
    } else {
      consume(state);
    }

    skipNewlines(state);
    if (isTokenValue(peek(state), ",")) {
      consume(state);
    }
  }

  if (isTokenValue(peek(state), ")")) {
    consume(state);
  }
}

function parseBlockContents(state, scope) {
  const open = consume(state);
  if (!open || open.value !== "{") {
    scope.end = open ? open.ordinal : scope.start;
    return;
  }

  while (!isAtEnd(state)) {
    skipNewlines(state);
    if (isTokenValue(peek(state), "}")) {
      scope.end = consume(state).ordinal + 1;
      return;
    }
    parseTagLines(state);
    if (isTokenValue(peek(state), "}")) {
      scope.end = consume(state).ordinal + 1;
      return;
    }
    parseStatement(state, scope, false);
  }

  scope.end = state.tokens.length;
}

function parseBlock(state, parentScope) {
  const scope = createScope(parentScope, peek(state)?.ordinal ?? parentScope.end);
  parseBlockContents(state, scope);
}

function parseTraitBody(state, scope) {
  const open = consume(state);
  if (!open || open.value !== "{") {
    scope.end = open ? open.ordinal : scope.start;
    return;
  }

  while (!isAtEnd(state)) {
    skipNewlines(state);
    if (isTokenValue(peek(state), "}")) {
      scope.end = consume(state).ordinal + 1;
      return;
    }
    parseTagLines(state);
    if (isTokenValue(peek(state), "}")) {
      scope.end = consume(state).ordinal + 1;
      return;
    }

    if (
      isKeyword(peek(state), "def") ||
      (isKeyword(peek(state), "set") && isKeyword(peek(state, 1), "def"))
    ) {
      parseFunction(state, scope, true);
    } else {
      skipExpression(state, { stopAtLineEnd: true, stopAtClosingBrace: true });
      consumeLineEnd(state);
    }
  }

  scope.end = state.tokens.length;
}

function parseImplBody(state, scope) {
  const open = consume(state);
  if (!open || open.value !== "{") {
    scope.end = open ? open.ordinal : scope.start;
    return;
  }

  while (!isAtEnd(state)) {
    skipNewlines(state);
    if (isTokenValue(peek(state), "}")) {
      scope.end = consume(state).ordinal + 1;
      return;
    }
    parseTagLines(state);
    if (isTokenValue(peek(state), "}")) {
      scope.end = consume(state).ordinal + 1;
      return;
    }

    if (
      isKeyword(peek(state), "def") ||
      (isKeyword(peek(state), "set") && isKeyword(peek(state, 1), "def"))
    ) {
      parseFunction(state, scope, true);
    } else {
      skipExpression(state, { stopAtLineEnd: true, stopAtClosingBrace: true });
      consumeLineEnd(state);
    }
  }

  scope.end = state.tokens.length;
}

function parseFunction(state, parentScope, inStruct) {
  if (isKeyword(peek(state), "set") && isKeyword(peek(state, 1), "def")) {
    consume(state);
  }

  consume(state);
  const nameToken = peek(state);
  if (!nameToken || nameToken.kind !== "identifier") {
    skipExpression(state, { stopAtLineEnd: true, stopAtClosingBrace: true });
    consumeLineEnd(state);
    return;
  }

  consume(state);
  if (inStruct) {
    declareMember(state, nameToken, "method");
  } else {
    declareSymbol(state, parentScope, nameToken, "function");
  }

  const functionScope = createScope(parentScope, nameToken.ordinal);
  parseGenericParameters(state, functionScope);
  parseParameters(state, functionScope);

  skipNewlines(state);
  if (!isAtEnd(state) && !isLineBreakToken(peek(state)) && !isTokenValue(peek(state), "{")) {
    parseType(state, token => !token || token.kind === "newline" || token.value === "{");
  }

  if (isTokenValue(peek(state), "{")) {
    functionScope.start = peek(state).ordinal;
    parseBlockContents(state, functionScope);
  } else {
    functionScope.end = functionScope.start;
    consumeLineEnd(state);
  }
}

function parseStruct(state, scope) {
  consume(state);
  const nameToken = peek(state);
  if (!nameToken || nameToken.kind !== "identifier") {
    consumeLineEnd(state);
    return;
  }

  consume(state);
  declareSymbol(state, scope, nameToken, "type");
  const structScope = createScope(scope, nameToken.ordinal);
  parseGenericParameters(state, structScope);

  if (isTokenValue(peek(state), "{") && peek(state).line === nameToken.line) {
    structScope.start = peek(state).ordinal;
    consume(state);
    while (!isAtEnd(state)) {
      skipNewlines(state);
      if (isTokenValue(peek(state), "}")) {
        structScope.end = consume(state).ordinal + 1;
        return;
      }
      parseTagLines(state);
      if (isTokenValue(peek(state), "}")) {
        structScope.end = consume(state).ordinal + 1;
        return;
      }

      if (
        isKeyword(peek(state), "def") ||
        (isKeyword(peek(state), "set") && isKeyword(peek(state, 1), "def"))
      ) {
        parseFunction(state, structScope, true);
      } else {
        parseFieldDeclaration(state);
      }
    }
    structScope.end = state.tokens.length;
    return;
  }

  structScope.end = structScope.start;
  consumeLineEnd(state);
}

function parseTrait(state, scope) {
  consume(state);
  const nameToken = peek(state);
  if (!nameToken || nameToken.kind !== "identifier") {
    consumeLineEnd(state);
    return;
  }

  consume(state);
  declareSymbol(state, scope, nameToken, "type");
  const traitScope = createScope(scope, nameToken.ordinal);

  if (isTokenValue(peek(state), "{") && peek(state).line === nameToken.line) {
    traitScope.start = peek(state).ordinal;
    parseTraitBody(state, traitScope);
    return;
  }

  traitScope.end = traitScope.start;
  consumeLineEnd(state);
}

function parseImpl(state, scope) {
  const implToken = consume(state);
  const implScope = createScope(scope, implToken?.ordinal ?? scope.end);
  parseGenericParameters(state, implScope);
  skipNewlines(state);

  parseType(
    state,
    token =>
      !token ||
      token.kind === "newline" ||
      token.value === ":" ||
      isKeyword(token, "for") ||
      token.value === "{"
  );

  skipNewlines(state);
  if (isKeyword(peek(state), "for")) {
    consume(state);
    skipNewlines(state);
    parseType(state, token => !token || token.kind === "newline" || token.value === "{");
  } else if (isTokenValue(peek(state), ":")) {
    consume(state);
    skipNewlines(state);
    parseType(state, token => !token || token.kind === "newline" || token.value === "{");
  }

  if (isTokenValue(peek(state), "{")) {
    implScope.start = peek(state).ordinal;
    parseImplBody(state, implScope);
    return;
  }

  implScope.end = implScope.start;
  consumeLineEnd(state);
}

function parseVariableDeclaration(state, scope) {
  let readonly = false;
  let shorthand = false;

  if (isKeyword(peek(state), "var")) {
    consume(state);
  } else if (isKeyword(peek(state), "const")) {
    readonly = true;
    consume(state);
  } else if (isKeyword(peek(state), "ref")) {
    consume(state);
  } else {
    shorthand = true;
  }

  const nameToken = peek(state);
  if (!nameToken || nameToken.kind !== "identifier") {
    skipExpression(state, { stopAtLineEnd: true, stopAtClosingBrace: true });
    consumeLineEnd(state);
    return;
  }

  consume(state);
  declareSymbol(state, scope, nameToken, "variable", { readonly });

  if (shorthand && isTokenValue(peek(state), ":") && isTokenValue(peek(state, 1), "=")) {
    consume(state);
    consume(state);
    skipExpression(state, { stopAtLineEnd: true, stopAtClosingBrace: true });
    consumeLineEnd(state);
    return;
  }

  if (!isTokenValue(peek(state), "=") && !isLineBreakToken(peek(state))) {
    parseType(state, token => !token || token.kind === "newline" || token.value === "=");
  }

  if (isTokenValue(peek(state), "=")) {
    consume(state);
    skipExpression(state, { stopAtLineEnd: true, stopAtClosingBrace: true });
  }

  consumeLineEnd(state);
}

function parseIf(state, scope) {
  consume(state);
  skipExpression(state, { stopAtLineEnd: true, stopAtBlock: true, stopAtClosingBrace: true });

  if (isTokenValue(peek(state), "{")) {
    parseBlock(state, scope);
  }

  skipNewlines(state);
  if (isKeyword(peek(state), "else")) {
    consume(state);
    if (isKeyword(peek(state), "if")) {
      parseIf(state, scope);
    } else if (isTokenValue(peek(state), "{")) {
      parseBlock(state, scope);
    }
  }
}

function parseFor(state, scope) {
  consume(state);
  skipExpression(state, { stopAtLineEnd: true, stopAtBlock: true, stopAtClosingBrace: true });

  if (isTokenValue(peek(state), "{")) {
    parseBlock(state, scope);
  }

  skipNewlines(state);
  if (isKeyword(peek(state), "else") && isTokenValue(peek(state, 1), "{")) {
    consume(state);
    parseBlock(state, scope);
  }
}

function parseStatement(state, scope, inStruct) {
  skipNewlines(state);
  if (isAtEnd(state) || isTokenValue(peek(state), "}")) {
    return;
  }

  const token = peek(state);
  if (isKeyword(token, "import")) {
    parseImport(state, scope);
    return;
  }

  if (isKeyword(token, "struct")) {
    parseStruct(state, scope);
    return;
  }

  if (isKeyword(token, "global")) {
    parseGlobalDeclaration(state, scope);
    return;
  }

  if (isKeyword(token, "trait")) {
    parseTrait(state, scope);
    return;
  }

  if (isKeyword(token, "impl")) {
    parseImpl(state, scope);
    return;
  }

  if (isKeyword(token, "def") || (isKeyword(token, "set") && isKeyword(peek(state, 1), "def"))) {
    parseFunction(state, scope, inStruct);
    return;
  }

  if (isKeyword(token, "var") || isKeyword(token, "const") || isKeyword(token, "ref")) {
    parseVariableDeclaration(state, scope);
    return;
  }

  if (
    token.kind === "identifier" &&
    isTokenValue(peek(state, 1), ":") &&
    isTokenValue(peek(state, 2), "=")
  ) {
    parseVariableDeclaration(state, scope);
    return;
  }

  if (isKeyword(token, "if")) {
    parseIf(state, scope);
    return;
  }

  if (isKeyword(token, "for")) {
    parseFor(state, scope);
    return;
  }

  if (isTokenValue(token, "{")) {
    parseBlock(state, scope);
    return;
  }

  if (isKeyword(token, "ret") || isKeyword(token, "break") || isKeyword(token, "continue")) {
    consume(state);
    skipExpression(state, { stopAtLineEnd: true, stopAtClosingBrace: true });
    consumeLineEnd(state);
    return;
  }

  skipExpression(state, { stopAtLineEnd: true, stopAtClosingBrace: true });
  consumeLineEnd(state);
}

function isNamedArgumentToken(tokens, ordinal) {
  const token = tokens[ordinal];
  if (!token || token.kind !== "identifier") {
    return false;
  }

  const next = nextSignificant(tokens, ordinal);
  if (!isTokenValue(next, "=")) {
    return false;
  }

  const previous = previousSignificant(tokens, ordinal);
  if (isTokenValue(previous, "(") || isTokenValue(previous, ",")) {
    return true;
  }

  if (isKeyword(previous, "ref")) {
    const beforeRef = previousSignificant(tokens, previous.ordinal);
    return isTokenValue(beforeRef, "(") || isTokenValue(beforeRef, ",");
  }

  return false;
}

function classifyMemberAccess(state, token) {
  if (token.value.startsWith("_") && /^_[0-9]+$/.test(token.value)) {
    return "variable";
  }

  const next = nextSignificant(state.tokens, token.ordinal);
  const effectiveNext = isTokenValue(next, "[") ? nextAfterBracketSuffix(state.tokens, token.ordinal) : next;
  const dotToken = previousSignificant(state.tokens, token.ordinal);
  const ownerToken = dotToken ? previousSignificant(state.tokens, dotToken.ordinal) : null;
  const ownerSymbol = ownerToken ? resolveSymbol(state.rootScope, token.ordinal, ownerToken.value) : null;
  const localSymbol = resolveSymbol(state.rootScope, token.ordinal, token.value);

  if (ownerSymbol?.kind === "namespace") {
    if (isTokenValue(effectiveNext, ".")) {
      if (localSymbol?.kind === "type") {
        return "type";
      }

      const nextMember = effectiveNext ? nextSignificant(state.tokens, effectiveNext.ordinal) : null;
      const nextMemberEnd =
        nextMember && isTokenValue(nextSignificant(state.tokens, nextMember.ordinal), "[")
          ? nextAfterBracketSuffix(state.tokens, nextMember.ordinal)
          : nextSignificant(state.tokens, nextMember?.ordinal ?? -1);
      if (nextMember?.kind === "identifier" && isTokenValue(nextMemberEnd, "(")) {
        return "type";
      }

      return "namespace";
    }
    if (localSymbol?.kind === "type") {
      return "type";
    }
    return isTokenValue(effectiveNext, "(") ? "function" : "namespace";
  }

  if (localSymbol?.kind === "type" && isTokenValue(effectiveNext, ".")) {
    return "type";
  }

  return isTokenValue(effectiveNext, "(") ? "function" : "variable";
}

function classifyIdentifierUsage(state, token) {
  if (token.value === "self") {
    return null;
  }

  if (isNamedArgumentToken(state.tokens, token.ordinal)) {
    return { type: "parameter", modifiers: [] };
  }

  const previous = previousSignificant(state.tokens, token.ordinal);
  const next = nextSignificant(state.tokens, token.ordinal);
  const effectiveNext = isTokenValue(next, "[") ? nextAfterBracketSuffix(state.tokens, token.ordinal) : next;

  if (isTokenValue(previous, ".")) {
    return { type: classifyMemberAccess(state, token), modifiers: [] };
  }

  const symbol = resolveSymbol(state.rootScope, token.ordinal, token.value);

  if (isTokenValue(previous, "@")) {
    if (symbol?.kind === "namespace") {
      return { type: "namespace", modifiers: [] };
    }
    return { type: "function", modifiers: [] };
  }

  if (isTokenValue(next, "&<")) {
    return { type: "function", modifiers: [] };
  }

  if (isTokenValue(effectiveNext, ".")) {
    const symbolUsage = getSymbolClassification(symbol);
    if (symbolUsage) {
      return symbolUsage;
    }
  }

  if (isTokenValue(effectiveNext, "(")) {
    const symbolUsage = getSymbolClassification(symbol);
    if (symbolUsage) {
      return symbolUsage;
    }
    return null;
  }

  return getSymbolClassification(symbol);
}

function analyzeLona(text) {
  const tokens = tokenize(text);
  const state = {
    tokens,
    cursor: 0,
    classifications: new Map(),
    rootScope: createScope(null, 0)
  };
  state.rootScope.end = tokens.length;

  while (!isAtEnd(state)) {
    skipNewlines(state);
    parseTagLines(state);
    if (isAtEnd(state)) {
      break;
    }
    parseStatement(state, state.rootScope, false);
  }

  for (const token of tokens) {
    if (token.kind !== "identifier" || state.classifications.has(token.ordinal)) {
      continue;
    }
    const usage = classifyIdentifierUsage(state, token);
    if (usage) {
      setTokenClassification(state, token, usage.type, usage.modifiers);
    }
  }

  const result = [];
  for (const token of tokens) {
    const classification = state.classifications.get(token.ordinal);
    if (!classification) {
      continue;
    }
    result.push({
      line: token.line,
      start: token.start,
      length: token.end - token.start,
      type: classification.type,
      modifiers: classification.modifiers
    });
  }

  result.sort((a, b) => a.line - b.line || a.start - b.start || a.length - b.length);
  return result;
}

module.exports = {
  analyzeLona
};
