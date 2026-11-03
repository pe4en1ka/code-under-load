'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
// Windows cmd.exe does not expand globs; Node.js 18/20 needs explicit paths.
const files = fs.readdirSync(path.join(__dirname, '..', 'test'))
  .filter(name => name.endsWith('.test.js'))
  .sort()
  .map(name => path.join(__dirname, '..', 'test', name));
if (!files.length) throw new Error('Test files not found');
const result = spawnSync(process.execPath, ['--test', ...files], {stdio:'inherit'});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
