'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {createRequire}=require('node:module');

test('VS Code main flow asks for input files and sizes instead of a function name', async()=>{
  const filename=path.resolve(__dirname,'../src/extension.js');
  const localRequire=createRequire(filename);
  const uri=file=>({scheme:'file',fsPath:file,toString:()=>`file://${file}`});
  const source=uri(path.resolve(__dirname,'../examples/program_sum.cpp'));
  let command, received, html;const errors=[], inputs=[];
  const document={uri:source,isDirty:false,getText:()=>{throw new Error('Function selection must not be read');}};
  const webview={asWebviewUri:value=>value,cspSource:'test',onDidReceiveMessage:()=>({dispose(){}}),set html(value){html=value;}};
  const vscode={
    Uri:{joinPath:(base,...parts)=>uri(path.join(base.fsPath,...parts))},
    ProgressLocation:{Notification:1},ViewColumn:{Beside:2},
    commands:{registerCommand:(_id,callback)=>{command=callback;return {dispose(){}};}},
    workspace:{isTrusted:true,textDocuments:[document],getConfiguration:()=>({get:(_key,fallback)=>fallback})},
    window:{activeTextEditor:{document,selection:{}},
      showQuickPick:async items=>items.find(item=>item.mode==='program'),
      showOpenDialog:async options=>{assert.equal(options.canSelectMany,true);return ['input-100.in','input-10.in'].map(file=>uri(path.resolve(__dirname,file)));},
      showInputBox:async options=>{inputs.push(options);return '10, 100';},
      withProgress:async(_options,callback)=>callback({report(){}},{onCancellationRequested:()=>({dispose(){}}),isCancellationRequested:false}),
      createWebviewPanel:()=>({webview,onDidDispose(){},dispose(){}}),
      showErrorMessage:message=>errors.push(message),showInformationMessage:message=>errors.push(message),showWarningMessage:message=>errors.push(message)
    }
  };
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module,Buffer,AbortController,process,
    require:name=>name==='vscode'?vscode:name==='./runner'?{runBenchmark:async config=>{
      received=config;
      return {config,points:config.sizes.map(size=>({name:'main',size,medianMs:1,minMs:1,p95Ms:1,maxMs:1,inputFile:`input-${size}.in`,stdoutPreview:'ok'})),runtime:'C++',platform:'test',createdAt:'now'};
    }}:localRequire(name)}, {filename});
  module.exports.activate({subscriptions:[],extensionUri:uri(path.dirname(path.dirname(filename))),workspaceState:{get:()=>({}),update:async()=>{}}});
  await command();
  assert.deepEqual(errors,[]);assert.equal(inputs.length,1);
  assert.match(inputs[0].title,/Размеры задач/);assert.equal(inputs[0].value,'10, 100');
  assert.equal(received.mode,'program');assert.deepEqual(received.functions,['main']);
  assert.match(received.inputFiles[0],/input-10.in$/);assert.match(html,/Программа целиком через main/);
});
