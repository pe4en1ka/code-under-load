'use strict';
const { detectLanguage } = require('./languages');
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
  if (config.mode && !['functions','program'].includes(config.mode)) throw new Error('Неизвестный режим измерений.');
  if (!['random', 'sorted', 'reversed', 'custom', ...(config.mode === 'program' ? ['files'] : [])].includes(config.input)) throw new Error('Неизвестный генератор данных.');
  const language = detectLanguage(config.modulePath);
  if (config.language && config.language !== language) throw new Error('Язык не соответствует расширению файла.');
  if (language === 'cpp' && config.functions.some(name => !/^[A-Za-z_]\w*(?:::[A-Za-z_]\w*)*$/.test(name))) {
    throw new Error('Для C++ укажите имена функций, например unique_fast или algo::sort.');
  }
  if (config.mode === 'program') {
    if (language !== 'cpp' || config.input !== 'files' || config.functions.length !== 1 || config.functions[0] !== 'main') {
      throw new Error('Режим программы поддерживает C++ main и входные файлы.');
    }
    if (!Array.isArray(config.inputFiles) || config.inputFiles.length !== config.sizes.length ||
        config.inputFiles.some(file => typeof file !== 'string' || !file.trim())) {
      throw new Error('Укажите один входной файл для каждого размера задачи.');
    }
  } else if (language === 'cpp' && config.functions.includes('main')) {
    throw new Error('Для main выберите режим «Программа целиком через main».');
  }
  return config;
}

module.exports = { validateConfig };
