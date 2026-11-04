'use strict';
const assert = require('node:assert/strict');
const vscode = require('vscode');
async function run() {
  const extension = vscode.extensions.getExtension('pe4en1ka.code-under-load');
  assert.ok(extension, 'Расширение должно быть обнаружено VS Code');
  await extension.activate();
  assert.ok(extension.isActive, 'Расширение должно активироваться');
  const commands = await vscode.commands.getCommands(true);
  assert.ok(commands.includes('codeUnderLoad.run'), 'Команда должна быть зарегистрирована');
  assert.equal(vscode.workspace.getConfiguration('codeUnderLoad').get('repetitions'), 7);
  assert.equal(vscode.workspace.getConfiguration('codeUnderLoad').get('pythonPath'), '');
  assert.equal(vscode.workspace.getConfiguration('codeUnderLoad').get('cppCompilerPath'), 'g++');
  console.log('EXTENSION_HOST_CHECK_PASSED');
}
module.exports = { run };
