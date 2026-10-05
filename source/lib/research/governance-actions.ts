import {z} from 'zod';
import {log,type Project} from './domain';
import {integrityIssues,scanReflections} from './governance';
const required=z.string().trim().min(1).max(4000);
const refs=z.array(z.string().max(100)).max(30);
function checkRefs(p:Project,ids:string[]){if(ids.some(id=>!p.evidence.some(e=>e.id===id&&!e.excluded)))throw new Error('引用必须来自本项目未排除的资料。');}
export function applyGovernanceAction(p:Project,action:string,data:unknown){
  p.memories??=[];p.reflections??=[];
  if(action==='memory'){
    const v=z.object({id:z.string().optional(),kind:z.enum(['preference','correction','experience']),text:required,refs,expires:z.union([z.literal(''),z.string().datetime()]).default('')}).strict().parse(data);
    checkRefs(p,v.refs);if(v.kind!=='preference'&&!v.refs.length)throw new Error('纠正与经验必须附带本项目原始证据引用。');
    if(v.expires&&Date.parse(v.expires)<=Date.now())throw new Error('有效期必须晚于当前时间。');
    const i=v.id?p.memories.findIndex(m=>m.id===v.id):-1;if(v.id&&i<0)throw new Error('记忆不存在');
    if(i<0&&p.memories.length>=100)throw new Error('项目记忆最多 100 条。');
    const item={...v,id:v.id||crypto.randomUUID(),revision:p.revision,evidenceVersion:p.evidenceVersion||0,created:i<0?new Date().toISOString():p.memories[i].created,status:v.kind==='experience'?'candidate' as const:'confirmed' as const,verification:'',origin:'user' as const};
    if(i<0)p.memories.unshift(item);else p.memories[i]=item;
    log(p,'保存用户设置的项目记忆；经验保留为候选');
  }
  if(action==='confirmMemory'){
    const v=z.object({id:z.string(),verification:required}).strict().parse(data),m=p.memories.find(x=>x.id===v.id);
    if(!m)throw new Error('记忆不存在');checkRefs(p,m.refs);
    if(m.revision!==p.revision||m.evidenceVersion!==(p.evidenceVersion||0)||(m.expires&&Date.parse(m.expires)<=Date.now()))throw new Error('记忆已失效，请编辑内容与依据后重新验证。');
    m.status='confirmed';m.verification=v.verification;log(p,'用户记录验证依据，确认经验仅用于当前项目');
  }
  if(action==='removeMemory'){const id=z.string().parse(data);p.memories=p.memories.filter(m=>m.id!==id);log(p,'删除项目记忆');}
  if(action==='reflection'){
    const v=z.object({problem:required,refs,cause:required,action:required}).strict().parse(data);checkRefs(p,v.refs);
    if(p.reflections.length>=100)throw new Error('反思记录最多 100 条。');
    p.reflections.unshift({...v,id:crypto.randomUUID(),key:'user:'+crypto.randomUUID(),origin:'user',verification:'',status:'open',revision:p.revision,evidenceVersion:p.evidenceVersion||0,created:new Date().toISOString()});log(p,'记录人工反思：原因是待验证假设');
  }
  if(action==='scanReflections'){scanReflections(p);log(p,'完成结构检查；不代表语义核验或模型反思');}
  if(action==='resolveReflection'){
    const v=z.object({id:z.string(),verification:required}).strict().parse(data),r=p.reflections.find(x=>x.id===v.id);
    if(!r)throw new Error('反思不存在');
    if(r.origin==='rule'&&integrityIssues(p).some(i=>i.key===r.key))throw new Error('检查项尚未修复，请先处理资料或机会卡。');
    r.status='resolved';r.verification=v.verification;r.resolvedAt=new Date().toISOString();log(p,'记录反思验证结果；没有自动修改角色指令');
  }
  if(action==='removeReflection'){const id=z.string().parse(data);p.reflections=p.reflections.filter(r=>r.id!==id);log(p,'删除反思记录');}
}
