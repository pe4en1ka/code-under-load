'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { analyzeSource, analyzeFile } = require('../src/complexity');
const { renderReport, renderSourceReport } = require('../src/report');
const math = require('../media/functions');
const cpp = source => analyzeSource(source, { language: 'cpp', functions: ['f'] }).f;

test('static analysis composes sequential/nested loops without measuring execution', () => {
  assert.equal(cpp('int f(int n){return n+1;}').time, 'O(1)');
  assert.equal(cpp('void f(int n){for(int i=0;i<n;i++){} for(int j=0;j<n;j++){} }').time, 'O(n)');
  assert.equal(cpp('void f(int n){for(int i=0;i<n;i++){for(int j=0;j<i;j++){}}}').time, 'O(n^2)');
  assert.equal(cpp('void f(int n){for(int i=0;i<n*n;i++){}}').time, 'O(n^2)');
  assert.equal(cpp('void f(int n,int m){for(int i=0;i<n;i++){for(int j=0;j<m;j++){}}}').time, 'O(m · n)');
});
test('static analysis recognizes logarithmic increments, sorting and binary search calls', () => {
  assert.equal(cpp('void f(int n){for(int i=1;i<n;i*=2){}}').time, 'O(log n)');
  assert.equal(cpp('void f(int n){for(int i=0;i<n;i++){for(int j=1;j<n;j*=2){}}}').time, 'O(n · log n)');
  assert.equal(cpp('void f(vector<int>& values){std::sort(values.begin(),values.end());}').time, 'O(n · log n)');
  const lis = `int search(int* a,int l,int r,int x){while(l+1<r){int m=(l+r)/2;if(x>a[m])l=m;else r=m;}return r;}
  void f(){int n{};std::cin>>n;int* a=new int[n+1]{};for(int i=0;i<n;i++){int x;std::cin>>x;int p=search(a,0,i,x);a[p]=x;}delete[] a;}`;
  const result = cpp(lis);
  assert.equal(result.time, 'O(n · log n)'); assert.equal(result.memory, 'O(n)');
  assert.ok(result.evidence.some(e => e.text.includes('Вызов search')));
});
test('static analysis refuses unsupported recursion, unknown calls and nonprogressing loops', () => {
  for (const source of ['int f(int n){return f(n-1);}', 'void f(int n){mystery(n);}',
    'void f(int n){while(n>1){n/=1;}}', 'void f(int n){for(int i=0;i<n;i+=0){}}',
    'void f(int n){for(int i=0;i<n;i*=1){}}', 'void f(int n){for(int i=0;i<n;i++){n++;}}',
    'void f(int n){for(int i=0;i<n;j++){}}', 'void f(int n){for(int i=0;i<n;i--){}}',
    'void f(int n){while(n){}}', 'void f(int n){do{}while(n);}']) {
    assert.equal(cpp(source).status, 'unknown', source);
  }
});
test('branch analysis preserves a possible input-dependent bound', () => {
  const result = cpp('void f(int n){if(n>10){n=1;}for(int i=0;i<n;i++){}}');
  assert.equal(result.time, 'O(n)');
});
test('static analysis accounts for input dimensions and arrays', () => {
  assert.equal(cpp('void f(int n){int* p=new int[n];delete[] p;}').memory, 'O(n)');
  assert.equal(cpp('void f(int n){int a[n];}').memory, 'O(n)');
  const result = cpp('void f(){int n,w;cin>>n>>w;int**p=new int*[w];for(int i=0;i<w;i++)p[i]=new int[n];}');
  assert.equal(result.memory, 'O(n · w)');
});
for (const [language, file, functions] of [
  ['javascript', 'algorithms.cjs', ['uniqueSlow', 'uniqueFast']],
  ['cpp', 'algorithms.cpp', ['unique_slow', 'unique_fast']],
  ['python', 'algorithms.py', ['unique_slow', 'unique_fast']]
]) test(`static analysis of slow/fast examples: ${language}`, async () => {
  const source = fs.readFileSync(path.join(__dirname, '../examples', file), 'utf8');
  const result = await analyzeFile(source, { language, functions });
  assert.equal(result[functions[0]].time, 'O(n^2)');
  assert.equal(result[functions[1]].time, 'O(n)');
  assert.equal(result[functions[1]].memory, 'O(n)');
});
test('function plots use raw f(n), including constant, logs, exponentials and factorial', () => {
  const value = (id, n) => math.models.find(m => m.id === id).value(n);
  assert.equal(math.models.length, 16);
  assert.equal(value('constant', 10), 1); assert.equal(value('linear', 10), 10);
  assert.equal(value('log', 8), 3); assert.equal(value('sqrt', 9), 3);
  assert.equal(value('square', 10), 100); assert.equal(value('cube', 10), 1000);
  assert.equal(value('exp2', 10), 1024); assert.equal(value('exp3', 3), 27);
  assert.equal(value('factorial', 10), 3628800); assert.equal(value('nPowerN', 10), 1e10);
  for(const id of math.models.map(m => m.id)) for(const log of [false,true]) {
    const html=math.plot(100,[id],log); assert.ok(!/NaN|Infinity/.test(html),id);
  }
  assert.match(math.plot(10,[]),/Выберите/);
  for(const n of [0,1,101,NaN,2.5]) assert.throws(()=>math.plot(n));
});
test('reports retain timing chart, show source analysis and contain no fitting UI', () => {
  const name = '<img src=x>';
  const analysis = { [name]: { status:'estimated',time:'O(n)',memory:'O(1)',reason:'Цикл',evidence:[{line:1,text:'<script>'}],assumptions:[] } };
  const report = renderReport({config:{functions:[name],sizes:[10],repetitions:3,warmup:0},
    complexity:analysis,points:[{name,size:10,medianMs:1,minMs:1,p95Ms:1,maxMs:1}]});
  assert.ok(report.includes('Время выполнения')); assert.ok(report.includes('Асимптотическая оценка по исходнику'));
  assert.ok(report.includes('Графики функций f(n)')); assert.ok(report.includes('function-max-n'));
  assert.ok(!report.includes('<img')); assert.ok(!report.includes('<script>'));
  assert.ok(!/подгонк|Ошибка подгонки|кратност|относительного роста|data-model-series/i.test(report));
  const standalone = renderSourceReport(analysis);
  assert.ok(standalone.includes('без запуска программы'));assert.ok(standalone.includes('O(n)'));
});
test('function controls redraw only mathematical plots and retain the time scale control', () => {
  const vm = require('node:vm');
  const elements = Object.fromEntries(['log-scale','linear-chart','log-chart','function-max-n','function-log-y','function-chart','function-error'].map(id => [id,{ addEventListener(type,fn){this[type]=fn;} }]));
  elements['function-max-n'].value='10';elements['function-log-y'].checked=false;
  const inputs=[{dataset:{functionId:'square'},checked:true,addEventListener(type,fn){this[type]=fn;}}];
  const document={getElementById:id=>elements[id],querySelectorAll:selector=>selector==='[data-function-id]'?inputs:[]};
  const context={document};vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../media/functions.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../media/report.js'),'utf8'),context);
  inputs[0].change();assert.ok(elements['function-chart'].innerHTML.includes('n²'));
  inputs[0].checked=false;inputs[0].change();assert.match(elements['function-chart'].innerHTML,/Выберите/);
  elements['function-max-n'].value='101';elements['function-max-n'].input();assert.ok(elements['function-error'].textContent);
  elements['log-scale'].change({target:{checked:true}});assert.equal(elements['linear-chart'].hidden,true);assert.equal(elements['log-chart'].hidden,false);
});

