'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');
const { validateConfig } = require('./validation');
const { detectLanguage } = require('./languages');

function runJavaScript(config, { nodePath = 'node', signal, onPoint = () => {} } = {}) {
  validateConfig(config);
  if (signal?.aborted) return Promise.reject(new Error('Измерение отменено.'));
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer;
    const child = spawn(nodePath, [path.join(__dirname, 'worker.cjs')], {
      cwd: path.dirname(config.modulePath),
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      windowsHide: true
    });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-4000); });
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      child.kill('SIGKILL');
      if (error) reject(error); else resolve(result);
    };
    const cancel = () => finish(new Error('Измерение отменено.'));
    signal?.addEventListener('abort', cancel, { once: true });
    timer = setTimeout(() => finish(new Error(`Превышен лимит ${config.timeoutMs / 1000} с. Уменьшите размеры или число повторов.`)), config.timeoutMs);
    child.on('error', error => finish(new Error(`Не удалось запустить Node.js: ${error.message}. Проверьте настройку codeUnderLoad.nodePath.`)));
    child.on('exit', (code, reason) => finish(new Error(`Процесс завершился без результата (${code ?? reason}). ${stderr}`)));
    child.on('message', message => {
      if (settled) return;
      if (message.type === 'point') onPoint(message.point);
      if (message.type === 'result') finish(null, message.result);
      if (message.type === 'error') finish(new Error(message.error));
    });
    child.once('spawn', () => {
      if (signal?.aborted) cancel();
      else child.send(config, error => { if (error) finish(error); });
    });
  });
}
function runBenchmark(config, options = {}) {
  validateConfig(config);
  const language = detectLanguage(config.modulePath);
  if (language === 'javascript') return runJavaScript(config, options);
  if (language === 'python') return require('./external-runner').runExternalBenchmark(config, options);
  return Promise.reject(new Error('Поддержка C++ ещё не подключена.'));
}
module.exports = { runBenchmark };
