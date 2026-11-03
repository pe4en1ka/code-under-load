'use strict';
const { benchmark } = require('./benchmark');
process.once('message', async config => {
  try {
    const result = await benchmark(config, point => process.send?.({ type: 'point', point }));
    process.send?.({ type: 'result', result }, () => process.exit(0));
  } catch (error) {
    process.send?.({ type: 'error', error: error.message }, () => process.exit(1));
  }
});