test('standalone analysis command reads the editor and never starts benchmark execution', async () => {
  const vm=require('node:vm'), {createRequire}=require('node:module');
  const filename=path.join(__dirname,'../src/extension.js'), localRequire=createRequire(filename);
  const commands=new Map(), errors=[];let html='';
  const uri={scheme:'file',fsPath:'/not-executed.cpp'};
  const vscode={
    Uri:{joinPath:(base,...parts)=>({fsPath:path.join(base.fsPath,...parts)})},ViewColumn:{Beside:2},
    commands:{registerCommand:(name,fn)=>{commands.set(name,fn);return {dispose(){}};}},
    workspace:{getConfiguration:()=>({get:(key,fallback)=>fallback})},
    window:{activeTextEditor:{selection:{},document:{uri,getText:selection=>selection?'':'int main(){int n;cin>>n;for(int i=0;i<n;i++){}}'}},
      showErrorMessage:message=>errors.push(message),
      createWebviewPanel:()=>({webview:{asWebviewUri:value=>({toString:()=>value.fsPath}),cspSource:'test',set html(value){html=value;}}})}
  };
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module,process,require:name=>name==='vscode'?vscode:name==='./runner'?{runBenchmark:()=>{throw new Error('Must not execute user program');}}:localRequire(name)});
  module.exports.activate({subscriptions:[],extensionUri:{fsPath:path.dirname(path.dirname(filename))}});
  await commands.get('codeUnderLoad.analyze')();
  assert.deepEqual(errors,[]);assert.ok(html.includes('O(n)'));assert.ok(html.includes('без запуска программы'));
});
