'use strict';
const { validateConfig } = require('./validation');
const { detectLanguage } = require('./languages');
function parseSizes(text) {
  return text.split(',').map(value => Number(value.trim()));
}
function buildConfig(modulePath, names, sizes, input, settings) {
  return validateConfig({modulePath, language:detectLanguage(modulePath), functions:names.split(',').map(name => name.trim()), sizes:parseSizes(sizes), input,
    repetitions:settings.get('repetitions', 7), warmup:settings.get('warmup', 2), timeoutMs:settings.get('timeoutSeconds', 30) * 1000});
}
module.exports = { parseSizes, buildConfig };
