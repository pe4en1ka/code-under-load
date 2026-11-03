'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { runBenchmark } = require('../src/runner');
const { renderReport } = require('../src/report');
const { toCsv } = require('../src/export');
const { buildConfig } = require('../src/configuration');
const config = {modulePath:path.resolve(__dirname, 'fixtures/async.mjs'), functions:['sum'], sizes:[10], input:'custom', repetitions:3, warmup:1, timeoutMs:5000};
test('supports ESM, promises, multiple arguments, and function errors', async () => {
  const result = await runBenchmark(config, {nodePath:process.execPath});
  assert.equal(result.points[0].samplesMs.length, 3);
  await assert.rejects(runBenchmark({...config, functions:['fails']}, {nodePath:process.execPath}), /fixture failure/);
});
test('report escapes names, handles single size and zero durations', () => {
  const name = '</script><img src=x onerror=alert(1)>';
  const result = {config:{...config, functions:[name]}, points:[{name,size:10,medianMs:0,minMs:0,p95Ms:0,maxMs:0}], runtime:'v24',platform:'linux',createdAt:'now'};
  const html = renderReport(result);
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('NaN'));
  assert.ok(!html.includes('Infinity'));
  assert.match(html, /Content-Security-Policy/);
});
test('CSV escapes quotes, newlines, and spreadsheet formulas', () => {
  const csv = toCsv({points:[{name:'=SUM(A1)',size:10,medianMs:1,minMs:1,p95Ms:2,maxMs:2}]});
  assert.ok(csv.includes('"\'=SUM(A1)"'));
});
test('configuration parses input and rejects non-numeric values', () => {
  const settings = {get:(key, fallback) => fallback};
  assert.deepEqual(buildConfig('/test.cjs','one, two','10, 100','random',settings).functions,['one','two']);
  assert.throws(() => buildConfig('/test.cjs','one','abc','random',settings));
});
