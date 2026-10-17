import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {legacyResponseSchema as responseSchema} from '../lib/research/qwen-model.ts';
import {locateChecks} from '../lib/research/collaboration.ts';
import {validateResult} from '../lib/research/execution.ts';
import {decodeReviewWire as decodeLegacy} from '../lib/research/review-wire.ts';
import {expandSourceFacts} from '../lib/research/source-facts.ts';
function decodeReviewWire(wire,role){return decodeLegacy(expandSourceFacts(wire,[],true),role)}
import {describeReviewIssue} from '../lib/research/review-contract.ts';
import {planningQueries} from '../lib/research/workflow.ts';
const planningFixture=JSON.parse(readFileSync(new URL('./fixtures/planning-wire.json',import.meta.url),'utf8'));
// Reuse the JSON Schema validator installed with the declared ESLint toolchain.
const require=createRequire(import.meta.url),Ajv=createRequire(require.resolve('eslint'))('ajv'),ajv=new Ajv({allErrors:true});
let passed=0;
function check(label,fn){fn();passed++;console.log('PASS '+label)}
const quote='Synthetic original contains a repeated setup problem.';
function fixture(role,judgment,anchors){
  const data={notes:[{claim:'Synthetic conditional claim.',kind:'hypothesis'}],checks:[{target:'note:0',judgment,reason:'Synthetic fixture; no actual semantic conclusion.',anchors}]};
  if(role==='coordinator'){
    data.proposal={title:'Synthetic proposal',problem:'Synthetic problem',audience:'Synthetic teams',alternative:'Existing tools',conclusion:'Synthetic conditional conclusion',decision:'evidence',payment:'none',counter:'Unverified',unknowns:'Unverified',plan:'Review originals'};
    data.disagreements=[];
    for(const target of ['proposal:problem','proposal:conclusion'])data.checks.push({target,judgment:'insufficient',reason:'Synthetic missing evidence.',anchors:[]});
  }
  return {fact_format:'source-quote/1',review_format:'claim-anchors/1',status:'partial',data,gaps:[]};
}
for(const role of ['needs','commercial','verifier','coordinator']){
  const schema=ajv.compile(responseSchema(role,['E1'],true,undefined,[{id:'E1',text:quote}]));
  check(`${role} schema rejects anchorless supports, partial and contradicts before downstream validation`,()=>{
    for(const judgment of ['supports','partial','contradicts'])assert.equal(schema(fixture(role,judgment,[])),false,judgment);
  });
  check(`${role} accepts insufficient without inventing a quotation and accepts cited judgments`,()=>{
    for(const judgment of ['supports','partial','contradicts','insufficient']){
      const wire=fixture(role,judgment,judgment==='insufficient'?[]:[{evidence_id:'E1',quote}]);
      assert.equal(schema(wire),true,JSON.stringify(schema.errors));
      const task={role,revision:1,evidence_ids:['E1'],evidence:[{id:'E1',text:quote}]};
      const result=validateResult({...decodeReviewWire(wire,role),revision:1,errors:[],usage:{input_tokens:0,output_tokens:0},model:'synthetic-fixture'},task);
      const checks=locateChecks(result,task);assert.equal(checks[0].judgment,judgment);if(judgment!=='insufficient')assert.equal(checks[0].anchors[0].start,0);
    }
  });
}
check('literal quote and reference restrictions remain enforced by provider schema',()=>{
  const schema=ajv.compile(responseSchema('needs',['E1'],true,undefined,[{id:'E1',text:quote}]));
  assert.equal(schema(fixture('needs','partial',[{evidence_id:'FOREIGN',quote}])),false);
  assert.equal(schema(fixture('needs','partial',[{evidence_id:'E1',quote:'Invented unrelated quotation'}])),false);
});
check('historical safe field path renders a specific Chinese explanation',()=>{
  assert.match(describeReviewIssue('data.checks.0.anchors:required_for_judgment'),/第 1 个核查条目.*没有附原文片段/);
  assert.match(describeReviewIssue('data.checks.1.anchors:required_for_judgment'),/第 2 个/);
});
check('claim refs and proposal refs are derived from matching anchor targets without loss',()=>{
  const second='Second original describes an existing alternative.';
  const wire=fixture('coordinator','partial',[{evidence_id:'E1',quote}]);
  wire.data.checks[1]={target:'proposal:problem',judgment:'partial',reason:'Synthetic',anchors:[{evidence_id:'E2',quote:second}]};
  wire.data.checks[2]={target:'proposal:conclusion',judgment:'partial',reason:'Synthetic',anchors:[{evidence_id:'E1',quote}]};
  const schema=ajv.compile(responseSchema('coordinator',['E1','E2'],true,undefined,[{id:'E1',text:quote},{id:'E2',text:second}]));assert.equal(schema(wire),true,JSON.stringify(schema.errors));
  const decoded=decodeReviewWire(wire,'coordinator');assert.deepEqual(decoded.data.notes[0].refs,['E1']);assert.deepEqual(decoded.data.proposal.refs,['E2','E1']);assert.deepEqual(decoded.evidence_ids,['E1','E2']);
  const task={role:'coordinator',revision:1,evidence_ids:['E1','E2'],evidence:[{id:'E1',text:quote},{id:'E2',text:second}]};
  const result=validateResult({...decoded,revision:1,errors:[],usage:{input_tokens:0,output_tokens:0},model:'synthetic'},task);
  assert.equal(locateChecks(result,task)[1].anchors[0].quote,second);
});
check('new wire rejects redundant old citation lists and unknown format instead of repairing them',()=>{
  const schema=ajv.compile(responseSchema('coordinator',['E1'],true,undefined,[{id:'E1',text:quote}]));
  for(const mutate of [w=>w.data.notes[0].refs=['E1'],w=>w.data.proposal.refs=['E1'],w=>w.evidence_ids=['E1'],w=>w.review_format='unknown']){
    const w=fixture('coordinator','partial',[{evidence_id:'E1',quote}]);mutate(w);assert.equal(schema(w),false);assert.throws(()=>decodeReviewWire(w,'coordinator'),/INVALID_MODEL_OUTPUT/);
  }
});
check('legacy internal claim reference mismatch remains rejected with the original field path',()=>{
  const decoded=decodeReviewWire(fixture('needs','partial',[{evidence_id:'E1',quote}]),'needs');decoded.data.notes[0].refs=[];
  const task={role:'needs',revision:1,evidence_ids:['E1'],evidence:[{id:'E1',text:quote}]};
  const result=validateResult({...decoded,revision:1,errors:[],usage:{input_tokens:0,output_tokens:0},model:'synthetic'},task);
  let issues;assert.throws(()=>locateChecks(result,task,x=>issues=x),/INVALID_MODEL_REFERENCE/);assert.equal(issues,'data.checks.0.anchors.0.evidence_id:not_in_claim');
  assert.match(describeReviewIssue('data.checks.2.anchors.0.evidence_id:not_in_claim'),/第 3 个核查条目的第 1 段引文/);
});
check('missing, duplicate and unknown targets are not rescued by reference derivation',()=>{
  const task={role:'needs',revision:1,evidence_ids:['E1'],evidence:[{id:'E1',text:quote}]};
  for(const mutate of [w=>w.data.checks=[],w=>w.data.checks.push(structuredClone(w.data.checks[0])),w=>w.data.checks[0].target='note:9']){
    const w=fixture('needs','partial',[{evidence_id:'E1',quote}]);mutate(w);const decoded=decodeReviewWire(w,'needs');
    // Unknown target anchors remain present and must fail even if no refs are derived.
    assert.throws(()=>{const r=validateResult({...decoded,revision:1,errors:[],usage:{input_tokens:0,output_tokens:0},model:'synthetic'},task);locateChecks(r,task)},/INVALID_REVIEW_COVERAGE|INVALID_MODEL_REFERENCE/);
  }
});
check('provider schema rejects cross-source quotes, mismatched note coverage, oversized gaps and extra disagreement refs',()=>{
  const second='Different original about unrelated topics and setup.';
  const evidence=[{id:'E1',text:quote},{id:'E2',text:second}];
  const schema=ajv.compile(responseSchema('needs',['E1','E2'],true,undefined,evidence));
  assert.equal(schema(fixture('needs','partial',[{evidence_id:'E2',quote}])),false);
  const foreignTarget=fixture('needs','partial',[{evidence_id:'E1',quote}]);
  foreignTarget.data.checks[0].target='note:1';
  assert.equal(schema(foreignTarget),false);
  const two=fixture('needs','partial',[{evidence_id:'E1',quote}]);
  two.data.notes.push({claim:'Second synthetic claim.',kind:'counter'});
  two.data.checks.push({target:'note:1',judgment:'insufficient',reason:'Synthetic missing evidence.',anchors:[]});
  assert.equal(schema(two),true,JSON.stringify(schema.errors));
  two.data.checks.pop();
  assert.equal(schema(two),false);
  const longGap=fixture('needs','partial',[{evidence_id:'E1',quote}]);
  longGap.gaps=['x'.repeat(2001)];
  assert.equal(schema(longGap),false);
  assert.throws(()=>decodeReviewWire(longGap,'needs'),/INVALID_MODEL_OUTPUT/);
  const coordinator=ajv.compile(responseSchema('coordinator',['E1'],true,undefined,[{id:'E1',text:quote}]));
  const extra=fixture('coordinator','partial',[{evidence_id:'E1',quote}]);
  extra.data.disagreements=[{topic:'Synthetic topic',roles:['needs','verifier'],reason:'Synthetic reason',handling:'Keep the gap',refs:Array.from({length:7},()=>'E1')}];
  assert.equal(coordinator(extra),false);
  assert.throws(()=>decodeReviewWire(extra,'coordinator'),/INVALID_MODEL_OUTPUT/);
});
check('provider schema rejects duplicate targets and disagreement roles while application checks still reject them',()=>{
  const evidence=[{id:'E1',text:quote}];
  const needsSchema=responseSchema('needs',['E1'],true,undefined,evidence),coordinatorSchema=responseSchema('coordinator',['E1'],true,undefined,evidence);
  assert.equal(JSON.stringify(needsSchema).includes('prefixItems'),false);
  assert.equal(JSON.stringify(coordinatorSchema).includes('prefixItems'),false);
  const needs=ajv.compile(needsSchema),coordinator=ajv.compile(coordinatorSchema);
  const duplicate=fixture('needs','partial',[{evidence_id:'E1',quote}]);
  duplicate.data.notes.push({claim:'Second synthetic claim.',kind:'counter'});
  duplicate.data.checks.push({target:'note:0',judgment:'insufficient',reason:'Synthetic missing evidence.',anchors:[]});
  assert.equal(needs(duplicate),false);
  const distinct=fixture('needs','partial',[{evidence_id:'E1',quote}]);
  distinct.data.notes.push({claim:'Second synthetic claim.',kind:'counter'});
  distinct.data.checks.push({target:'note:1',judgment:'insufficient',reason:'Synthetic missing evidence.',anchors:[]});
  assert.equal(needs(distinct),true,JSON.stringify(needs.errors));
  distinct.data.checks.reverse();
  assert.equal(needs(distinct),true,JSON.stringify(needs.errors));
  const task={role:'needs',revision:1,evidence_ids:['E1'],evidence};
  const decoded=decodeReviewWire(duplicate,'needs');
  let issue;assert.throws(()=>{const result=validateResult({...decoded,revision:1,errors:[],usage:{input_tokens:0,output_tokens:0},model:'synthetic'},task);locateChecks(result,task,x=>issue=x);},/INVALID_REVIEW_COVERAGE/);
  assert.equal(issue,'data.checks.target:duplicate');
  const repeated=fixture('coordinator','partial',[{evidence_id:'E1',quote}]);
  repeated.data.checks[2].target='proposal:problem';
  assert.equal(coordinator(repeated),false);
  const reordered=fixture('coordinator','partial',[{evidence_id:'E1',quote}]);
  reordered.data.checks.reverse();
  assert.equal(coordinator(reordered),true,JSON.stringify(coordinator.errors));
  const roles=fixture('coordinator','partial',[{evidence_id:'E1',quote}]);
  roles.data.disagreements=[{topic:'Synthetic topic',roles:['verifier','commercial'],reason:'Synthetic reason',handling:'Keep the gap',refs:['E1']}];
  assert.equal(coordinator(roles),true,JSON.stringify(coordinator.errors));
  roles.data.disagreements[0].roles=['verifier','needs','commercial'];
  assert.equal(coordinator(roles),true,JSON.stringify(coordinator.errors));
  roles.data.disagreements[0].roles=['verifier','verifier'];
  assert.equal(coordinator(roles),false);
  const decodedRoles=decodeReviewWire(fixture('coordinator','partial',[{evidence_id:'E1',quote}]),'coordinator');
  decodedRoles.data.disagreements=[{topic:'Synthetic topic',roles:['verifier','verifier'],reason:'Synthetic reason',handling:'Keep the gap',refs:['E1']}];
  const coordinatorTask={role:'coordinator',revision:1,evidence_ids:['E1'],evidence};
  let roleIssue;assert.throws(()=>{const result=validateResult({...decodedRoles,revision:1,errors:[],usage:{input_tokens:0,output_tokens:0},model:'synthetic'},coordinatorTask);locateChecks(result,coordinatorTask,x=>roleIssue=x);},/INVALID_MODEL_OUTPUT/);
  assert.equal(roleIssue,'data.disagreements.0.roles:duplicate');
  assert.match(describeReviewIssue(roleIssue),/第 1 条分歧/);
});
check('planning schema matches the prompt wire and keyword failures keep their own field path',()=>{
  const plan=w=>({stage:w,queries:[]});
  const wire=item=>{const {issues:_issues,...body}=item;return body;};
  const search=ajv.compile(responseSchema('needs',[],false,undefined,undefined,'search_plan'));
  const gap=ajv.compile(responseSchema('needs',[],false,undefined,undefined,'gap_plan'));
  const analysis=ajv.compile(responseSchema('needs',[],false));
  assert.equal(search(wire(planningFixture.intended)),true,JSON.stringify(search.errors));
  assert.deepEqual(planningQueries(wire(planningFixture.intended),plan('plan')),['customer support','help desk']);
  assert.equal(search(wire(planningFixture.charset)),false);assert.equal(search.errors[0].keyword,'pattern');
  const analysisWire=structuredClone(wire(planningFixture.looseCount));
  delete analysisWire.data.framing;
  analysisWire.data.citations=[];
  assert.equal(analysis(analysisWire),true,JSON.stringify(analysis.errors));
  assert.equal(search(wire(planningFixture.looseCount)),false);
  assert.equal(search(wire(planningFixture.wrongKind)),false);
  assert.equal(search(wire(planningFixture.partialStatus)),false);
  assert.equal(search({...wire(planningFixture.intended),data:{notes:[{claim:'a'.repeat(101),refs:[],kind:'gap'}]}}),false);
  assert.equal(gap({status:'ok',data:{notes:[{claim:'STOP',refs:[],kind:'gap'}]},evidence_ids:[],gaps:['Synthetic'],tool_calls:[]}),true,JSON.stringify(gap.errors));
  assert.equal(gap({status:'partial',data:{notes:[{claim:'switching support tools',refs:[],kind:'gap'}]},evidence_ids:[],gaps:['Synthetic'],tool_calls:[]}),true,JSON.stringify(gap.errors));
  let missingFraming;assert.throws(()=>planningQueries({status:'ok',data:{notes:[{claim:'customer support',refs:[],kind:'gap'}]},evidence_ids:[],gaps:[]},plan('plan'),issues=>{missingFraming=issues}),/INVALID_MODEL_OUTPUT/);assert.deepEqual(missingFraming,['data.framing:required']);
  assert.deepEqual(planningQueries({status:'ok',data:{notes:[{claim:'STOP',refs:[],kind:'gap'}]},evidence_ids:[],gaps:[]},plan('gap')),[]);
  for(const name of ['charset','sentence','looseCount','wrongKind','partialStatus']){
    const item=planningFixture[name];let seen;assert.throws(()=>planningQueries(wire(item),plan('plan'),issues=>{seen=issues}),/INVALID_MODEL_OUTPUT/);assert.deepEqual(seen,item.issues);assert.doesNotMatch(item.issues.join(','),/outside_input|INVALID_MODEL_REFERENCE/);
  }
  assert.match(describeReviewIssue(planningFixture.charset.issues[0]),/英文关键词/);
  const foreign={status:'ok',data:{notes:[{claim:'customer support',refs:['FOREIGN'],kind:'gap'}]},evidence_ids:['FOREIGN'],gaps:[],errors:[],revision:1,usage:{input_tokens:1,output_tokens:1},model:'synthetic'};
  let reference;assert.throws(()=>validateResult(foreign,{role:'needs',revision:1,evidence_ids:[],evidence:[]},issues=>{reference=issues}),/INVALID_MODEL_REFERENCE/);
  assert.deepEqual(reference,['refs:outside_input']);
});
check('a literal quotation from another source still fails source-specific location',()=>{
  const decoded=decodeReviewWire(fixture('needs','partial',[{evidence_id:'E2',quote}]),'needs');
  const task={role:'needs',revision:1,evidence_ids:['E1','E2'],evidence:[{id:'E1',text:quote},{id:'E2',text:'Different original about unrelated topics.'}]};
  const result=validateResult({...decoded,revision:1,errors:[],usage:{input_tokens:0,output_tokens:0},model:'synthetic'},task);
  assert.throws(()=>locateChecks(result,task),/INVALID_EVIDENCE_QUOTE/);
});
console.log(JSON.stringify({review_schema_checks:passed,actual_model_calls:0,scope:'independent JSON Schema validation plus actual strict application validators; provider compatibility and model quality still need live verification'}));
