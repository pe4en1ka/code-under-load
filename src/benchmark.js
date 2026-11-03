'use strict';
const { performance } = require('node:perf_hooks');
const { pathToFileURL } = require('node:url');

function validateConfig(config) {
  if (!config || typeof config.modulePath !== 'string' || !config.modulePath) throw new Error('Укажите файл модуля.');
  if (!Array.isArray(config.functions) || config.functions.length < 1 || config.functions.length > 4 ||
      config.functions.some(name => typeof name !== 'string' || !name.trim()) ||
      new Set(config.functions).size !== config.functions.length) throw new Error('Укажите от 1 до 4 разных имён экспортируемых функций.');
  if (!Array.isArray(config.sizes) || !config.sizes.length || config.sizes.length > 20 ||
      config.sizes.some(n => !Number.isInteger(n) || n < 1 || n > 1000000) ||
      config.sizes.some((n, i) => i > 0 && n <= config.sizes[i - 1])) throw new Error('Размеры: до 20 возрастающих целых чисел от 1 до 1000000.');
  for (const [key, min, max] of [['repetitions', 3, 50], ['warmup', 0, 10], ['timeoutMs', 100, 120000]]) {
    if (!Number.isInteger(config[key]) || config[key] < min || config[key] > max) throw new Error(`Некорректный параметр ${key}: ${min}–${max}.`);
  }
  if (!['random', 'sorted', 'reversed', 'custom'].includes(config.input)) throw new Error('Неизвестный генератор данных.');
  return config;
}

function makeArgs(size, kind, seed) {
  let state = seed >>> 0;
  const values = Array.from({ length: size }, (_, i) => {
    if (kind === 'sorted') return i;
    if (kind === 'reversed') return size - i;
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % 1000000;
  });
  return [values];
}

function statistics(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return {
    medianMs: sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
    minMs: sorted[0], maxMs: sorted.at(-1),
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1], samplesMs: samples
  };
}

async function benchmark(config, onPoint = () => {}) {
  validateConfig(config);
  const module = await import(pathToFileURL(config.modulePath).href);
  const getExport = name => Object.hasOwn(module, name) ? module[name] :
    module.default && Object.hasOwn(module.default, name) ? module.default[name] : undefined;
  const functions = config.functions.map(name => {
    const fn = getExport(name);
    if (typeof fn !== 'function') throw new Error(`Экспорт «${name}» не является функцией.`);
    return { name, fn };
  });
  const generator = config.input === 'custom' ? getExport('generateInput') : null;
  if (config.input === 'custom' && typeof generator !== 'function') throw new Error('Экспортируйте generateInput(size, seed), возвращающий массив аргументов.');
  const points = [];
  for (const size of config.sizes) {
    const samples = functions.map(() => []);
    for (let round = -config.warmup; round < config.repetitions; round++) {
      // Rotate order between rounds; provide identical fresh inputs to each implementation.
      for (let offset = 0; offset < functions.length; offset++) {
        const index = ((round + config.warmup) + offset) % functions.length;
        const args = generator ? await generator(size, 42) : makeArgs(size, config.input, 42);
        if (!Array.isArray(args)) throw new Error('generateInput должен возвращать массив аргументов.');
        const start = performance.now();
        const result = functions[index].fn(...args);
        if (result && typeof result.then === 'function') await result;
        const elapsed = performance.now() - start;
        if (round >= 0) samples[index].push(elapsed);
      }
    }
    functions.forEach(({ name }, i) => {
      const point = { name, size, ...statistics(samples[i]) };
      points.push(point);
      onPoint(point);
    });
  }
  return { config, points, createdAt: new Date().toISOString(), runtime: process.version, platform: process.platform };
}
module.exports = { validateConfig, makeArgs, statistics, benchmark };
