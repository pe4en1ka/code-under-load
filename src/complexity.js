'use strict';

// A conservative source analysis for common loops and calls. Measurements are never used.
const scalar = () => ({});
const factor = name => ({ [name]: 1 });
const multiply = (a, b) => {
  const out = { ...a };
  for (const [name, power] of Object.entries(b)) out[name] = (out[name] || 0) + power;
  return out;
};
function dominates(a, b) {
  const variables = new Set([...Object.keys(a), ...Object.keys(b)].map(x => x.replace(/^log /, '')));
  return [...variables].every(v => (a[v] || 0) > (b[v] || 0) ||
    (a[v] || 0) === (b[v] || 0) && (a[`log ${v}`] || 0) >= (b[`log ${v}`] || 0));
}
function sum(...costs) {
  const terms = costs.flat();
  return terms.filter((term, i) => !terms.some((other, j) => j !== i && dominates(other, term) && (!dominates(term, other) || j < i)));
}
const product = (a, b) => sum(...a.flatMap(x => b.map(y => multiply(x, y))));
const label = cost => `O(${cost.map(term => Object.keys(term).sort((a, b) => a.startsWith('log ') - b.startsWith('log ') || a.localeCompare(b)).map(v => {
  const power = term[v];
  return `${v.startsWith('log ') ? `log ${v.slice(4)}` : v}${power > 1 ? `^${power}` : ''}`;
}).join(' · ') || '1').join(' + ')})`;
const logarithm = cost => sum(...cost.flatMap(t => Object.keys(t).filter(k => !k.startsWith('log ')).map(v => factor(`log ${v}`))));

