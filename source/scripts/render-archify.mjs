import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sync} from './sync-logic-docs.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
try{
  const current=sync(root,{check:true});
  if(current.stale.length||current.pending.length)throw Error('先更新并复核逻辑文档与 Archify 定义，再生成交互图。');
  const candidate=path.join(root,'docs/logic/archify/candidate.json');
  const spec=JSON.parse(fs.readFileSync(candidate,'utf8'));
  const revision=spec.meta?.repository?.revision;
  if(!/^[a-f0-9]{40}$/.test(revision||''))throw Error('Archify 需要固定的源码提交。');
  const sourcePaths=[...new Set(spec.components.flatMap(c=>(c.sources||[]).map(s=>s.path)))];
  for(const p of sourcePaths){
    if(!p.startsWith('source/')||p.split('/').includes('..'))throw Error('Invalid source reference');
    const committed=execFileSync('git',['show',revision+':'+p],{cwd:root,maxBuffer:2000000});
    const currentBytes=fs.readFileSync(path.join(root,p));
    if(!committed.equals(currentBytes))throw Error('Archify 引用的源码已变化：'+p+'。请复核含义、行号和固定提交，不生成旧图。');
  }
  const cli=process.env.JIANWEI_ARCHIFY_CLI;
  if(!cli||!fs.existsSync(cli))throw Error('设置 JIANWEI_ARCHIFY_CLI，指向官方 Archify 的 archify/bin/archify.mjs。');
  const output=path.resolve(root,spec.meta.output);
  if(!output.startsWith(path.join(root,'.archify')+path.sep))throw Error('Archify 输出必须在项目 .archify/ 内。');
  fs.mkdirSync(path.dirname(output),{recursive:true});
  const suffix=crypto.randomUUID().slice(0,8);
  const args=[cli,'finalize','architecture',candidate,output,'--repo-root',root,'--quality','showcase','--json','--out-dir',path.join(path.dirname(output),'check-'+suffix)];
  const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit',env:{...process.env,ARCHIFY_UPDATE_CHECK_DISABLED:'1'}});
  if(result.error)throw result.error;
  process.exitCode=result.status??1;
}catch(error){console.error(error.message);process.exitCode=1;}
