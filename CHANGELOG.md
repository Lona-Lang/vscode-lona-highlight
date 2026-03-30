# Changelog

All notable changes to this project will be documented in this file.

## 0.0.3

- Expanded TextMate grammar coverage for `set`, `const`, `ref`, `:=`, named arguments, character literals, function pointer references, and richer type expressions.
- Reworked semantic token analysis to handle multiline signatures, scope-aware declarations, complex type strings, methods, properties, readonly bindings, and namespace-qualified symbols.
- Added semantic regression tests covering complex Lona syntax and updated project documentation for development and release workflow.

## 0.0.2

- Added semantic tokens support to distinguish imported module names from variables.
- Fixed variable highlighting in plain expressions such as `if a {}`.
- Fixed false-positive parameter highlighting in signatures such as `msg u8 const[*]`.
- Improved member-access highlighting for prefixes like `aaa.bbb`.

## 0.0.1

- Initial VS Code extension scaffold for the Lona language.
- Added `.lo` language registration and editor language configuration.
- Added TextMate grammar covering the current Lona lexer/parser surface:
  comments, literals, keywords, tags, types, function pointers, calls, selectors, and operators.
