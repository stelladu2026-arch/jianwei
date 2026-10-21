export type WaitingRequest={id:string;stage:string;startedAt:number};
export type WaitingInput={status:string;stage:string;lease?:{expires:string};startedAt?:string;pending?:WaitingRequest|null};
const hints:Record<string,string[]>={plan:['正在梳理研究问题与检索方向','等待研究计划返回，随后将采集原文','研究计划返回后会自动更新进度'],collect:['正在获取当前批次的公开原文','来源响应速度可能不同，请保留页面','实际采集条目将在结果返回后更新'],supplement:['正在补充与证据缺口相关的原文','补充范围以本轮计划为准','结果返回后会保留仍未解决的缺口'],check:['正在核对结构、引用编号与原文定位','校验结果返回后将更新检查点'],deliver:['正在保存研究草稿与机会卡','保存完成后可以查看结论和验证计划']};
const analysis=['正在等待当前阶段的分析结果','本阶段需要综合原文、替代方案与反证','分析返回后会更新结论和证据缺口'];
export function waitingFeedback(input:WaitingInput,now=Date.now()){
 const leaseValid=input.status==='running'&&!!input.lease&&Date.parse(input.lease.expires)>now;
 const submitting=input.status==='ready'&&!!input.pending&&input.pending.stage===input.stage;
 const phase=leaseValid?'running':input.status==='running'?'uncertain':submitting?'submitting':'idle';
 const savedStart=input.startedAt?Date.parse(input.startedAt):NaN;
 const start=phase==='submitting'?input.pending!.startedAt:Number.isFinite(savedStart)?savedStart:input.pending?.stage===input.stage?input.pending.startedAt:NaN;
 const elapsed=Number.isFinite(start)?Math.max(0,Math.floor((now-start)/1000)):null;
 const messages=phase==='submitting'?['请求已发出，正在确认执行状态','等待服务确认，确认后显示当前执行阶段']:hints[input.stage]||analysis;
 const message=phase==='uncertain'?'当前执行状态待确认，请刷新检查点核对结果。':messages[Math.floor((elapsed||0)/8)%messages.length];
 return {phase,animated:phase==='running'||phase==='submitting',elapsed,message,longWait:elapsed!==null&&elapsed>=35};
}
export function waitingDuration(seconds:number){return seconds<60?seconds+' 秒':Math.floor(seconds/60)+' 分 '+seconds%60+' 秒';}
