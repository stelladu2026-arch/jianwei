import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildArtifacts,sync} from '../scripts/sync-logic-docs.mjs';

const original=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'jianwei-logic-docs-'));
let passed=0;
const test=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
const rewrite=(p,fn)=>{const file=path.join(root,p);const before=fs.readFileSync(file,'utf8');fs.writeFileSync(file,fn(before));return ()=>fs.writeFileSync(file,before);};
try{
  for(const dir of ['source/app','source/components','source/lib','source/db'])if(fs.existsSync(path.join(original,dir)))fs.cpSync(path.join(original,dir),path.join(root,dir),{recursive:true});
  fs.mkdirSync(path.join(root,'source/scripts'),{recursive:true});
  fs.copyFileSync(path.join(original,'source/scripts/sync-logic-docs.mjs'),path.join(root,'source/scripts/sync-logic-docs.mjs'));
  fs.mkdirSync(path.join(root,'docs/logic'),{recursive:true});
  const initial=buildArtifacts(root);
  fs.writeFileSync(path.join(root,'docs/logic/review.json'),JSON.stringify({schema:1,reviewer:'fixture reviewer',summary:'Fixture only; not a real production review.',sources:initial.expectedReview}));
  const expected=sync(root);
  test('generation is deterministic and check leaves files unchanged',()=>{
    assert.equal(expected.pending.length,0);const again=sync(root,{check:true});assert.deepEqual(again.stale,[]);
    assert.deepEqual([...again.artifacts],[...buildArtifacts(root).artifacts]);
  });
  test('a missing generated diagram is detected without rewriting in check mode',()=>{
    const p=path.join(root,'docs/logic/WORKFLOW.generated.md');fs.unlinkSync(p);
    assert(sync(root,{check:true}).stale.includes('docs/logic/WORKFLOW.generated.md'));assert(!fs.existsSync(p));sync(root);
  });
  test('editing a stage label changes the diagram and invalidates human review',()=>{
    const undo=rewrite('source/lib/research/workflow.ts',s=>s.replace("plan:'规划检索'","plan:'变更后的规划'"));
    const changed=buildArtifacts(root);assert(changed.artifacts.get('docs/logic/WORKFLOW.generated.md').includes('变更后的规划'));assert(changed.pending.includes('source/lib/research/workflow.ts'));assert.notEqual(changed.fingerprint,expected.fingerprint);undo();
  });
  test('a new allowlisted tool appears in generated documentation',()=>{
    const undo=rewrite('source/lib/research/agent-loop.ts',s=>s.replace("export const AGENT_TOOLS=[","export const AGENT_TOOLS=['fixture_new_tool',"));
    const changed=buildArtifacts(root);assert.equal(changed.counts.tools,expected.counts.tools+1);assert(changed.artifacts.get('docs/logic/EXECUTION.generated.md').includes('fixture_new_tool'));undo();
  });
  test('a recovery refusal message is regenerated from its real branch',()=>{
    const undo=rewrite('source/lib/research/harness/recovery.ts',s=>s.replace('当前阶段不需要恢复。','测试中新增的恢复阻断。'));
    assert(buildArtifacts(root).artifacts.get('docs/logic/EXECUTION.generated.md').includes('测试中新增的恢复阻断。'));undo();
  });
  test('changing a real branch target updates the transition inventory',()=>{
    const undo=rewrite('source/app/api/projects/[id]/workflow/route.ts',s=>s.replace("w.stage='gap'","w.stage='check'"));
    const text=buildArtifacts(root).artifacts.get('docs/logic/WORKFLOW.generated.md');
    assert(text.includes("| `afterAnalyze` | `w.stage` | `'check'` |"));
    assert(!text.includes("| `afterAnalyze` | `w.stage` | `'gap'` |"));undo();
  });
  test('changing role prerequisites changes the generated dependency edge',()=>{
    const undo=rewrite('source/lib/research/execution.ts',s=>s.replace("role:'verifier',deps:[]","role:'verifier',deps:['needs']"));
    assert(buildArtifacts(root).artifacts.get('docs/logic/EXECUTION.generated.md').includes('t1_0 --> t1_2'));undo();
  });
  test('new source files and API handlers are automatically included',()=>{
    const dir=path.join(root,'source/app/api/fixture-new');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'route.ts'),'export async function GET(){return null}\n');
    const changed=buildArtifacts(root);assert.equal(changed.counts.apiRoutes,expected.counts.apiRoutes+1);assert(changed.artifacts.get('docs/logic/ARCHITECTURE.generated.md').includes('/api/fixture-new'));fs.rmSync(dir,{recursive:true});
  });
  test('an unknown workflow stage fails instead of publishing stale output',()=>{
    const undo=rewrite('source/lib/research/workflow.ts',s=>s.replace("['needs','commercial','verifier','synthesis','check','deliver']","['fixture_unknown','commercial','verifier','synthesis','check','deliver']"));
    assert.throws(()=>buildArtifacts(root),/Unknown stage/);undo();
  });
  test('unparseable application code fails explicitly',()=>{
    const p=path.join(root,'source/lib/fixture-broken.ts');fs.writeFileSync(p,'export const broken = {');assert.throws(()=>buildArtifacts(root),/syntax is not parseable/);fs.unlinkSync(p);
  });
  test('removing manual review cannot silently approve a business diagram',()=>{
    const p=path.join(root,'docs/logic/review.json');fs.unlinkSync(p);assert(buildArtifacts(root).pending.length>0);
  });
  console.log(`${passed} logic-documentation checks passed. No model, database or source-network requests.`);
}finally{fs.rmSync(root,{recursive:true,force:true});}
