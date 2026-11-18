'use strict';
const api = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
document.getElementById('log-scale')?.addEventListener('change', event => {
  document.getElementById('linear-chart').hidden = event.target.checked;
  document.getElementById('log-chart').hidden = !event.target.checked;
});
const mathFunctions = globalThis.CodeUnderLoadFunctions;
if (mathFunctions && document.getElementById('function-chart')) {
  const redraw = () => {
    const maxN = Number(document.getElementById('function-max-n').value);
    const selected = [...document.querySelectorAll('[data-function-id]')].filter(input => input.checked).map(input => input.dataset.functionId);
    try {
      document.getElementById('function-chart').innerHTML = mathFunctions.plot(maxN, selected, document.getElementById('function-log-y').checked);
      document.getElementById('function-error').textContent = '';
    } catch (error) { document.getElementById('function-error').textContent = error.message; }
  };
  document.getElementById('function-max-n').addEventListener('input', redraw);
  document.getElementById('function-log-y').addEventListener('change', redraw);
  for (const input of document.querySelectorAll('[data-function-id]')) input.addEventListener('change', redraw);
}
for (const button of document.querySelectorAll('[data-export]')) {
  button.addEventListener('click', () => api?.postMessage({type:'export', format:button.dataset.export}));
}
