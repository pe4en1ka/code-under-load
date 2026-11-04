'use strict';
function csvCell(value) {
  let text = String(value);
  // Spreadsheet programs must treat user-controlled names as data, not formulas.
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
function toCsv(result) {
  const keys = ['name', 'size', ...(result.config?.mode === 'program' ? ['inputFile','inputBytes'] : []), 'medianMs', 'minMs', 'p95Ms', 'maxMs'];
  return '\uFEFF' + keys.join(',') + '\r\n' + result.points.map(point => keys.map(key => csvCell(point[key])).join(',')).join('\r\n') + '\r\n';
}
module.exports = { toCsv };
