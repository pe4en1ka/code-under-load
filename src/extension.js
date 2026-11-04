'use strict';
const vscode = require('vscode');
const { buildConfig, buildProgramConfig, buildGeneratedProgramConfig } = require('./configuration');
const { sortInputFiles, suggestSizes, inputOrderLabel } = require('./program-inputs');
const { runBenchmark } = require('./runner');
const { renderReport } = require('./report');
const { toCsv } = require('./export');
const { detectLanguage, LANGUAGE_LABELS } = require('./languages');
let running = false;
let activeController;

async function run(context) {
  if (!vscode.workspace.isTrusted) {
    vscode.window.showWarningMessage('Для запуска кода откройте доверенную рабочую папку.');
    return;
  }
  if (running) {
    vscode.window.showInformationMessage('Измерение уже выполняется. Дождитесь завершения или отмените его.');
    return;
  }
  running = true;
  try {
    let uri = vscode.window.activeTextEditor?.document.uri;
    if (!uri || uri.scheme !== 'file' || !/\.(cjs|mjs|js|py|cpp|cc|cxx)$/i.test(uri.fsPath)) {
      const selected = await vscode.window.showOpenDialog({canSelectMany:false, filters:{'JavaScript, Python, C++':['js','cjs','mjs','py','cpp','cc','cxx']}, openLabel:'Выбрать модуль'});
      uri = selected?.[0];
    }
    if (!uri) return;
    const document = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uri.toString());
    if (document?.isDirty && !await document.save()) throw new Error('Сначала сохраните модуль.');
    const language = detectLanguage(uri.fsPath);
    const languageLabel = LANGUAGE_LABELS[language];
    const settings = vscode.workspace.getConfiguration('codeUnderLoad');
    let config;
    let mode = 'functions';
    if (language === 'cpp') {
      const choice = await vscode.window.showQuickPick([
        {label:'Программа целиком через main', description:'Обычный .cpp + генератор или входные файлы для cin. Переделывать код не нужно.', mode:'program'},
        {label:'Отдельные функции', description:'Измерение функции с массивом или собственным генератором аргументов.', mode:'functions'}
      ], {title:'C++ · Что измеряем?', placeHolder:'Выберите способ запуска'});
      if (!choice) return;
      mode = choice.mode;
    }
    if (mode === 'program') {
      const source = await vscode.window.showQuickPick([
        {label:'Генератор входных данных', description:'Случайный, возрастающий или убывающий массив → stdin', source:'generated'},
        {label:'Готовые входные файлы', description:'Ваши тесты для stdin', source:'files'}
      ], {title:'main · Источник входных данных'});
      if (!source) return;
      if (source.source === 'generated') {
        const sizes = await vscode.window.showInputBox({title:'main · Размеры входных данных',
          prompt:'Возрастающие размеры n через запятую.',value:'100, 1000, 5000, 10000'});
        if (sizes === undefined) return;
        const input = await vscode.window.showQuickPick([
          {label:'Случайный массив',description:'Воспроизводимые целые числа, seed = 42',kind:'random'},
          {label:'Возрастающий массив',description:'0, 1, …, n−1',kind:'sorted'},
          {label:'Убывающий массив',description:'n, n−1, …, 1',kind:'reversed'}
        ], {title:'main · Генератор'});
        if (!input) return;
        const format = await vscode.window.showQuickPick([
          {label:'n и массив',description:'Первая строка: n; вторая: n чисел через пробел',format:'size-array'},
          {label:'Только массив',description:'n чисел через пробел, без размера',format:'array'},
          {label:'Только n',description:'Одно число n и перевод строки',format:'size'}
        ], {title:'main · Формат stdin',placeHolder:'Выберите формат, который ожидает ваша программа через cin'});
        if (!format) return;
        config = buildGeneratedProgramConfig(uri.fsPath, sizes, input.kind, format.format, settings);
      } else {
      const chosen = await vscode.window.showOpenDialog({canSelectMany:true,
        filters:{'Входные тесты stdin':['in','txt','dat'],'Все файлы':['*']},
        title:'Выберите готовые входные тесты программы для cin',openLabel:'Выбрать входные тесты'});
      if (!chosen?.length) return;
      if (chosen.length > 20 || chosen.some(file=>file.scheme !== 'file')) throw new Error('Выберите от 1 до 20 локальных входных файлов.');
      const files = sortInputFiles(chosen.map(file=>file.fsPath));
      const sizes = await vscode.window.showInputBox({title:'main · Размеры задач для графика',
        prompt:`Укажите n для каждого файла через запятую в этом порядке: ${inputOrderLabel(files)}`,
        placeHolder:'n — количество элементов или операций в тесте, не число повторов',
        value:suggestSizes(files).join(', ')});
      if (sizes === undefined) return;
      config = buildProgramConfig(uri.fsPath, files, sizes, settings);
      }
    } else {
      const previous = context.workspaceState.get(`lastExperiment.${language}`, language === 'javascript' ? context.workspaceState.get('lastExperiment', {}) : {});
      const editor = vscode.window.activeTextEditor;
      const selection = editor && editor.document.uri.toString() === uri.toString() ? editor.document.getText(editor.selection).trim() : '';
      const names = await vscode.window.showInputBox({title:`1/3 · ${languageLabel} · Функции для сравнения`, prompt:language === 'javascript' ? 'Имена экспортов через запятую (1–4). Для default-экспорта: default.' : language === 'cpp' ? 'Имена функций через запятую (1–4). Для main выберите режим программы целиком.' : 'Имена функций модуля через запятую (1–4).', value:/^[\w$:]+$/.test(selection) ? selection : previous.names || '', placeHolder:language === 'javascript' ? 'uniqueSlow, uniqueFast' : 'unique_slow, unique_fast'});
      if (names === undefined) return;
      const sizes = await vscode.window.showInputBox({title:'2/3 · Размеры входных данных', prompt:'Возрастающие размеры через запятую, максимум 1 000 000.', value:previous.sizes || '100, 1000, 5000, 10000'});
      if (sizes === undefined) return;
      const input = await vscode.window.showQuickPick([
        {label:'Случайный массив', description:'Воспроизводимые целые числа, seed = 42', kind:'random'},
        {label:'Возрастающий массив', description:'0, 1, …, n−1', kind:'sorted'},
        {label:'Убывающий массив', description:'n, n−1, …, 1', kind:'reversed'},
        {label:'Свой генератор', description:language === 'javascript' ? 'generateInput(size, seed) → массив аргументов' : language === 'python' ? 'generate_input(size, seed) → список или кортеж аргументов' : 'generate_input(size, seed) → std::tuple аргументов', kind:'custom'}
      ], {title:'3/3 · Входные данные', placeHolder:`Будет выполнен код ${languageLabel}${language === 'cpp' ? ' · компиляция C++17 с -O2' : ''}`});
      if (!input) return;
      config = buildConfig(uri.fsPath, names, sizes, input.kind, settings);
      await context.workspaceState.update(`lastExperiment.${language}`, {names, sizes});
    }
    const result = await vscode.window.withProgress({location:vscode.ProgressLocation.Notification, title:'Код под нагрузкой', cancellable:true}, async (progress, token) => {
      const controller = new AbortController();
      activeController = controller;
      const cancellation = token.onCancellationRequested(() => controller.abort());
      if (token.isCancellationRequested) controller.abort();
      const total = config.functions.length * config.sizes.length;
      try {
        return await runBenchmark(config, {nodePath:settings.get('nodePath', 'node'),
          pythonPath:settings.get('pythonPath', '') || (process.platform === 'win32' ? 'python' : 'python3'),
          cppCompilerPath:settings.get('cppCompilerPath', 'g++'), signal:controller.signal,
          onStage:stage => progress.report({message:stage === 'compile' ? 'Компиляция C++17…' : config.mode === 'program' ? 'Запуск программы через main…' : 'Измерение функций…'}),
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
    const exportSubscription = panel.webview.onDidReceiveMessage(async message => {
      if (message?.type !== 'export' || !['json', 'csv'].includes(message.format)) return;
      try {
        const format = message.format;
        const target = await vscode.window.showSaveDialog({
          defaultUri:vscode.Uri.joinPath(uri, '..', `benchmark-results.${format}`),
          filters:format === 'json' ? {JSON:['json']} : {CSV:['csv']}, saveLabel:'Сохранить результаты'
        });
        if (!target) return;
        const content = format === 'json' ? JSON.stringify(result, null, 2) + '\n' : toCsv(result);
        await vscode.workspace.fs.writeFile(target, Buffer.from(content, 'utf8'));
        vscode.window.showInformationMessage('Результаты сохранены.');
      } catch (error) { vscode.window.showErrorMessage(`Не удалось сохранить результаты: ${error.message}`); }
    });
    panel.onDidDispose(() => exportSubscription.dispose());
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
