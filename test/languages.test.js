'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const { detectLanguage } = require('../src/languages');
const { validateConfig } = require('../src/validation');
const { runProcess } = require('../src/process');
test('detects all supported extensions and validates C++ names', () => {
  for (const [file, language] of [['x.py','python'],['x.CPP','cpp'],['x.cc','cpp'],['x.mjs','javascript']]) assert.equal(detectLanguage(file),language);
  assert.throws(() => detectLanguage('x.txt'));
  const config = {modulePath:'/tmp/x.cpp',functions:['a); injected()'],sizes:[10],input:'random',repetitions:3,warmup:0,timeoutMs:1000};
  assert.throws(() => validateConfig(config), /имена функций/);
  validateConfig({...config,functions:['algo::unique_fast']});
});
test('process helper captures output and propagates launch errors', async () => {
  const result = await runProcess(process.execPath,['-e','process.stdout.write("ok")'],{timeoutMs:5000});
  assert.equal(result.stdout,'ok');
  await assert.rejects(runProcess('/missing-executable',[],{timeoutMs:5000}),/Не удалось запустить/);
});
