'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { runBenchmark } = require('../src/runner');
const options={cppCompilerPath:process.env.TEST_CPP_COMPILER || 'g++'};
const config={modulePath:path.resolve(__dirname,'../examples/algorithms.cpp'),functions:['unique_slow','unique_fast'],sizes:[10,100],input:'random',warmup:1,repetitions:3,timeoutMs:30000};
test('C++ compiles and measures both implementations', async () => {
  const result=await runBenchmark(config,options);
  assert.equal(result.config.language,'cpp');assert.match(result.runtime,/C\+\+17/);
  assert.equal(result.points.length,4);
  for(const point of result.points) assert.equal(point.samplesMs.length,3);
});
test('C++ accepts custom tuples, qualified names, void functions and fresh inputs', async () => {
  const custom=await runBenchmark({...config,modulePath:path.resolve(__dirname,'../examples/custom_input.cpp'),functions:['linear_search','binary_search'],input:'custom'},options);
  assert.equal(custom.points.length,4);
  const result=await runBenchmark({...config,modulePath:path.resolve(__dirname,'fixtures/cpp_cases.cpp'),functions:['example::mutate'],input:'reversed'},options);
  assert.equal(result.points.length,2);
});
test('C++ reports compilation and runtime errors', async () => {
  await assert.rejects(runBenchmark({...config,functions:['missing']},options),/Компиляция C\+\+/);
  await assert.rejects(runBenchmark({...config,modulePath:path.resolve(__dirname,'fixtures/cpp_cases.cpp'),functions:['example::fails']},options),/cpp fixture failure/);
  await assert.rejects(runBenchmark(config,{cppCompilerPath:path.resolve(__dirname,'missing-compiler')}),/Не удалось запустить/);
});
test('C++ cancellation stops a running infinite loop and timeout bounds compilation', async () => {
  const controller=new AbortController(); let started=false;
  const cfg={...config,modulePath:path.resolve(__dirname,'fixtures/cpp_cases.cpp'),functions:['example::hangs']};
  await assert.rejects(runBenchmark(cfg,{...options,signal:controller.signal,onStage:stage=>{
    if(stage==='run') {started=true;setTimeout(()=>controller.abort(),100);}
  }}),/отменено/);
  assert.equal(started,true);
  await assert.rejects(runBenchmark({...config,timeoutMs:100},options),/Превышен лимит/);
});

test('C++ accepts a file with main without running or rewriting its entry point', async () => {
  const fs = require('node:fs/promises');
  const filename = path.resolve(__dirname,'fixtures/cpp_with_main.cpp');
  const before = await fs.readFile(filename);
  const result = await runBenchmark({...config,modulePath:filename,functions:['sum_values']},options);
  assert.equal(result.points.length,2);
  assert.deepEqual(await fs.readFile(filename),before);
});
test('C++ accepts argc/argv main and custom zero-argument benchmarks', async () => {
  const result = await runBenchmark({...config,modulePath:path.resolve(__dirname,'fixtures/cpp_with_argv_main.cpp'),functions:['no_args'],input:'custom'},options);
  assert.equal(result.points.length,2);
});
