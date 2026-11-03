'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { benchmark, validateConfig, makeArgs, statistics } = require('../src/benchmark');
const config = { modulePath: path.resolve(__dirname, '../examples/algorithms.cjs'), functions: ['uniqueSlow', 'uniqueFast'], sizes: [10, 100], input: 'random', repetitions: 3, warmup: 1, timeoutMs: 5000 };
test('validates limits and rejects duplicate or unordered inputs', () => {
  for (const patch of [{sizes:[0]}, {sizes:[100,10]}, {functions:['a','a']}, {repetitions:1}, {warmup:11}, {timeoutMs:0}, {input:'unknown'}]) {
    assert.throws(() => validateConfig({...config, ...patch}));
  }
});
test('generates reproducible fresh data', () => {
  const first = makeArgs(20, 'random', 42);
  assert.deepEqual(first, makeArgs(20, 'random', 42));
  first[0].sort();
  assert.notDeepEqual(first, makeArgs(20, 'random', 42));
  assert.deepEqual(makeArgs(3, 'reversed', 42), [[3,2,1]]);
});
test('computes median and p95 from actual samples', () => {
  assert.equal(statistics([9, 1, 3, 5]).medianMs, 4);
  assert.equal(statistics([9, 1, 3, 5]).p95Ms, 9);
});
test('benchmarks both functions at each size and excludes warmup', async () => {
  const progress = [];
  const result = await benchmark(config, point => progress.push(point));
  assert.equal(result.points.length, 4);
  assert.equal(progress.length, 4);
  for (const point of result.points) {
    assert.equal(point.samplesMs.length, 3);
    assert.ok(point.medianMs >= 0);
  }
  await assert.rejects(benchmark({...config, functions:['missing']}), /не является функцией/);
});
