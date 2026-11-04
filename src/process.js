'use strict';
const { spawn } = require('node:child_process');
const { performance } = require('node:perf_hooks');

function runProcess(command, args, {cwd, signal, timeoutMs, input = '', onStdout, env} = {}) {
  if (signal?.aborted) return Promise.reject(new Error('Измерение отменено.'));
  return new Promise((resolve, reject) => {
    let failure, stderr = '', stdout = '';
    const started = performance.now();
    const child = spawn(command, args, {cwd, env, windowsHide:true, detached:process.platform !== 'win32', stdio:['pipe','pipe','pipe']});
    const stop = error => {
      if (failure) return;
      failure = error;
      if (!child.pid) return;
      if (process.platform === 'win32') {
        const killer = spawn('taskkill', ['/PID',String(child.pid),'/T','/F'], {windowsHide:true,stdio:'ignore'});
        killer.on('error', () => child.kill('SIGKILL'));
        killer.unref();
      } else {
        try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
      }
    };
    const cancel = () => stop(new Error('Измерение отменено.'));
    const timer = setTimeout(() => stop(new Error('Превышен лимит времени эксперимента. Уменьшите размеры или число повторов.')), timeoutMs);
    signal?.addEventListener('abort', cancel, {once:true});
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      try {
        if (onStdout) onStdout(chunk);
        else stdout = (stdout + chunk).slice(-8000);
      } catch (error) { stop(error); }
    });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-8000); });
    child.stdin.on('error', error => { if (error.code !== 'EPIPE') stop(error); });
    child.on('error', error => { failure = new Error(`Не удалось запустить ${command}: ${error.message}`); });
    child.on('close', (code, reason) => {
      clearTimeout(timer); signal?.removeEventListener('abort', cancel);
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error(`Процесс завершился с ошибкой (${code ?? reason}). ${stderr || stdout}`));
      else resolve({stdout, stderr, elapsedMs:performance.now()-started});
    });
    child.once('spawn', () => {
      if (signal?.aborted) cancel();
      else child.stdin.end(input);
    });
  });
}
module.exports = { runProcess };
