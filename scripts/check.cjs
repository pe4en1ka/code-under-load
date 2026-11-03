'use strict';
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
let failed = false;
function check(folder) {
  for (const entry of fs.readdirSync(folder, {withFileTypes:true})) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) check(file);
    else if (/\.(cjs|mjs|js)$/.test(file)) {
      const result = spawnSync(process.execPath, ['--check', file], {stdio:'inherit'});
      if (result.status !== 0) failed = true;
    }
  }
}
for (const folder of ['src','media','examples','test']) check(folder);
process.exitCode = failed ? 1 : 0;
