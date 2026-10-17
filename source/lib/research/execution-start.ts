import type {Project} from './domain';
export function realExecutionStartReason(p:Project,mode:'single'|'four',limit:number){
 if(p.archived||['paused','cancelled','completed'].includes(p.status))return '请先恢复或重新开启项目研究。';
 if(!p.confirmed)return '请先确认研究范围。';
 if(p.mode!=='manual'||p.evidence.some(e=>e.kind==='synthetic'))return '包含虚构资料的项目只能运行流程测试，请新建研究使用真实原文。';
 if(!p.evidence.some(e=>!e.excluded&&e.kind!=='synthetic'&&e.text.trim().length>=40))return '至少需要一条可分析的真实正文；只有标题或过短片段不能开始研究。';
 if(!Number.isInteger(limit)||limit<(mode==='four'?4:1)||limit>4)return mode==='four'?'四角色需要预留 4 次模型步骤尝试，请将上限设为 4。':'单角色请求上限须为 1–4 的整数。';
 return '';
}
