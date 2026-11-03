'use strict';
const api = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
document.getElementById('log-scale').addEventListener('change', event => {
  document.getElementById('linear-chart').hidden = event.target.checked;
  document.getElementById('log-chart').hidden = !event.target.checked;
});
for (const button of document.querySelectorAll('[data-export]')) {
  button.addEventListener('click', () => api?.postMessage({type:'export', format:button.dataset.export}));
}
