'use strict';
const vscode = require('vscode');
function activate(context) {
  context.subscriptions.push(vscode.commands.registerCommand('codeUnderLoad.run', () => {
    vscode.window.showInformationMessage('Код под нагрузкой: каркас расширения готов.');
  }));
}
module.exports = { activate };
