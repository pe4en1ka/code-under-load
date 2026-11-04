'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { runProcess } = require('./process');
const { generateStdin } = require('./program-inputs');
const { statistics } = require('./benchmark');
const { validateConfig } = require('./validation');

async function runCppProgram(config, {cppCompilerPath = 'g++', signal, onStage = () => {}, onPoint = () => {}} = {}) {
  validateConfig(config);
  if (signal?.aborted) throw new Error('Измерение отменено.');
  const deadline = Date.now() + config.timeoutMs;
  const remaining = () => Math.max(1,deadline-Date.now());
  const directory = await fs.mkdtemp(path.join(os.tmpdir(),'code-under-load-program-'));
  const cwd = path.dirname(config.modulePath);
  const points = [];
  try {
    const executable = path.join(directory,process.platform === 'win32' ? 'program.exe' : 'program');
    onStage('compile');
    try {
      await runProcess(cppCompilerPath,['-std=c++17','-O2',path.resolve(config.modulePath),'-o',executable],{cwd,signal,timeoutMs:remaining()});
    } catch (error) { throw new Error(`Компиляция C++: ${error.message}`); }
    onStage('run');
    for (let index = 0; index < config.sizes.length; index++) {
      // Prepare once outside timed runs; every repeat receives identical bytes.
      let input;
      const filename = config.input === 'files' ? config.inputFiles[index] : undefined;
      if (filename) {
        const info = await fs.stat(filename);
        if (!info.isFile() || info.size > 64 * 1024 * 1024) throw new Error('Входной файл должен быть обычным файлом размером не более 64 МиБ.');
        input = await fs.readFile(filename);
        if (input.length > 64 * 1024 * 1024) throw new Error('Входной файл превышает 64 МиБ.');
      } else input = generateStdin(config.sizes[index], config.input, config.stdinFormat);
      const samples = [];
      let output;
      for (let round = -config.warmup; round < config.repetitions; round++) {
        output = await runProcess(executable,[],{cwd,signal,timeoutMs:remaining(),input});
        if (round >= 0) samples.push(output.elapsedMs);
      }
      const point = {name:'main',size:config.sizes[index],...statistics(samples),
        ...(filename ? {inputFile:path.basename(filename)} : {inputGenerator:config.input,stdinFormat:config.stdinFormat}),inputBytes:input.length,stdoutPreview:output.stdout,stderrPreview:output.stderr};
      points.push(point);onPoint(point);
    }
    return {config:{...config,language:'cpp',mode:'program'},points,createdAt:new Date().toISOString(),
      runtime:`C++17 program (${path.basename(cppCompilerPath)})`,platform:process.platform,measurement:'process',
      compiler:{command:cppCompilerPath,flags:['-std=c++17','-O2']}};
  } finally { await fs.rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100}); }
}
module.exports = { runCppProgram };
