import type {Opportunity} from '@/lib/research/domain';
import {opportunityNextStep} from '@/lib/research/opportunity-lifecycle';
export function OpportunityNextStep({opportunity:o,saved=false,onReview,onPlan,onReport,onSources}:{opportunity:Opportunity;saved?:boolean;onReview:()=>void;onPlan:()=>void;onReport:()=>void;onSources:()=>void}){
 const step=opportunityNextStep(o);
 return <section className={'opportunity-next-step'+(saved?' saved':'')} aria-label="机会卡下一步"><div><p className="section-kicker" role={saved?'status':undefined}>{saved?'机会卡已保存 · 人工判断':'接下来'}</p><h3>{step.title}</h3><p>{step.text}</p></div><div className="opportunity-next-actions"><button className="button secondary" onClick={step.action==='review'?onReview:step.action==='plan'?onPlan:onReport}>{step.label}</button>{step.action==='plan'&&o.plan.trim()&&<button className="button subtle" onClick={onSources}>导入验证资料</button>}</div></section>;
}
