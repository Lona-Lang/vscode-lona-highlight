"use strict";

const { analyzeLona } = require("./lona-semantic");

function activate(context) {
  const vscode = require("vscode");

  const legend = new vscode.SemanticTokensLegend(
    ["namespace", "type", "function", "variable", "parameter"],
    ["declaration"]
  );

  const provider = {
    provideDocumentSemanticTokens(document) {
      const builder = new vscode.SemanticTokensBuilder(legend);
      for (const token of analyzeLona(document.getText())) {
        builder.push(
          new vscode.Range(token.line, token.start, token.line, token.start + token.length),
          token.type,
          token.modifiers
        );
      }
      return builder.build();
    }
  };

  context.subscriptions.push(
    vscode.languages.registerDocumentSemanticTokensProvider(
      { language: "lona" },
      provider,
      legend
    )
  );
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