function tokenize(source) {
  const tokens = [];
  const pattern = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|^\s*#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|[A-Za-z_$][\w$]*|>>=|<<=|>>|<<|::|\+\+|--|\+=|-=|\*=|\/=|<=|>=|==|!=|&&|\|\||=>|[^\s]/gm;
  for (const match of source.matchAll(pattern)) {
    const value = match[0];
    if (/^(?:\/\/|\/\*|\s*#)/.test(value)) continue;
    tokens.push({ value: /^["'`]/.test(value) ? '$string' : value, offset: match.index });
  }
  const pair = new Map(), stack = [];
  for (let i = 0; i < tokens.length; i++) {
    const v = tokens[i].value;
    if ('([{'.includes(v)) stack.push(i);
    else if (')]}'.includes(v)) {
      const begin = stack.pop();
      if (begin === undefined || '([{'.indexOf(tokens[begin].value) !== ')]}'.indexOf(v)) throw new Error('Не удалось разобрать скобки исходника.');
      pair.set(begin, i);
    }
  }
  if (stack.length) throw new Error('Незавершённая конструкция в исходнике.');
  return { tokens, pair };
}
function parseCFamily(source) {
  const { tokens, pair } = tokenize(source);
  const values = tokens.map(t => t.value);
  const text = (a, b) => values.slice(a, b).join(' ');
  function statement(start, end) {
    let i = start;
    if (values[i] === '{') return [{ kind: 'block', body: block(i + 1, pair.get(i)), offset: tokens[i].offset }, pair.get(i) + 1];
    if (values[i] === 'for' || values[i] === 'while') {
      const kind = values[i++];
      if (values[i] !== '(') throw new Error('Неподдерживаемый заголовок цикла.');
      const close = pair.get(i);
      const [body, next] = statement(close + 1, end);
      return [{ kind, header: text(i + 1, close), body: [body], offset: tokens[start].offset }, next];
    }
    if (values[i] === 'if') {
      if (values[i + 1] !== '(') throw new Error('Неподдерживаемое условие.');
      const close = pair.get(i + 1);
      const [yes, afterYes] = statement(close + 1, end);
      let no, next = afterYes;
      if (values[next] === 'else') [no, next] = statement(next + 1, end);
      return [{ kind: 'if', header: text(i + 2, close), body: [yes, ...(no ? [no] : [])], branches: [[yes], no ? [no] : []], offset: tokens[start].offset }, next];
    }
    if (['do', 'switch', 'try', 'goto'].includes(values[i])) return [{ kind: 'unsupported', text: values[i], offset: tokens[i].offset }, end];
    while (i < end && values[i] !== ';') {
      if (pair.has(i)) i = pair.get(i) + 1; else i++;
    }
    return [{ kind: 'expr', text: text(start, i), offset: tokens[start]?.offset || 0 }, Math.min(i + 1, end)];
  }
  function block(start, end) {
    const out = [];
    for (let i = start; i < end;) {
      const [node, next] = statement(i, end);
      out.push(node); if (next <= i) throw new Error('Не удалось разобрать блок.'); i = next;
    }
    return out;
  }
  const functions = new Map();
  for (let i = 1; i < tokens.length; i++) {
    if (values[i] !== '(' || !/^[A-Za-z_$][\w$]*$/.test(values[i - 1]) || ['if', 'for', 'while', 'switch', 'catch'].includes(values[i - 1])) continue;
    const close = pair.get(i);
    if (values[close + 1] !== '{') continue;
    const end = pair.get(close + 1), name = values[i - 1];
    const params = text(i + 1, close).split(',').filter(Boolean).map(p => ({ name: p.match(/([A-Za-z_$][\w$]*)\s*(?:\[\s*\])?\s*$/)?.[1], text: p }));
    if (functions.has(name)) throw new Error(`Перегрузки функции ${name} требуют ручного анализа.`);
    functions.set(name, { name, params, body: block(close + 2, end), text: text(close + 2, end), offset: tokens[i - 1].offset });
    i = end;
  }
  return functions;
}

function analyzeFunctions(functions, names, source) {
  function analyze(name, bindings = new Map(), stack = []) {
    const fn = functions.get(name.split('::').at(-1));
    if (!fn) return { status: 'unknown', name, reason: 'Не найдено однозначное определение функции в этом файле.', evidence: [], assumptions: [] };
    if (stack.includes(fn.name)) return { status: 'unknown', name, reason: 'Рекурсия: нужна оценка рекуррентного соотношения.', evidence: [], assumptions: [] };
    const env = new Map(bindings), constants = new Set(), evidence = [], issues = new Set(), assumptions = new Set();
    let memory = [scalar()];
    const line = offset => source.slice(0, offset).split('\n').length;
    const note = (node, message) => evidence.push({ line: line(node.offset), text: message });
    fn.params.forEach((p, i) => { if (!env.has(p.name)) env.set(p.name, [factor(i === 0 ? 'n' : p.name || 'm')]); });
    function dependency(expression) {
      const simple = expression.trim();
      let depth = 0;
      for (let i = simple.length - 1; i >= 0; i--) {
        if (simple[i] === ')') depth++;
        if (simple[i] === '(') depth--;
        if (!depth && ['+', '-'].includes(simple[i]) && i > 0 && simple[i - 1] !== '>') return sum(dependency(simple.slice(0, i)), dependency(simple.slice(i + 1)));
      }
      depth = 0;
      if (!/\bnew\b|[<>]/.test(simple)) for (let i = simple.length - 1; i >= 0; i--) {
        if (simple[i] === ')') depth++;
        if (simple[i] === '(') depth--;
        if (!depth && simple[i] === '*') return product(dependency(simple.slice(0, i)), dependency(simple.slice(i + 1)));
        if (!depth && simple[i] === '/') return dependency(simple.slice(0, i));
      }
      if (simple.startsWith('(') && simple.endsWith(')')) return dependency(simple.slice(1, -1));
      const ids = expression.match(/[A-Za-z_$][\w$]*/g) || [];
      const costs = ids.filter(v => env.has(v)).map(v => env.get(v));
      if (costs.length) return sum(...costs);
      if (!ids.length || ids.every(v => ['true', 'false', 'INT64_MAX', 'INT32_MAX', 'size_t'].includes(v))) return [scalar()];
      return [factor(ids.find(v => !['size', 'length', 'begin', 'end', 'std'].includes(v)) || 'n')];
    }
    function expression(text, node, allocationMultiplier = [scalar()]) {
      let time = [scalar()];
      const input = text.match(/\bcin\b[\s\S]*|\binput\s*\([\s\S]*|\breadline\s*\([\s\S]*/);
      if (input && /\bcin\b/.test(text)) for (const m of text.matchAll(/>>\s*([A-Za-z_]\w*)/g)) { env.set(m[1], [factor(m[1])]); constants.delete(m[1]); }
      const assignment = text.match(/(?:^|\s)([A-Za-z_$][\w$]*)\s*=\s*([^=].*)$/);
      if (assignment) {
        const [, variable, value] = assignment;
        if (/^\d+$/.test(value.trim())) { constants.add(variable); env.set(variable, [scalar()]); }
        else { constants.delete(variable); env.set(variable, /\binput\s*\(/.test(value) ? [factor(variable)] : dependency(value)); }
      }
      const growing = text.match(/\b([A-Za-z_$][\w$]*)\s*=\s*\[\s*\]/);
      if (growing && new RegExp(`\\b${growing[1]}\\s*\\.\\s*(?:push|append)\\s*\\(`).test(fn.text)) env.set(growing[1], [factor('n')]);
      const cppContainer = text.match(/\b(?:vector|unordered_set|set)\s*<[^>]+>\s*([A-Za-z_]\w*)/);
      if (cppContainer) env.set(cppContainer[1], [factor('n')]);
      const braceConstant = text.match(/\b([A-Za-z_]\w*)\s*\{\s*(\d*)\s*\}\s*$/);
      if (braceConstant) { constants.add(braceConstant[1]); env.set(braceConstant[1], [scalar()]); }
      const arrays = [...text.matchAll(/\bnew\s+[\w:<>]+\s*(?:\*\s*)*\[([^\]]+)\]/g)];
      for (const local of text.matchAll(/\b(?:int|long|double|float|char|bool|i32|i64|\w+_t)\s+\w+\s*\[([^\]]+)\]/g)) memory = sum(memory, dependency(local[1]));
      for (const m of arrays) {
        const size = dependency(m[1]); memory = sum(memory, product(size, allocationMultiplier));
        note(node, `Выделение массива: ${label(product(size, allocationMultiplier))} памяти.`);
        if (/\}\s*$/.test(text) || /\]\s*\{/.test(text)) time = sum(time, size);
      }
      const dynamicContainer = text.match(/\b(?:vector|list|set|Set|Map|dict)\b/);
      if (dynamicContainer && !/\b(?:size|push_back|insert)\s*\(/.test(text)) {
        const size = /\bnew\s+(?:Set|Map)\b/.test(text) ? dependency(text) : [factor('n')];
        memory = sum(memory, size);
        if (/\bnew\s+(?:Set|Map)\b/.test(text)) { time = sum(time, size); assumptions.add('Операции хеш-таблиц оцениваются в среднем.'); }
      }
      if (/\b(?:push_back|push|append|insert|add)\s*\(/.test(text)) memory = sum(memory, allocationMultiplier);
      // Local function calls are followed into their definitions.
      for (const m of text.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
        const call = m[1];
        if (['if', 'for', 'while', 'sizeof', 'alignof', 'decltype', 'static_cast', 'int', 'float', 'double', 'bool', 'len', 'range'].includes(call)) continue;
        const position = m.index + m[0].length;
        let depth = 1, end = position;
        for (; end < text.length && depth; end++) { if (text[end] === '(') depth++; if (text[end] === ')') depth--; }
        const args = text.slice(position, end - 1).split(',').map(s => s.trim());
        if (functions.has(call)) {
          const bindings = new Map();
          functions.get(call).params.forEach((p, i) => bindings.set(p.name, dependency(args[i] || '0')));
          const child = analyze(call, bindings, [...stack, fn.name]);
          if (child.status === 'unknown') issues.add(`${call}: ${child.reason}`);
          else { time = sum(time, child.timeCost); memory = sum(memory, child.memoryCost); }
          child.assumptions.forEach(x => assumptions.add(x));
          note(node, `Вызов ${call}: ${child.time || 'сложность не определена'}.`);
          evidence.push(...child.evidence);
        } else if (['sort', 'stable_sort'].includes(call)) {
          const cost = dependency(args[0] || 'n'); time = sum(time, product(cost, logarithm(cost)));
          note(node, `${call}: ${label(product(cost, logarithm(cost)))}.`);
        } else if (['lower_bound', 'upper_bound', 'binary_search'].includes(call)) {
          const cost = logarithm(dependency(args[0] || 'n')); time = sum(time, cost.length ? cost : [scalar()]);
          note(node, `Библиотечный бинарный поиск: ${label(cost.length ? cost : [scalar()])}.`);
        } else if (['find', 'includes', 'indexOf', 'count', 'sum', 'slice', 'copy'].includes(call)) {
          const owner = text.slice(0, m.index).match(/([A-Za-z_]\w*)\s*\.\s*$/)?.[1];
          const cost = dependency(owner || args[0] || 'n'); time = sum(time, cost); note(node, `Линейный проход ${call}: ${label(cost)}.`);
        } else if (call === 'fromkeys' || call === 'list' && !/\bdict\s*\.\s*fromkeys/.test(text)) {
          const cost = dependency(args[0] || 'n'); time = sum(time, cost); memory = sum(memory, cost);
          if (call === 'fromkeys') assumptions.add('Операции хеш-таблиц оцениваются в среднем.');
        } else if (['insert', 'has', 'add'].includes(call)) {
          assumptions.add('Для хеш-таблиц используется средняя стоимость операций O(1); при коллизиях худший случай может быть выше.');
        } else if (!['max', 'min', 'swap', 'move', 'begin', 'end', 'size', 'empty', 'length', 'push_back', 'pop_back', 'push', 'pop', 'append', 'reserve', 'resize', 'tie', 'sync_with_stdio', 'setprecision', 'print', 'input', 'log', 'log2', 'sqrt', 'Set', 'Map', 'list', 'dict', 'vector', 'result', 'seen'].includes(call)) {
          // Constructors of scalar variables are not treated as unknown functions.
          if (!/^(?:[\w:<>]+\s+)+$/.test(text.slice(0, m.index).trim() + ' ')) issues.add(`Нет оценки вызываемой функции ${call}.`);
        }
      }
      if (/\b(?:\.\.\.|eval|exec|function|lambda)\b/.test(text)) issues.add('Неподдерживаемая динамическая конструкция.');
      return time;
    }
    const flattenText = nodes => nodes.map(n => (n.text || n.header || '') + ' ' + flattenText(n.body || [])).join(' ');
    function sequence(nodes, allocationMultiplier = [scalar()]) {
      let time = [scalar()];
      for (const node of nodes) {
        if (node.kind === 'expr') time = sum(time, expression(node.text, node, allocationMultiplier));
        else if (node.kind === 'unsupported') issues.add(`Конструкция ${node.text} требует ручного анализа.`);
        else if (node.kind === 'block') time = sum(time, sequence(node.body, allocationMultiplier));
        else if (node.kind === 'if') {
          time = sum(time, expression(node.header, node, allocationMultiplier));
          const before = new Map(env), beforeConstants = new Set(constants), states = [], constStates = [];
          for (const branch of node.branches || [node.body]) {
            env.clear(); for (const [key, value] of before) env.set(key, value);
            constants.clear(); for (const name of beforeConstants) constants.add(name);
            time = sum(time, sequence(branch, allocationMultiplier));
            states.push(new Map(env)); constStates.push(new Set(constants));
          }
          env.clear();
          for (const key of new Set(states.flatMap(state => [...state.keys()]))) env.set(key, sum(...states.map(state => state.get(key) || [scalar()])));
          constants.clear();
          for (const key of constStates[0]) if (constStates.every(state => state.has(key))) constants.add(key);
        }
        else if (node.kind === 'for' || node.kind === 'while') {
          let iterations;
          const header = node.header, bodyText = flattenText(node.body);
          if (node.kind === 'for') {
            const parts = header.split(';');
            if (parts.length === 3) {
              const condition = parts[1].match(/(?:([A-Za-z_]\w*)\s*(?:<|<=|>|>=)\s*(.+))$/);
              const reverse = /(?:--|-=)/.test(parts[2]);
              const bound = condition ? dependency(reverse ? parts[0].split('=').at(-1) : condition[2]) : null;
              if (condition && /(?:\+\+|--|\+=\s*[1-9]\d*|-=\s*[1-9]\d*)\s*/.test(parts[2])) iterations = bound;
              else if (condition && /(?:\*=|\/=)\s*(?:[2-9]|[1-9]\d+)\b|(?:>>=|<<=)\s*[1-9]\d*/.test(parts[2])) iterations = logarithm(bound);
              if (condition && iterations) env.set(condition[1], bound);
              if (condition) {
                const changed = parts[2].match(/[A-Za-z_]\w*/)?.[0];
                if (changed !== condition[1]) iterations = null;
                const ascending = /(?:<|<=)/.test(parts[1]);
                if (ascending && /(?:--|-=|\/=|>>=)/.test(parts[2]) || !ascending && /(?:\+\+|\+=|\*=|<<=)/.test(parts[2])) iterations = null;
              }
              if (condition && !/^[A-Za-z_]\w*\s*(?:\+\+|--|\+=|-=|\*=|\/=|>>=|<<=)|^(?:\+\+|--)\s*[A-Za-z_]\w*/.test(parts[2].trim())) iterations = null;
              if (condition) {
                const changing = (condition[2].match(/[A-Za-z_]\w*/g) || []).some(v => new RegExp(`\\b${v}\\s*(?:\\+\\+|--|[+*/-]?=(?!=))`).test(bodyText));
                if (changing) iterations = null;
              }
            } else {
              const range = header.match(/(?:\bof\b|:(?!:))\s*(.+)$/);
              if (range) iterations = dependency(range[1]);
            }
          } else {
            const constantLoop = header.match(/^([A-Za-z_]\w*)\s*--$/);
            const halves = header.match(/^([A-Za-z_]\w*)\s*(?:>|>=)\s*\d+$/);
            const midpoint = bodyText.match(/\b([A-Za-z_]\w*)\s*=\s*\(\s*([A-Za-z_]\w*)\s*\+\s*([A-Za-z_]\w*)\s*\)\s*\/\s*2/);
            if (constantLoop && constants.has(constantLoop[1])) iterations = [scalar()];
            else if (halves && new RegExp(`\\b${halves[1]}\\s*(?:/=\\s*2|>>=\\s*[1-9]\\d*)\\b`).test(bodyText)) iterations = logarithm(dependency(halves[1]));
            else if (midpoint) {
              const [, middle, left, right] = midpoint;
              const updateLeft = new RegExp(`\\b${left}\\s*=\\s*${middle}\\b`).test(bodyText);
              const updateRight = new RegExp(`\\b${right}\\s*=\\s*${middle}\\b`).test(bodyText);
              const gap = new RegExp(`\\b${left}\\s*\\+\\s*1\\s*<\\s*${right}\\b`).test(header);
              const advances = new RegExp(`\\b${left}\\s*=\\s*${middle}\\s*\\+\\s*1\\b`).test(bodyText);
              if (header.includes(left) && header.includes(right) && updateLeft && updateRight && (gap || advances)) {
                const bound = sum(dependency(left), dependency(right)); iterations = logarithm(bound);
                assumptions.add(`В ${fn.name} границы бинарного поиска должны корректно сужаться на каждой итерации.`);
              }
            }
          }
          if (!iterations || !iterations.length) { issues.add(`Не определено число повторений ${node.kind} (${header}).`); sequence(node.body, allocationMultiplier); }
          else {
            note(node, `Цикл ${node.kind}: ${label(iterations)} повторений.`);
            time = sum(time, product(iterations, sequence(node.body, product(allocationMultiplier, iterations))));
          }
        }
      }
      return time;
    }
    const timeCost = sequence(fn.body);
    if (/\b(?:malloc|calloc|realloc|alloca)\b/.test(fn.text)) issues.add('Ручное выделение памяти требует дополнительного разбора.');
    if (/\[\s*\]|\b(?:vector|list|Set|Map|set|dict)\b/.test(fn.params.map(p => p.text).join(' '))) assumptions.add('n — количество элементов входного контейнера.');
    return { name, status: issues.size ? 'unknown' : 'estimated', time: issues.size ? null : label(timeCost),
      memory: issues.size ? null : label(memory), timeCost, memoryCost: memory,
      reason: issues.size ? [...issues].join(' ') : 'Оценка по циклам, выделению памяти и вызовам функций в исходнике.',
      evidence, assumptions: [...new Set([...assumptions, 'Скалярные операции считаются O(1); оценка применима к распознанным конструкциям.'])] };
  }
  return Object.fromEntries(names.map(name => [name, analyze(name)]));
}
function analyzeSource(source, { language = 'cpp', functions = [] } = {}) {
  try {
    if (language === 'python') throw new Error('Для Python автоматический разбор пока не поддержан; требуется ручная оценка.');
    const parsed = parseCFamily(source);
    return analyzeFunctions(parsed, functions, source);
  } catch (error) {
    return Object.fromEntries(functions.map(name => [name, { name, status: 'unknown', reason: error.message, time: null, memory: null, evidence: [], assumptions: [] }]));
  }
}
async function analyzeFile(source, config, { pythonPath = process.platform === 'win32' ? 'python' : 'python3' } = {}) {
  if (source.length > 1000000) return Object.fromEntries(config.functions.map(name => [name, { name, status: 'unknown', time: null, memory: null, reason: 'Исходник больше 1 МБ: требуется ручной анализ.', evidence: [], assumptions: [] }]));
  if (config.language !== 'python') return analyzeSource(source, config);
  try {
    const { runProcess } = require('./process');
    const path = require('node:path');
    let output = '';
    await runProcess(pythonPath, [path.join(__dirname, 'workers/source_ast.py')], {
      input: JSON.stringify({ source }), timeoutMs: 5000, onStdout: chunk => {
        output += chunk;
        if (output.length > 4000000) throw new Error('Исходник слишком большой для автоматического анализа.');
      }, env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });
    const parsed = JSON.parse(output);
    if (parsed.error) throw new Error(parsed.error);
    return analyzeFunctions(new Map(parsed.map(fn => [fn.name, fn])), config.functions, source);
  } catch (error) {
    return Object.fromEntries(config.functions.map(name => [name, { name, status: 'unknown', time: null, memory: null, reason: error.message, evidence: [], assumptions: [] }]));
  }
}
module.exports = { analyzeSource, analyzeFile, parseCFamily, analyzeFunctions, label };
