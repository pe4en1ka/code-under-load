'use strict';
(function (root) {
  const factorial = n => { let result = 1; for (let i = 2; i <= n; i++) result *= i; return result; };
  const models = [
    { id: 'constant', label: '1', value: () => 1 },
    { id: 'log', label: 'log₂ n', value: n => Math.log2(n) },
    { id: 'logSquared', label: '(log₂ n)²', value: n => Math.log2(n) ** 2 },
    { id: 'sqrt', label: '√n', value: n => Math.sqrt(n) },
    { id: 'linear', label: 'n', value: n => n },
    { id: 'nlog', label: 'n log₂ n', value: n => n * Math.log2(n) },
    { id: 'nSqrt', label: 'n√n', value: n => n * Math.sqrt(n) },
    { id: 'square', label: 'n²', value: n => n ** 2 },
    { id: 'squareLog', label: 'n² log₂ n', value: n => n ** 2 * Math.log2(n) },
    { id: 'cube', label: 'n³', value: n => n ** 3 },
    { id: 'fourth', label: 'n⁴', value: n => n ** 4 },
    { id: 'fifth', label: 'n⁵', value: n => n ** 5 },
    { id: 'exp2', label: '2ⁿ', value: n => 2 ** n },
    { id: 'exp3', label: '3ⁿ', value: n => 3 ** n },
    { id: 'factorial', label: 'n!', value: factorial },
    { id: 'nPowerN', label: 'nⁿ', value: n => n ** n }
  ];
  const colors = ['#56c8ff', '#ffbe62', '#bd9cff', '#69dbaf', '#ff83ac', '#c5d86d', '#c2c8d0', '#f89170', '#56b4b0', '#9cafff', '#d9a4d1', '#8abf74', '#e9a33b', '#71a8c9', '#db7188', '#aab07d'];
  const defaults = ['constant', 'linear', 'nlog', 'square', 'cube'];
  const format = x => x === 0 ? '0' : x >= 10000 || x < 0.01 ? x.toExponential(2) : String(Number(x.toPrecision(4)));
  function plot(maxN = 10, selected = defaults, logY = false) {
    if (!Number.isInteger(maxN) || maxN < 2 || maxN > 100) throw new Error('Укажите целое n от 2 до 100.');
    const series = models.filter(m => selected.includes(m.id));
    if (!series.length) return '<p>Выберите хотя бы одну функцию.</p>';
    const samples = series.map(model => ({ model, values: Array.from({ length: maxN }, (_, i) => ({ n: i + 1, y: model.value(i + 1) })) }));
    const positive = samples.flatMap(s => s.values.map(p => p.y)).filter(v => v > 0);
    const high = logY ? Math.max(1, Math.ceil(Math.log10(Math.max(...positive)))) : Math.max(...positive) * 1.08;
    const low = logY ? Math.min(0, Math.floor(Math.log10(Math.min(...positive)))) : 0;
    const width = 960, height = 380, left = 85, right = 30, top = 30, bottom = 55;
    const x = n => left + (n - 1) / (maxN - 1) * (width - left - right);
    const y = v => height - bottom - ((logY ? Math.log10(v) : v) - low) / (high - low) * (height - top - bottom);
    let body = '';
    for (let i = 0; i <= 4; i++) {
      const v = low + (high - low) * i / 4;
      const value = logY ? 10 ** v : v;
      body += `<line class="grid" x1="${left}" x2="${width - right}" y1="${y(value)}" y2="${y(value)}"/><text x="${left - 10}" y="${y(value) + 4}" text-anchor="end">${format(value)}</text>`;
    }
    for (const n of [...new Set(Array.from({ length: Math.min(7, maxN) }, (_, i) => Math.round(1 + (maxN - 1) * i / (Math.min(7, maxN) - 1))))])
      body += `<text x="${x(n)}" y="${height - bottom + 25}" text-anchor="middle">${n}</text>`;
    for (const { model, values } of samples) {
      const visible = values.filter(p => !logY || p.y > 0);
      const color = colors[models.indexOf(model)];
      body += `<polyline fill="none" stroke="${color}" stroke-width="2.5" points="${visible.map(p => `${x(p.n)},${y(p.y)}`).join(' ')}"><title>f(n) = ${model.label}</title></polyline>`;
      for (const p of visible) body += `<circle cx="${x(p.n)}" cy="${y(p.y)}" r="3" fill="${color}"><title>${model.label}: n = ${p.n}, f(n) = ${format(p.y)}</title></circle>`;
    }
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Графики математических функций f(n)"><text x="${left}" y="16">f(n)${logY ? ' · логарифмическая шкала' : ''}</text>${body}<text x="${width / 2}" y="${height - 8}" text-anchor="middle">n</text></svg>${logY && samples.some(s => s.values.some(p => p.y === 0)) ? '<p class="hint">Нулевые значения не отображаются на логарифмической шкале.</p>' : ''}`;
  }
  const api = { models, colors, defaults, plot };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CodeUnderLoadFunctions = api;
})(globalThis);
