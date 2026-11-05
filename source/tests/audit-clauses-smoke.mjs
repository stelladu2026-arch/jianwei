import assert from 'node:assert/strict';
import {auditClauses,auditFieldJudgments} from '../lib/research/audit-clauses.ts';
const claim='运营团队在使用自托管 n8n 同步订单和生成日报时，面临定时任务因时区配置错误（如 moment-timezone 与 Node ICU 版本不一致）或数据库连接丢失导致的静默失败，且缺乏有效的自动恢复与外部监控手段。';
const parent={target:'coordinator:proposal:problem',role:'coordinator',claim,refs:['E1','E2']},before=structuredClone(parent),rows=auditClauses([parent]);
assert.ok(rows.length>=3);assert.deepEqual(parent,before);assert.equal(rows.map(r=>r.claim).join(''),claim);assert.equal(new Set(rows.map(r=>r.target)).size,rows.length);
for(const row of rows){assert.equal(row.claim,claim.slice(row.start,row.end));assert.equal(row.parent_claim,claim);assert.deepEqual(row.refs,['E1','E2']);}
assert.ok(rows.some(r=>r.claim.includes('且缺乏有效的自动恢复')));assert.ok(rows.some(r=>r.claim.includes('（如 moment-timezone 与 Node ICU 版本不一致）')));
console.log('PASS exact clause spans preserve full original, negation, parentheses and field references');
const partial=rows.map((r,i)=>({target:r.target,judgment:i?'insufficient':'supports'}));assert.equal(auditFieldJudgments(partial,rows)[0].fullySupported,false);assert.equal(auditFieldJudgments(partial.slice(0,1),rows)[0].fullySupported,false);
assert.equal(auditFieldJudgments(rows.map(r=>({target:r.target,judgment:'supports'})),rows)[0].fullySupported,true);
assert.throws(()=>auditClauses([{...parent,claim:'这是需要完整保留的较长研究假设，'.repeat(15)}]),/超过12项/);
console.log('PASS partial or missing clause cannot count as whole-field support; excess claims are rejected without truncation');
