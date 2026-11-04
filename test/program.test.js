'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { runBenchmark } = require('../src/runner');
const { buildProgramConfig } = require('../src/configuration');
const {validateConfig}=require('../src/validation');
const options={cppCompilerPath:process.env.TEST_CPP_COMPILER || 'g++'};
const config={modulePath:path.resolve(__dirname,'../examples/program_sum.cpp'),mode:'program',functions:['main'],
  sizes:[10,100],input:'files',inputFiles:[10,100].map(n=>path.resolve(__dirname,`../examples/program-inputs/input-${n}.in`)),
  warmup:1,repetitions:3,timeoutMs:30000};
test('program mode executes real main, supplies stdin, and collects every sample', async () => {
  const progress=[];
  const result=await runBenchmark(config,{...options,onPoint:p=>progress.push(p)});
  assert.equal(result.measurement,'process');assert.equal(progress.length,2);
  assert.equal(result.points[0].stdoutPreview.trim(),'45');assert.equal(result.points[1].stdoutPreview.trim(),'4950');
  for(const p of result.points) {assert.equal(p.samplesMs.length,3);assert.ok(p.medianMs>0);assert.ok(p.inputBytes>0);}
});
test('program configuration maps files to sizes and rejects mismatches and main in function mode', () => {
  const settings={get:(_key,fallback)=>fallback};
  assert.equal(buildProgramConfig(config.modulePath,config.inputFiles,'10, 100',settings).mode,'program');
  assert.throws(()=>validateConfig({...config,inputFiles:[]}),/входной файл/);
  assert.throws(()=>validateConfig({...config,mode:'functions',input:'random'}),/Программа целиком/);
  assert.throws(()=>validateConfig({...config,modulePath:'test.py'}),/поддерживает C\+\+/);
});
test('program mode reports a missing input file and nonzero exit code', async () => {
  await assert.rejects(runBenchmark({...config,inputFiles:[path.resolve(__dirname,'missing.in'),config.inputFiles[1]]},options),/ENOENT/);
  // C++ source text is deliberately invalid stdin for program_sum, which must exit with code 2.
  await assert.rejects(runBenchmark({...config,sizes:[10],inputFiles:[config.modulePath]},options),/ошибкой \(2\)/);
});
test('program mode cancels a running main and bounds compilation time', async () => {
  const controller=new AbortController();let started=false;
  await assert.rejects(runBenchmark({...config,modulePath:path.resolve(__dirname,'fixtures/cpp_program_hangs.cpp')},
    {...options,signal:controller.signal,onStage:stage=>{if(stage==='run'){started=true;setTimeout(()=>controller.abort(),100);}}}),/отменено/);
  assert.ok(started);
  await assert.rejects(runBenchmark({...config,timeoutMs:100},options),/Превышен лимит/);
});
