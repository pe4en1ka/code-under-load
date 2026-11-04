'use strict';
const path = require('node:path');
const EXTENSIONS = {'.js':'javascript','.cjs':'javascript','.mjs':'javascript','.py':'python','.cpp':'cpp','.cc':'cpp','.cxx':'cpp'};
function detectLanguage(file) {
  const language = EXTENSIONS[path.extname(file).toLowerCase()];
  if (!language) throw new Error('Выберите файл JavaScript, Python или C++ (.js, .cjs, .mjs, .py, .cpp, .cc, .cxx).');
  return language;
}
const LANGUAGE_LABELS = {javascript:'JavaScript', python:'Python', cpp:'C++'};
module.exports = { detectLanguage, LANGUAGE_LABELS };
