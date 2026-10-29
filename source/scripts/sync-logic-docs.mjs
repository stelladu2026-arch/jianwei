import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

// Parse source text only. Never import application modules, env files or project data.
const require=createRequire(import.meta.url);
const ts=process.env.JIANWEI_DOCS_TYPESCRIPT_ROOT
  ? require(path.join(process.env.JIANWEI_DOCS_TYPESCRIPT_ROOT,'typescript'))
  : require('typescript');
const defaultRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const outDir='docs/logic';
const reviewedPaths=[
  'source/lib/research/workflow.ts',
  'source/app/api/projects/[id]/workflow/route.ts',
  'source/lib/research/execution.ts',
  'source/lib/research/collaboration.ts',
  'source/lib/research/agent-loop.ts',
  'source/lib/research/harness/runner.ts',
  'source/lib/research/harness/recovery.ts',
  'source/lib/research/harness/background.ts',
  'source/lib/research/collection.ts',
  'source/lib/research/configured-sources.ts',
  'source/lib/research/evidence-eligibility.ts',
  'source/lib/research/source-fit.ts',
];
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
const slash=s=>s.split(path.sep).join('/');
const inline=s=>'`'+String(s).replaceAll('`','′').replaceAll('|','&#124;').replace(/\s+/g,' ').trim()+'`';
const cell=s=>String(s).replaceAll('|','&#124;').replace(/\s+/g,' ').trim();
const quote=s=>'"'+String(s).replaceAll('"','#quot;').replaceAll('\n',' ').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('|','&#124;')+'"';
const table=(heads,rows)=>'| '+heads.join(' | ')+' |\n| '+heads.map(()=>'---').join(' | ')+' |\n'+rows.map(r=>'| '+r.map(cell).join(' | ')+' |').join('\n')+'\n';
function walk(n,fn){fn(n);ts.forEachChild(n,c=>walk(c,fn));}
function unwrap(n){while(n&&(ts.isAsExpression(n)||ts.isSatisfiesExpression(n)||ts.isParenthesizedExpression(n)||ts.isNonNullExpression(n)))n=n.expression;return n;}
function prop(n,key){n=unwrap(n);if(!n||!ts.isObjectLiteralExpression(n))return;return n.properties.find(p=>p.name&&(ts.isIdentifier(p.name)||ts.isStringLiteral(p.name))&&p.name.text===key)?.initializer;}
function variable(sf,name){let found;walk(sf,n=>{if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&n.name.text===name)found=n.initializer;});if(!found)throw Error('Missing declaration: '+name);return unwrap(found);}
function namedFunction(sf,name){let fn;walk(sf,n=>{if(ts.isFunctionDeclaration(n)&&n.name?.text===name)fn=n;});if(!fn)throw Error('Missing function: '+name);return fn;}
function literal(n){n=unwrap(n);if(n&&ts.isStringLiteralLike(n))return n.text;if(n&&ts.isNumericLiteral(n))return Number(n.text);if(n?.kind===ts.SyntaxKind.NullKeyword)return null;throw Error('Expected literal: '+n?.getText());}
function strings(n){n=unwrap(n);if(!n||!ts.isArrayLiteralExpression(n))throw Error('Expected string array');return n.elements.map(literal);}
function arrays(n,conditions=[]){n=unwrap(n);if(ts.isArrayLiteralExpression(n))return [{conditions,values:n.elements}];if(ts.isConditionalExpression(n))return [...arrays(n.whenTrue,[...conditions,n.condition.getText()]),...arrays(n.whenFalse,[...conditions,'否：'+n.condition.getText()])];throw Error('Unsupported conditional array: '+n.getText());}
function functionName(n){for(let p=n.parent;p;p=p.parent)if(ts.isFunctionDeclaration(p))return p.name?.text||'anonymous';return 'module';}
function conditions(n){const result=[];let child=n;for(let p=n.parent;p;child=p,p=p.parent){if(ts.isIfStatement(p)&&p.expression!==child)result.unshift((p.elseStatement===child?'否：':'')+p.expression.getText());if(ts.isConditionalExpression(p)&&p.condition!==child)result.unshift((p.whenFalse===child?'否：':'')+p.condition.getText());}return result;}
function inputFiles(root){const files=[];const visit=dir=>{if(!fs.existsSync(dir))return;for(const e of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en'))){const p=path.join(dir,e.name);if(e.isDirectory())visit(p);else if(e.isFile()&&/\.(?:ts|tsx|mts|mjs)$/.test(e.name))files.push(slash(path.relative(root,p)));}};for(const p of ['source/app','source/components','source/lib','source/db'])visit(path.join(root,p));return files.sort();}

export function buildArtifacts(root=defaultRoot){
  root=path.resolve(root);
  const paths=inputFiles(root);if(!paths.length)throw Error('No application source files');
  const sources=new Map(paths.map(p=>{const text=fs.readFileSync(path.join(root,p),'utf8'),sf=ts.createSourceFile(p,text,ts.ScriptTarget.Latest,true,p.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);if(sf.parseDiagnostics.length)throw Error('Source syntax is not parseable: '+p);return [p,{text,sf,hash:digest(text)}];}));
  const file=p=>{const v=sources.get(p);if(!v)throw Error('Required source missing: '+p);return v;};
  const link=(p,n)=>`[${p.replace(/^source\//,'')}${n?':'+(file(p).sf.getLineAndCharacterOfPosition(n.getStart()).line+1):''}](../../${p}${n?'#L'+(file(p).sf.getLineAndCharacterOfPosition(n.getStart()).line+1):''})`;
  const print=n=>n.getText().replace(/\s+/g,' ').trim();
  const wf='source/lib/research/workflow.ts',route='source/app/api/projects/[id]/workflow/route.ts',ex='source/lib/research/execution.ts',ag='source/lib/research/agent-loop.ts';
  const stageObject=variable(file(wf).sf,'workflowStages');if(!ts.isObjectLiteralExpression(stageObject))throw Error('workflowStages must remain an object');
  const stages=Object.fromEntries(stageObject.properties.map(p=>[p.name.text,literal(p.initializer)]));
  const modeArrays=arrays(variable(file(wf).sf,'keys')).map(x=>({...x,values:x.values.map(literal)}));
  for(const mode of modeArrays)for(const key of mode.values)if(!(key in stages))throw Error('Unknown stage: '+key);
  const modelStages=strings(variable(file(route).sf,'modelStages').arguments?.[0]);
  const sourceStages=strings(variable(file(route).sf,'sourceStages').arguments?.[0]);
  const tools=strings(variable(file(ag).sf,'AGENT_TOOLS'));
  const reviewFile=path.join(root,outDir,'review.json');
  const ledger=fs.existsSync(reviewFile)?JSON.parse(fs.readFileSync(reviewFile,'utf8')):{};
  const archifyPath=path.join(root,outDir,'archify/candidate.json');
  const archifyText=fs.existsSync(archifyPath)?fs.readFileSync(archifyPath,'utf8'):null;
  const archifyCandidate=archifyText?JSON.parse(archifyText):null;
  const archifyPaths=archifyCandidate?.components?.flatMap(c=>(c.sources||[]).map(s=>s.path))||[];
  const reviewScope=[...new Set([...reviewedPaths,...archifyPaths])].sort();
  const expectedReview=Object.fromEntries(reviewScope.map(p=>[p,file(p).hash]));
  const expectedArchifyHash=archifyText?digest(archifyText):null;
  const pending=reviewScope.filter(p=>ledger.sources?.[p]!==expectedReview[p]);
  if(expectedArchifyHash&&ledger.archify_candidate_sha256!==expectedArchifyHash)pending.push('Archify 架构定义待复核');
  if(!ledger.summary||!ledger.reviewer||ledger.schema!==1)pending.push('人工复核记录缺失或格式错误');
  const watched=Object.fromEntries([...sources].map(([p,v])=>[p,v.hash]));
  const script=path.join(root,'source/scripts/sync-logic-docs.mjs');
  const fingerprint=digest(JSON.stringify({watched,generator:digest(fs.readFileSync(script)),typescript:ts.version,archify:expectedArchifyHash}));
  const header=title=>`# ${title}\n\n<!-- Generated by source/scripts/sync-logic-docs.mjs. Do not edit by hand. -->\n\n代码与生成器指纹：\`${fingerprint}\`。不使用生成时间，以保证重复运行结果一致。\n\n人工语义图状态：**${pending.length?'待复核，不能视为与当前代码一致':'已按当前受监控核心文件复核'}**。详见[说明与更新规则](README.md)。\n\n`;
  let workflow=header('研究流程与转移清单');
  workflow+='## 界面阶段序列\n\n以下箭头从 `stagesFor` 的实际阶段数组生成，表示界面展示顺序。可选步骤可能被跳过；它不是完整运行时状态机。具体分支见下方转移清单。\n\n';
  modeArrays.forEach((m,i)=>{workflow+=`### 路径 ${i+1}\n\n选择条件：${m.conditions.length?m.conditions.map(inline).join('；'):'默认'}。源码：${link(wf,variable(file(wf).sf,'keys'))}。\n\n\`\`\`mermaid\nflowchart TD\n`;m.values.forEach((s,j)=>{workflow+=`  p${i}_${j}[${quote(stages[s])}]\n`;if(j)workflow+=`  p${i}_${j-1} --> p${i}_${j}\n`;});workflow+='\`\`\`\n\n';});
  workflow+='## 阶段类型\n\n'+table(['阶段','类型','源码'],Object.entries(stages).map(([key,label])=>[label+' '+inline(key),modelStages.includes(key)?'模型阶段':sourceStages.includes(key)?'来源阶段':'本地阶段',link(wf,stageObject)]));
  const assignments=[];
  for(const p of [wf,route])walk(file(p).sf,n=>{if(!ts.isBinaryExpression(n)||n.operatorToken.kind!==ts.SyntaxKind.EqualsToken)return;const lhs=unwrap(n.left);if(!ts.isPropertyAccessExpression(lhs)||!['stage','status'].includes(lhs.name.text)||!['w','cw','p','current'].includes(lhs.expression.getText()))return;assignments.push({field:lhs.getText(),value:print(n.right),condition:conditions(n).join(' && ')||'函数内无外层 if 条件',fn:functionName(n),source:link(p,n)});});
  workflow+='## 阶段与状态赋值\n\n按 TypeScript 语法树枚举工作流模块及工作流 API 中的直接赋值，保留代码条件与动态表达式。这里的“否”是对应 if / 三元条件的另一分支；早退、循环与被调用函数内部的条件仍需结合源码阅读，不声称是完整路径约束。\n\n'+table(['函数','字段','新值 / 表达式','外层条件','源码'],assignments.map(a=>[inline(a.fn),inline(a.field),inline(a.value),inline(a.condition),a.source]));
  const construction=namedFunction(file(wf).sf,'makeWorkflow');let initial;walk(construction,n=>{if(ts.isPropertyAssignment(n)&&n.name.getText()==='stage')initial=n.initializer;});
  if(!initial)throw Error('Initial workflow stage missing');
  workflow+='\n初始阶段表达式：'+inline(print(initial))+'。源码：'+link(wf,initial)+'。\n';

  const specArrays=arrays(variable(file(ex).sf,'specs'));let execution=header('角色依赖、工具与恢复边界');
  execution+='## 执行任务依赖\n\n以下依赖直接取自 `makeRun` 的任务声明及 `specs.push`。依赖没有先后关系的节点不代表实际并行执行；当前 `nextTask` 按待执行列表选取任务。\n\n';
  let push;walk(namedFunction(file(ex).sf,'makeRun'),n=>{if(ts.isCallExpression(n)&&n.expression.getText()==='specs.push')push=n;});if(!push)throw Error('Task append declaration missing');
  specArrays.forEach((branch,i)=>{const rows=branch.values.map(n=>({id:literal(prop(n,'id')),label:literal(prop(n,'label')),deps:strings(prop(n,'deps'))}));const original=rows.map(x=>x.id);for(const n of push.arguments){const d=prop(n,'deps');rows.push({id:literal(prop(n,'id')),label:literal(prop(n,'label')),deps:ts.isArrayLiteralExpression(unwrap(d))?strings(d):print(d)==='specs.map(t=>t.id)'||print(d)==='specs.map(t => t.id)'?original:(()=>{throw Error('Unsupported task dependencies: '+print(d));})()});}
    const ids=new Set(rows.map(x=>x.id));if(ids.size!==rows.length||rows.some(r=>r.deps.some(d=>!ids.has(d))))throw Error('Invalid task dependencies');
    execution+=`### 任务方案 ${i+1}\n\n条件：${branch.conditions.map(inline).join('；')}。源码：${link(ex,variable(file(ex).sf,'specs'))}。\n\n\`\`\`mermaid\nflowchart TD\n`;
    rows.forEach((r,j)=>execution+=`  t${i}_${j}[${quote(r.label)}]\n`);rows.forEach((r,j)=>r.deps.forEach(d=>execution+=`  t${i}_${rows.findIndex(x=>x.id===d)} --> t${i}_${j}\n`));execution+='\`\`\`\n\n';
  });
  execution+='## 工具白名单\n\n'+table(['工具标识','来源'],tools.map(t=>[inline(t),link(ag,variable(file(ag).sf,'AGENT_TOOLS'))]));
  const recovery='source/lib/research/harness/recovery.ts',guards=[];walk(namedFunction(file(recovery).sf,'stageRecovery'),n=>{if(ts.isCallExpression(n)&&n.expression.getText()==='no'&&n.arguments.length)guards.push([inline(conditions(n).join(' && ')||'catch / 其他早退'),literal(n.arguments[0]),link(recovery,n)]);});
  if(!guards.length)throw Error('No recovery refusals found');
  execution+='\n## 阶段内恢复的拒绝条件\n\n按源码顺序列出拒绝恢复的分支，表中的条件是局部语法条件，不代替真实恢复验收。\n\n'+table(['局部条件','界面原因','源码'],guards);
  const bg='source/lib/research/harness/background.ts',finishes=[];walk(namedFunction(file(bg).sf,'runBackground'),n=>{if(ts.isCallExpression(n)&&n.expression.getText()==='finish')finishes.push([inline(literal(n.arguments[0])),literal(n.arguments[1]),link(bg,n)]);});
  execution+='\n## 后台推进落点\n\n'+table(['后台状态','说明','源码'],finishes);

  const group=p=>p.startsWith('source/app/api/')?'API':p.startsWith('source/app/')?'页面':p.startsWith('source/components/')?'界面组件':p.startsWith('source/lib/research/harness/')?'执行保障':p.startsWith('source/lib/research/')?'研究逻辑':p.startsWith('source/lib/deployment/')?'部署适配':p.startsWith('source/db/')?'数据结构':'公共模块';
  function resolve(from,spec){const base=spec.startsWith('@/')?'source/'+spec.slice(2):spec.startsWith('.')?path.posix.normalize(path.posix.join(path.posix.dirname(from),spec)):null;if(!base)return;return [base,base+'.ts',base+'.tsx',base+'.mts',base+'.mjs',base+'/index.ts',base+'/index.tsx'].find(x=>sources.has(x));}
  const edges=new Map(),imports=[];
  for(const [p,v] of sources)for(const n of v.sf.statements){if(!ts.isImportDeclaration(n)||!ts.isStringLiteral(n.moduleSpecifier)||n.importClause?.isTypeOnly)continue;const b=n.importClause?.namedBindings;if(b&&ts.isNamedImports(b)&&b.elements.length&&b.elements.every(e=>e.isTypeOnly)&&!n.importClause?.name)continue;const target=resolve(p,n.moduleSpecifier.text);if(!target)continue;imports.push({from:p,to:target});const a=group(p),z=group(target);if(a!==z){const key=a+'|'+z;edges.set(key,(edges.get(key)||0)+1);}}
  let arch=header('模块结构与 API 索引');arch+='## 静态依赖图\n\n箭头表示源码中的静态运行时 import，数字是导入语句数量。纯类型导入不计入。动态加载、间接调用与运行频次不在此图范围内。\n\n\`\`\`mermaid\nflowchart TD\n';
  const groups=[...new Set([...sources.keys()].map(group))].sort();groups.forEach((g,i)=>arch+=`  m${i}[${quote(g)}]\n`);for(const [key,count] of [...edges].sort()){const [a,b]=key.split('|');arch+=`  m${groups.indexOf(a)} -->|${count}| m${groups.indexOf(b)}\n`;}arch+='\`\`\`\n\n';
  const apis=[];for(const [p,v] of sources){if(!p.startsWith('source/app/api/')||!p.endsWith('/route.ts'))continue;const methods=v.sf.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)&&/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(n.name?.text||'')).map(n=>n.name.text);apis.push([inline('/api/'+p.slice('source/app/api/'.length).replace(/\/route.ts$/,'')),methods.join(', ')||'未提取',link(p)]);}
  arch+='## API 入口\n\n动态参数保留目录形式。接口是否允许访问、调用预算与具体字段仍以服务端代码为准。\n\n'+table(['路径','导出方法','源码'],apis);
  const channels=[];for(const p of ['source/lib/research/collection.ts','source/lib/research/configured-sources.ts'])walk(file(p).sf,n=>{if(!ts.isCallExpression(n))return;const exp=n.expression.getText();if(exp==='add'&&n.arguments.length>=3)channels.push([inline(print(n.arguments[1])),inline(print(n.arguments[0])),inline(conditions(n).join(' && ')||'函数内 / 循环内'),link(p,n)]);if(exp==='channels.push')for(const a of n.arguments){if(prop(a,'name'))channels.push([inline(print(prop(a,'name'))),inline(print(prop(a,'cap'))),inline(conditions(n).join(' && ')||'函数内 / 循环内'),link(p,n)]);}});
  arch+='\n## 来源候选与配置渠道\n\n从采集器的候选声明提取，保留分支条件、常量和循环表达式。候选上限不是最终配额；去重、排序、余量转配、回源以及配置门控仍见对应源码。未声称这些渠道本轮全部执行。\n\n'+table(['候选名称 / 表达式','候选上限','局部条件','源码'],channels);
  const manifest={schema:1,fingerprint,typescript:ts.version,scope:['source/app','source/components','source/lib','source/db'],files:watched,manualReview:{status:pending.length?'pending':'current',pending}};
  const artifacts=new Map([
    [outDir+'/WORKFLOW.generated.md',workflow],
    [outDir+'/EXECUTION.generated.md',execution],
    [outDir+'/ARCHITECTURE.generated.md',arch],
    [outDir+'/manifest.generated.json',JSON.stringify(manifest,null,2)+'\n'],
  ]);
  return {artifacts,pending,expectedReview,expectedArchifyHash,fingerprint,counts:{files:paths.length,stages:Object.keys(stages).length,tools:tools.length,assignments:assignments.length,apiRoutes:apis.length,imports:imports.length}};
}

export function sync(root=defaultRoot,{check=false}={}){
  const result=buildArtifacts(root),stale=[];
  for(const [p,text] of result.artifacts){const dest=path.join(root,p);if(!fs.existsSync(dest)||fs.readFileSync(dest,'utf8')!==text){stale.push(p);if(!check){fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,text);}}}
  return {...result,stale};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const args=process.argv.slice(2);if(args.some(a=>a!=='--check'))throw Error('Usage: node scripts/sync-logic-docs.mjs [--check]');
    const check=args.includes('--check'),r=sync(defaultRoot,{check});
    console.log(JSON.stringify({mode:check?'check':'generate',...r.counts,changed:r.stale,manualReview:r.pending.length?'pending':'current'},null,2));
    if(check&&(r.stale.length||r.pending.length)){console.error('逻辑文档待更新。运行 pnpm docs:logic；若核心文件变更，先复核 BUSINESS_FLOW.md 再更新 review.json。');process.exitCode=1;}
  }catch(e){console.error('Logic documentation failed:',e.message);process.exitCode=1;}
}
