'use strict';
const path = require('node:path');
const { StringDecoder } = require('node:string_decoder');
function previewStdin(input) {
  // Decode a bounded prefix without breaking a UTF-8 sequence or a surrogate pair.
  const decoder = new StringDecoder('utf8');
  const prefix = decoder.write(input.subarray(0, 8000 * 4));
  const stdinPreview = [...prefix].slice(0, 8000).join('');
  return { stdinPreview, stdinTruncated: input.length > Buffer.byteLength(stdinPreview, 'utf8') };
}
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
module.exports = { generateStdin, previewStdin, sortInputFiles, suggestSizes, inputOrderLabel };
