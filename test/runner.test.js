'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { runBenchmark } = require('../src/runner');
const config = {modulePath: path.resolve(__dirname, '../examples/algorithms.cjs'), functions:['uniqueFast'], sizes:[10,100], input:'random', warmup:0, repetitions:3, timeoutMs:5000};
const options = {nodePath:process.execPath};
test('runs real child process and returns progress', async () => {
  let progress = 0;
  const result = await runBenchmark(config, {...options, onPoint: () => progress++});
  assert.equal(result.points.length, 2);
  assert.equal(progress, 2);
});
test('kills a synchronous infinite loop on timeout', async () => {
  await assert.rejects(runBenchmark({...config, modulePath:path.resolve(__dirname, 'fixtures/hangs.cjs'), functions:['hang'], timeoutMs:500}, options), /Превышен лимит/);
});
test('cancels a running process', async () => {
  const controller = new AbortController();
  const promise = runBenchmark({...config, modulePath:path.resolve(__dirname, 'fixtures/hangs.cjs'), functions:['hang']}, {...options, signal:controller.signal});
  setTimeout(() => controller.abort(), 100);
  await assert.rejects(promise, /отменено/);
});
test('reports invalid executable and missing export', async () => {
  await assert.rejects(runBenchmark(config, {nodePath:path.resolve(__dirname, 'not-a-node')}), /Node.js/);
  await assert.rejects(runBenchmark({...config, functions:['noSuchFunction']}, options), /не является функцией/);
});
