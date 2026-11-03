'use strict';
const vscode = require('vscode');
const { buildConfig } = require('./configuration');
const { runBenchmark } = require('./runner');
const { renderReport } = require('./report');
let running = false;
let activeController;

async function run(context) {
  if (!vscode.workspace.isTrusted) {
    vscode.window.showWarningMessage('Для запуска функций откройте доверенную рабочую папку.');
    return;
  }
  if (running) {
    vscode.window.showInformationMessage('Измерение уже выполняется. Дождитесь завершения или отмените его.');
    return;
  }
  running = true;
  try {
    let uri = vscode.window.activeTextEditor?.document.uri;
    if (!uri || uri.scheme !== 'file' || !/\.(cjs|mjs|js)$/i.test(uri.fsPath)) {
      const selected = await vscode.window.showOpenDialog({canSelectMany:false, filters:{JavaScript:['js','cjs','mjs']}, openLabel:'Выбрать модуль'});
      uri = selected?.[0];
    }
    if (!uri) return;
    const document = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uri.toString());
    if (document?.isDirty && !await document.save()) throw new Error('Сначала сохраните модуль.');
    const previous = context.workspaceState.get('lastExperiment', {});
    const editor = vscode.window.activeTextEditor;
    const selection = editor && editor.document.uri.toString() === uri.toString() ? editor.document.getText(editor.selection).trim() : '';
    const names = await vscode.window.showInputBox({title:'1/3 · Функции для сравнения', prompt:'Имена экспортов через запятую (1–4). Для default-экспорта: default.', value:/^[\w$]+$/.test(selection) ? selection : previous.names || '', placeHolder:'uniqueSlow, uniqueFast'});
    if (names === undefined) return;
    const sizes = await vscode.window.showInputBox({title:'2/3 · Размеры входных данных', prompt:'Возрастающие размеры через запятую, максимум 1 000 000.', value:previous.sizes || '100, 1000, 5000, 10000'});
    if (sizes === undefined) return;
    const input = await vscode.window.showQuickPick([
      {label:'Случайный массив', description:'Воспроизводимые целые числа, seed = 42', kind:'random'},
      {label:'Возрастающий массив', description:'0, 1, …, n−1', kind:'sorted'},
      {label:'Убывающий массив', description:'n, n−1, …, 1', kind:'reversed'},
      {label:'Свой генератор', description:'Экспорт generateInput(size, seed) → массив аргументов', kind:'custom'}
    ], {title:'3/3 · Входные данные', placeHolder:'Модуль и выбранные функции будут выполнены в Node.js'});
    if (!input) return;
    const settings = vscode.workspace.getConfiguration('codeUnderLoad');
    const config = buildConfig(uri.fsPath, names, sizes, input.kind, settings);
    await context.workspaceState.update('lastExperiment', {names, sizes});
    const result = await vscode.window.withProgress({location:vscode.ProgressLocation.Notification, title:'Код под нагрузкой', cancellable:true}, async (progress, token) => {
      const controller = new AbortController();
      activeController = controller;
      const cancellation = token.onCancellationRequested(() => controller.abort());
      if (token.isCancellationRequested) controller.abort();
      const total = config.functions.length * config.sizes.length;
      try {
        return await runBenchmark(config, {nodePath:settings.get('nodePath', 'node'), signal:controller.signal,
          onPoint:point => progress.report({increment:100 / total, message:`${point.name} · n = ${point.size}`})});
      } finally { cancellation.dispose(); activeController = undefined; }
    });
    const panel = vscode.window.createWebviewPanel('codeUnderLoad.results', 'Код под нагрузкой · Результаты', vscode.ViewColumn.Beside, {
      enableScripts:true, localResourceRoots:[vscode.Uri.joinPath(context.extensionUri, 'media')]
    });
    panel.webview.html = renderReport(result, {
      cssUri:panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'report.css')).toString(),
      scriptUri:panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'report.js')).toString(),
      cspSource:panel.webview.cspSource
    });
    context.subscriptions.push(panel);
  } catch (error) {
    vscode.window.showErrorMessage(`Код под нагрузкой: ${error.message}`);
  } finally { running = false; }
}
function activate(context) {
  context.subscriptions.push(vscode.commands.registerCommand('codeUnderLoad.run', () => run(context)));
}
function deactivate() { activeController?.abort(); }
module.exports = { activate, deactivate };
