import type {Project} from './domain';
export function executionDefaults(mode:Project['mode']){return mode==='replay'?{adapter:'simulation' as const,limit:4}:{adapter:'qwen' as const,limit:1};}
export function presentSystemCopy(text:string){if(!/^(采集预算已达到上限|该本地步骤已达到重试上限|本阶段报告由本地规则)/.test(text))return text;return text.replaceAll('本地收尾','采集收尾').replaceAll('本地校验','引用校验').replaceAll('本地步骤','校验与保存步骤').replaceAll('本地规则','系统规则');}
// Only the generated prelude is presented differently. The source directory,
// quoted material, model claims and immutable stored report remain intact.
export function presentReport(text:string){
 const at=text.search(/^## (?:证据目录|所附原文)\s*$/m);
 const generated=at<0?text:text.slice(0,at),originals=at<0?'':text.slice(at);
 return generated.split('\n').map(line=>line.startsWith('执行器：')&&line.includes('；模型：')?'':line==='## 结论引用范围（本地规则）'?'## 结论引用范围':line.startsWith('本阶段报告由本地规则整理；')?line.replace('本阶段报告由本地规则整理；','本阶段报告依据已保存的研究结果整理；'):line).join('\n')+originals;
}

export function presentRecord(value:unknown){return JSON.stringify(value,(key,item)=>key==='model'||key==='adapter'?undefined:item,2);}
