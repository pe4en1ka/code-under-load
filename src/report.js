'use strict';
const { randomBytes } = require('node:crypto');
const { LANGUAGE_LABELS } = require('./languages');
const mathFunctions = require('../media/functions');
const COLORS = ['#56c8ff', '#ffbe62', '#bd9cff', '#69dbaf'];
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const number = value => value === 0 ? '0' : value < 0.001 ? value.toExponential(2) : value.toFixed(3);

function chart(result, logarithmic = false) {
  const width = 960, height = 350, left = 80, right = 30, top = 25, bottom = 60;
  const sizes = result.config.sizes;
  const maxTime = Math.max(0.001, ...result.points.map(point => point.medianMs)) * 1.12;
  const transform = value => logarithmic ? Math.log10(value) : value;
  const lo = transform(sizes[0]), hi = transform(sizes.at(-1));
  const x = value => left + (hi === lo ? 0.5 : (transform(value) - lo) / (hi - lo)) * (width - left - right);
  const y = value => height - bottom - value / maxTime * (height - top - bottom);
  let body = '';
  for (let i = 0; i <= 4; i++) {
    const time = maxTime * i / 4;
    body += `<line x1="${left}" y1="${y(time)}" x2="${width-right}" y2="${y(time)}" class="grid"/><text x="${left-12}" y="${y(time)+4}" text-anchor="end">${number(time)}</text>`;
  }
  // Limit labels on dense experiments while retaining every measured point.
  const step = Math.ceil(sizes.length / 8);
  sizes.forEach((size, i) => {
    if (i % step === 0 || i === sizes.length-1) body += `<text x="${x(size)}" y="${height-bottom+25}" text-anchor="middle">${size.toLocaleString('en-US')}</text>`;
  });
  result.config.functions.forEach((name, i) => {
    const points = result.points.filter(point => point.name === name);
    body += `<polyline fill="none" stroke="${COLORS[i]}" stroke-width="3" points="${points.map(point => `${x(point.size)},${y(point.medianMs)}`).join(' ')}"/>`;
    for (const point of points) body += `<circle cx="${x(point.size)}" cy="${y(point.medianMs)}" r="5" fill="${COLORS[i]}"><title>${escape(name)} · n=${point.size} · ${number(point.medianMs)} мс</title></circle>`;
  });
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="График: размер входа и медианное время выполнения"><text x="${left}" y="14">Время, мс</text>${body}<text x="${width/2}" y="${height-8}" text-anchor="middle">Размер входа, n${logarithmic ? ' · логарифмическая шкала' : ''}</text></svg>`;
}
function renderAnalysis(analysis = {}) {
  return `<section class="card"><h2>Асимптотическая оценка по исходнику</h2>${Object.entries(analysis).map(([name, item]) => `<article><h3>${escape(name)}</h3>${item.status === 'estimated' ? `<p><strong>Время: ${escape(item.time)} · Дополнительная память: ${escape(item.memory)}</strong></p>` : '<p><strong>Автоматическая оценка не определена</strong></p>'}<p>${escape(item.reason)}</p>${item.evidence?.length ? `<ul>${item.evidence.map(e => `<li>Строка ${e.line}: ${escape(e.text)}</li>`).join('')}</ul>` : ''}${item.assumptions?.length ? `<details><summary>Условия оценки</summary><ul>${item.assumptions.map(text => `<li>${escape(text)}</li>`).join('')}</ul></details>` : ''}</article>`).join('') || '<p>Разбор исходника отсутствует. Запустите «Оценить сложность по исходнику».</p>'}<p class="hint">Статический анализ поддерживаемых конструкций. Замеры времени на эту оценку не влияют. Неподдерживаемые вызовы, рекурсия и неясные границы циклов требуют ручного разбора.</p></section>`;
}
function renderFunctions() {
  return `<section class="card"><h2>Графики функций f(n)</h2><div class="function-controls"><label>Максимальное n <input id="function-max-n" type="number" min="2" max="100" value="10"></label><label><input id="function-log-y" type="checkbox"> Логарифмическая шкала f(n)</label></div><div class="function-legend">${mathFunctions.models.map((m, i) => `<label><input type="checkbox" data-function-id="${m.id}"${mathFunctions.defaults.includes(m.id) ? ' checked' : ''}><svg viewBox="0 0 20 4" aria-hidden="true"><line x1="0" x2="20" y1="2" y2="2" stroke="${mathFunctions.colors[i]}" stroke-width="3"/></svg>${escape(m.label)}</label>`).join('')}</div><p id="function-error" role="status"></p><div id="function-chart">${mathFunctions.plot()}</div><p class="hint">Обычные значения математических функций. Горизонтальная ось — n, вертикальная — f(n). Это отдельный график, не время выполнения программы. Выберите функции и диапазон n от 1 до 100. Точки соответствуют целым n.</p></section>`;
}
function renderReport(result, { cssUri = '', scriptUri = '', functionsUri = '', cspSource = '' } = {}) {
  const nonce = randomBytes(16).toString('hex');
  const names = result.config.functions;
  const program = result.config.mode === 'program';
  const timing = program ? 'Измеряется весь процесс: запуск программы, main и ввод-вывод. Компиляция, генерация и чтение входных данных расширением исключены. Каждый повтор — новый процесс.' : 'Измеряется вызов функции и ожидание её завершения. Генерация входа, загрузка модуля и компиляция исключены.';
  const largest = result.points.filter(point => point.size === result.config.sizes.at(-1));
  const fastest = [...largest].sort((a,b) => a.medianMs-b.medianMs)[0];
  const rows = result.points.map(point => `<tr><td>${escape(point.name)}</td><td>${point.size}</td>${program ? `<td>${escape(point.inputFile || `${point.inputGenerator} · ${point.stdinFormat}`)}</td>` : ''}<td>${number(point.medianMs)}</td><td>${number(point.minMs)}</td><td>${number(point.p95Ms)}</td><td>${number(point.maxMs)}</td></tr>`).join('');
  const output = program ? `<section class="card"><h2>Вывод программы</h2><p class="hint">Последний измеренный запуск для каждого теста. Показан конец stdout и stderr, до 8000 символов каждого.</p>${result.points.map(point=>`<details><summary>n = ${point.size} · ${escape(point.inputFile || `${point.inputGenerator} · ${point.stdinFormat}`)}</summary><h3>stdout</h3><pre>${escape(point.stdoutPreview || '(пусто)')}</pre>${point.stderrPreview ? `<h3>stderr</h3><pre>${escape(point.stderrPreview)}</pre>` : ''}</details>`).join('')}</section>` : '';
  return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${escape(cspSource)}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${escape(cssUri)}"><title>Код под нагрузкой</title></head><body>
<header><div><span class="eyebrow">ЛАБОРАТОРИЯ ПРОИЗВОДИТЕЛЬНОСТИ</span><h1>Код под нагрузкой</h1><p>${escape(LANGUAGE_LABELS[result.config.language || 'javascript'])} · ${program ? 'Программа целиком через main' : 'Функции'} · Как растёт время выполнения вместе с объёмом данных</p></div><div class="actions"><button data-export="json">Сохранить JSON</button><button data-export="csv">Сохранить CSV</button></div></header>
<section class="metrics"><article><span>Размеры входа</span><strong>${result.config.sizes.length}</strong><small>от ${result.config.sizes[0]} до ${result.config.sizes.at(-1)}</small></article><article><span>Измерений на точку</span><strong>${result.config.repetitions}</strong><small>+ ${result.config.warmup} ${program ? 'прогревочных запуска' : 'прогревочных вызова'}</small></article><article><span>Меньшая медиана при максимальном n</span><strong>${escape(fastest.name)}</strong><small>${number(fastest.medianMs)} мс · n = ${fastest.size}</small></article></section>
${renderAnalysis(result.complexity)}
<section class="card"><div class="section-head"><h2>Время выполнения</h2><label><input type="checkbox" id="log-scale"> Логарифмическая шкала n</label></div>
<div class="legend">${names.map((name,i) => `<span class="series series-${i}">● ${escape(name)}</span>`).join('')}</div>
<div id="linear-chart">${chart(result)}</div><div id="log-chart" hidden>${chart(result,true)}</div><p class="hint">Линии соединяют измеренные точки. Наведите курсор на точку для подробностей.</p></section>
${renderFunctions()}
<section class="card"><h2>Результаты измерений</h2><div class="table-scroll"><table><thead><tr><th>${program ? 'Программа' : 'Функция'}</th><th>Размер n</th>${program ? '<th>Входные данные</th>' : ''}<th>Медиана, мс</th><th>Минимум, мс</th><th>P95, мс</th><th>Максимум, мс</th></tr></thead><tbody>${rows}</tbody></table></div></section>
${output}
<footer><p>${escape(result.runtime)} · ${escape(result.platform)} · ${escape(result.config.input)} · ${escape(result.createdAt)}</p><p>${timing} Результат зависит от среды, JIT и сборки мусора; график не доказывает асимптотическую сложность.</p></footer>
<script nonce="${nonce}" src="${escape(functionsUri)}"></script><script nonce="${nonce}" src="${escape(scriptUri)}"></script></body></html>`;
}
function renderSourceReport(analysis, { cssUri = '', scriptUri = '', functionsUri = '', cspSource = '' } = {}) {
  const nonce = randomBytes(16).toString('hex');
  return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${escape(cspSource)}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${escape(cssUri)}"><title>Анализ сложности</title></head><body><h1>Код под нагрузкой</h1><p>Разбор исходника без запуска программы.</p>${renderAnalysis(analysis)}${renderFunctions()}<script nonce="${nonce}" src="${escape(functionsUri)}"></script><script nonce="${nonce}" src="${escape(scriptUri)}"></script></body></html>`;
}
module.exports = { renderReport, renderSourceReport, renderAnalysis, chart, escape };
