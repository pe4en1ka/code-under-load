'use strict';
const path = require('node:path');
function sortInputFiles(files) {
  return [...files].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
}
function suggestSizes(files) {
  const values = files.map(file=>Number(path.basename(file).match(/(\d+)(?=\D*$)/)?.[1]));
  return values.every((n,i)=>Number.isInteger(n) && n>0 && n<=1000000 && (i===0 || n>values[i-1])) ? values : files.map((_file,i)=>i+1);
}
function inputOrderLabel(files) {
  return files.map((file,i)=>`${i+1}) ${path.basename(file)}`).join('; ');
}
function generateStdin(size, kind, format) {
  const { makeArgs } = require('./benchmark');
  if (format === 'size') return Buffer.from(`${size}\n`);
  const [values] = makeArgs(size, kind, 42);
  return Buffer.from(`${format === 'size-array' ? `${size}\n` : ''}${values.join(' ')}\n`);
}
module.exports = { generateStdin, sortInputFiles, suggestSizes, inputOrderLabel };
