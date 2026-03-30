"use strict";

const assert = require("assert");
const { analyzeLona } = require("../lona-semantic");

const source = `import math

struct Accumulator {
    set total i32
    _ math.Inner

    set def bump(ref delta i32) i32 {
        self.total += delta
        ret self.total
    }
}

def dispatch_cb(ref value i32) i32 {
    ret value
}

def dispatch(
    cb (ref i32: i32),
    buffer math.Point[*],
    flags <i32, bool>
) u8 const[*] {
    const readonly_view u8 const[*] = cast[u8 const[*]](buffer)
    shadow := readonly_view
    var acc Accumulator = Accumulator(total = cb(ref buffer(0)))
    var callback_ref (ref i32: i32) = dispatch_cb&<ref i32>
    acc.bump(ref delta = flags._1)
    ret math.emit(buffer, label = readonly_view)
}
`;

function indexToLineCol(text, index) {
  const prefix = text.slice(0, index);
  const lines = prefix.split("\n");
  return {
    line: lines.length - 1,
    start: lines[lines.length - 1].length
  };
}

function nthOccurrence(text, needle, occurrence) {
  const pattern = new RegExp(`(?<![A-Za-z0-9_])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9_])`, "g");
  let match = null;
  for (let i = 0; i < occurrence; i++) {
    match = pattern.exec(text);
    assert(match, `Missing occurrence ${occurrence} of ${needle}`);
  }
  return match.index;
}

function tokenAt(tokens, text, needle, occurrence) {
  const position = indexToLineCol(text, nthOccurrence(text, needle, occurrence));
  return tokens.find(token => token.line === position.line && token.start === position.start) || null;
}

function expectToken(tokens, needle, occurrence, type, modifiers = []) {
  const token = tokenAt(tokens, source, needle, occurrence);
  assert(token, `No semantic token for ${needle} #${occurrence}`);
  assert.strictEqual(token.type, type, `Unexpected type for ${needle} #${occurrence}`);
  for (const modifier of modifiers) {
    assert(
      token.modifiers.includes(modifier),
      `Expected modifier ${modifier} on ${needle} #${occurrence}`
    );
  }
}

const tokens = analyzeLona(source);

expectToken(tokens, "math", 1, "namespace", ["declaration"]);
expectToken(tokens, "Accumulator", 1, "type", ["declaration"]);
expectToken(tokens, "total", 1, "variable", ["declaration"]);
expectToken(tokens, "bump", 1, "function", ["declaration"]);
expectToken(tokens, "delta", 1, "parameter", ["declaration"]);
expectToken(tokens, "delta", 2, "parameter");
expectToken(tokens, "dispatch_cb", 1, "function", ["declaration"]);
expectToken(tokens, "dispatch", 1, "function", ["declaration"]);
expectToken(tokens, "cb", 1, "parameter", ["declaration"]);
expectToken(tokens, "buffer", 1, "parameter", ["declaration"]);
expectToken(tokens, "flags", 1, "parameter", ["declaration"]);
expectToken(tokens, "readonly_view", 1, "variable", ["declaration", "readonly"]);
expectToken(tokens, "readonly_view", 2, "variable", ["readonly"]);
expectToken(tokens, "shadow", 1, "variable", ["declaration"]);
expectToken(tokens, "acc", 1, "variable", ["declaration"]);
expectToken(tokens, "Accumulator", 2, "type");
expectToken(tokens, "Accumulator", 3, "type");
expectToken(tokens, "total", 4, "parameter");
expectToken(tokens, "dispatch_cb", 2, "function");
expectToken(tokens, "callback_ref", 1, "variable", ["declaration"]);
expectToken(tokens, "bump", 2, "function");
expectToken(tokens, "_1", 1, "variable");
expectToken(tokens, "emit", 1, "function");
expectToken(tokens, "label", 1, "parameter");
expectToken(tokens, "math", 4, "namespace");

console.log(`semantic tests passed (${tokens.length} tokens)`);
