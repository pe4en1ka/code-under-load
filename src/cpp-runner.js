'use strict';
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { runProcess } = require('./process');
const { createCollector } = require('./external-runner');
const { validateConfig } = require('./validation');

async function makeHarness(config) {
  validateConfig(config);
  const filename = path.resolve(config.modulePath).replace(/\\/g,'/');
  if (/["\r\n]/.test(filename)) throw new Error('Путь C++ не должен содержать кавычки или переводы строк.');
  let source = await fs.readFile(path.join(__dirname,'workers','cpp_harness.cpp'),'utf8');
  const makeArgs = config.input === 'custom' ? 'return ::generate_input(n, std::uint32_t{42});' : `
    std::vector<int> values(n);
    std::uint32_t state = 42;
    for (std::size_t i = 0; i < n; ++i) {
        ${config.input === 'sorted' ? 'values[i] = static_cast<int>(i);' : config.input === 'reversed' ? 'values[i] = static_cast<int>(n-i);' : 'state = state * 1664525u + 1013904223u; values[i] = static_cast<int>(state % 1000000u);'}
    }
    return std::make_tuple(std::move(values));`;
  const replacements = {
    '__TARGET_INCLUDE__':filename, '__MAKE_ARGS__':makeArgs,
    '__SIZES__':config.sizes.join(','), '__NAMES__':config.functions.map(name=>JSON.stringify(name)).join(','),
    '__WARMUP__':String(config.warmup), '__REPETITIONS__':String(config.repetitions),
    '__PLATFORM__':JSON.stringify(process.platform),
    '__CALLS__':config.functions.map((name,i)=>`case ${i}: elapsed = measure([](auto&&... values) -> decltype(auto) { return ::${name}(std::forward<decltype(values)>(values)...); }, args); break;`).join('\n')
  };
  // A single pass prevents tokens occurring inside a user's path from becoming source code.
  return source.replace(/__[A-Z_]+__/g, token => Object.hasOwn(replacements,token) ? replacements[token] : token);
}
async function runCppBenchmark(config, {cppCompilerPath = 'g++', signal, onPoint = () => {}, onStage = () => {}} = {}) {
  const deadline = Date.now() + config.timeoutMs;
  const remaining = () => Math.max(1, deadline - Date.now());
  if (signal?.aborted) throw new Error('Измерение отменено.');
  const folder = await fs.mkdtemp(path.join(os.tmpdir(),'code-under-load-'));
  try {
    const source = path.join(folder,'benchmark.cpp');
    const executable = path.join(folder,process.platform === 'win32' ? 'benchmark.exe' : 'benchmark');
    await fs.writeFile(source,await makeHarness(config));
    onStage('compile');
    try {
      await runProcess(cppCompilerPath, ['-std=c++17','-O2',source,'-o',executable], {
        cwd:path.dirname(config.modulePath), signal, timeoutMs:remaining()
      });
    } catch (error) { throw new Error(`Компиляция C++: ${error.message}`); }
    onStage('run');
    const collector = createCollector(config,onPoint);
    await runProcess(executable,[],{cwd:path.dirname(config.modulePath),signal,timeoutMs:remaining(),onStdout:collector.write});
    return collector.result();
  } finally {
    await fs.rm(folder,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
}
module.exports = { runCppBenchmark, makeHarness };
