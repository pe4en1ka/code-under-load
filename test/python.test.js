'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { runBenchmark } = require('../src/runner');
const options = {pythonPath:process.env.TEST_PYTHON || (process.platform === 'win32' ? 'python' : 'python3')};
const config = {modulePath:path.resolve(__dirname,'../examples/algorithms.py'),functions:['unique_slow','unique_fast'],sizes:[10,100],input:'random',warmup:1,repetitions:3,timeoutMs:10000};
test('Python measures both implementations and reports progress', async () => {
  const progress = [];
  const result = await runBenchmark(config,{...options,onPoint:p=>progress.push(p)});
  assert.equal(result.config.language,'python'); assert.match(result.runtime,/Python 3/);
  assert.equal(progress.length,4);
  for(const point of result.points) assert.equal(point.samplesMs.length,3);
});
test('Python handles async, custom arguments, user output and errors', async () => {
  const cfg = {...config,modulePath:path.resolve(__dirname,'fixtures/python_cases.py'),functions:['add'],input:'custom',sizes:[10]};
  const result = await runBenchmark(cfg,options);
  assert.ok(result.points[0].medianMs >= 0.5);
  await assert.rejects(runBenchmark({...cfg,functions:['fails']},options),/python fixture failure/);
  await assert.rejects(runBenchmark({...cfg,functions:['absent']},options),/Function not found/);
});
test('Python enforces timeout and cancellation', async () => {
  const cfg={...config,modulePath:path.resolve(__dirname,'fixtures/python_cases.py'),functions:['hangs'],input:'custom',sizes:[10]};
  await assert.rejects(runBenchmark({...cfg,timeoutMs:500},options),/Превышен лимит/);
  const controller=new AbortController();
  const promise=runBenchmark(cfg,{...options,signal:controller.signal});
  setTimeout(()=>controller.abort(),100);
  await assert.rejects(promise,/отменено/);
});
