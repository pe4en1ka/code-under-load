'use strict';
const path = require('node:path');
const { runProcess } = require('./process');
const { statistics } = require('./benchmark');
const { detectLanguage } = require('./languages');
const PROTOCOL = '__CODE_UNDER_LOAD__';

function createCollector(config, onPoint) {
  let buffer = '', done;
  const points = [], seen = new Set();
  function line(text) {
    const marker = text.lastIndexOf(PROTOCOL);
    if (marker < 0) return;
    const message = JSON.parse(text.slice(marker + PROTOCOL.length));
    if (message.type === 'error') throw new Error(message.error);
    if (message.type === 'done') { done = message; return; }
    if (message.type !== 'point') return;
    const key = `${message.name}:${message.size}`;
    if (done || !config.functions.includes(message.name) || !config.sizes.includes(message.size) || seen.has(key) ||
        !Array.isArray(message.samplesMs) || message.samplesMs.length !== config.repetitions ||
        message.samplesMs.some(n => !Number.isFinite(n) || n < 0)) throw new Error('Некорректный результат процесса измерений.');
    seen.add(key);
    const point = {name:message.name, size:message.size, ...statistics(message.samplesMs)};
    points.push(point); onPoint(point);
  }
  return {
    write(chunk) {
      buffer += chunk;
      if (buffer.length > 1000000) throw new Error('Слишком большой вывод измеряемого модуля.');
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) { line(buffer.slice(0,index)); buffer = buffer.slice(index+1); }
    },
    result() {
      if (buffer) line(buffer);
      if (!done || points.length !== config.functions.length * config.sizes.length) throw new Error('Процесс завершился без полного результата.');
      return {config:{...config,language:detectLanguage(config.modulePath)}, points, createdAt:new Date().toISOString(),runtime:done.runtime,platform:done.platform};
    }
  };
}
async function runExternalBenchmark(config, {pythonPath = process.platform === 'win32' ? 'python' : 'python3', signal, onPoint = () => {}} = {}) {
  const collector = createCollector(config, onPoint);
  await runProcess(pythonPath, ['-u',path.join(__dirname,'workers','python_worker.py')], {
    cwd:path.dirname(config.modulePath), signal, timeoutMs:config.timeoutMs,
    input:JSON.stringify(config)+'\n', onStdout:collector.write,
    env:{...process.env, PYTHONIOENCODING:'utf-8'}
  });
  return collector.result();
}
module.exports = { runExternalBenchmark, createCollector };
