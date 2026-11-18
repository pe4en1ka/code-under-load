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
  // Both axes share this scale; only the user-selected N changes it.
  function axisScale(maxN) {
    const magnitude = 10 ** Math.floor(Math.log10(maxN / 5));
    const step = [1, 2, 2.5, 5, 10].find(v => v * magnitude >= maxN / 5) * magnitude;
    return { min: 0, max: Math.ceil(maxN / step) * step, step };
  }
  function plot(maxN = 10, selected = defaults, logY = false) {
    if (!Number.isInteger(maxN) || maxN < 2 || maxN > 100) throw new Error('Укажите целое n от 2 до 100.');
    const series = models.filter(m => selected.includes(m.id));
    const scale = axisScale(maxN);
    const samples = series.map(model => ({ model, values: Array.from({ length: maxN }, (_, i) => ({ n: i + 1, y: model.value(i + 1) })) }));
    const high = logY ? Math.log10(scale.max) : scale.max;
    const low = 0;
    // Square plotting area: one unit has exactly the same pixel length on both axes.
    const width = 720, height = 720, left = 85, right = 35, top = 35, bottom = 85;
    const x = n => left + n / scale.max * (width - left - right);
    const y = v => height - bottom - ((logY ? Math.log10(v) : v) - low) / (high - low) * (height - top - bottom);
    let body = '';
    const sharedTicks = Array.from({ length: Math.round(scale.max / scale.step) + 1 }, (_, i) => i * scale.step);
    const ticks = logY ? [...new Set([...Array.from({ length: Math.floor(high) + 1 }, (_, i) => 10 ** i), scale.max])] : sharedTicks;
    for (const value of ticks) {
      body += `<line class="grid" data-axis="y" x1="${left}" x2="${width - right}" y1="${y(value)}" y2="${y(value)}"/><text data-axis="y" x="${left - 10}" y="${y(value) + 4}" text-anchor="end">${format(value)}</text>`;
    }
    for (const n of sharedTicks)
      body += `<line class="grid" data-axis="x" x1="${x(n)}" x2="${x(n)}" y1="${top}" y2="${height - bottom}"/><text data-axis="x" x="${x(n)}" y="${height - bottom + 25}" text-anchor="middle">${format(n)}</text>`;
    body += `<defs><clipPath id="function-plot-clip"><rect x="${left}" y="${top}" width="${width - left - right}" height="${height - top - bottom}"/></clipPath></defs><g clip-path="url(#function-plot-clip)">`;
    for (const { model, values } of samples) {
      const visible = values.filter(p => p.y >= (logY ? 1 : 0) && p.y <= scale.max);
      const curve = [...visible];
      // Clip the final segment in data space: do not emit enormous SVG coordinates
      // or flatten an out-of-range function into a false horizontal line at the top.
      const firstAbove = values.findIndex(p => p.y > scale.max);
      if (firstAbove > 0 && curve.length) {
        const a = values[firstAbove - 1], b = values[firstAbove];
        const transform = value => logY ? Math.log10(value) : value;
        const ratio = (high - transform(a.y)) / (transform(b.y) - transform(a.y));
        curve.push({ n: a.n + (b.n - a.n) * ratio, y: scale.max });
      }
      const color = colors[models.indexOf(model)];
      body += `<polyline fill="none" stroke="${color}" stroke-width="2.5" points="${curve.map(p => `${x(p.n)},${y(p.y)}`).join(' ')}"><title>f(n) = ${model.label}</title></polyline>`;
      for (const p of visible) body += `<circle cx="${x(p.n)}" cy="${y(p.y)}" r="3" fill="${color}"><title>${model.label}: n = ${p.n}, f(n) = ${format(p.y)}</title></circle>`;
    }
    body += '</g>';
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Графики математических функций f(n)"><text x="${left}" y="16">f(n)${logY ? ' · логарифмическая шкала' : ''}</text>${body}<text x="${width / 2}" y="${height - 8}" text-anchor="middle">n</text></svg><p class="hint">${logY ? `Шкала n: 0–${format(scale.max)}. Шкала f(n): 1–${format(scale.max)}, логарифмическая; единицы осей различаются.` : `Обе оси: 0–${format(scale.max)}, шаг ${format(scale.step)}. Единичные отрезки равны: f(n) = n идёт под 45°.`} Диапазоны меняются только вместе с N, а не при выборе функций. Значения выше ${format(scale.max)} выходят за верхнюю границу графика.</p>${!series.length ? '<p>Выберите хотя бы одну функцию.</p>' : ''}${logY && samples.some(s => s.values.some(p => p.y === 0)) ? '<p class="hint">Нулевые значения не отображаются на логарифмической шкале.</p>' : ''}`;
  }
  const api = { models, colors, defaults, axisScale, plot };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CodeUnderLoadFunctions = api;
})(globalThis);
