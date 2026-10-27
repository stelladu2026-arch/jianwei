import {BookOpen,Compass,FileText,Layers3,Lightbulb,Play,ShieldCheck} from 'lucide-react';
const scenes={
 overview:{label:'研究观测站',note:'从一个问题出发，保留每一步判断的依据。',icon:Layers3,index:'00'},
 brief:{label:'定义研究坐标',note:'目标人群、问题场景与预期决策，共同确定研究方向。',icon:Compass,index:'01'},
 evidence:{label:'证据观测场',note:'保留原文 · 区分立场 · 追溯出处',icon:BookOpen,index:'02'},
 opportunities:{label:'机会研判场',note:'将事实、推断与未知分开，留下可验证的下一步。',icon:Lightbulb,index:'03'},
 report:{label:'决策与验证',note:'把研究收束为有条件的判断，再用实验验证。',icon:FileText,index:'04'},
 governance:{label:'角色与记忆',note:'独立复核、版本记录与记忆边界，让判断可以追溯。',icon:ShieldCheck,index:'05'},
 workflow:{label:'研究链路',note:'采集、分析、反证与汇总，在有效检查点接续。',icon:Compass,index:'06'},
 execution:{label:'执行观测台',note:'核对输入、执行记录和评测结果。',icon:Play,index:'07'},
} as const;
export function WorkspaceAtmosphere({view}:{view:string}){
 const scene=scenes[view as keyof typeof scenes]||scenes.overview;
 const Icon=scene.icon;
 return <section className="workspace-atmosphere" aria-label={scene.label}>
  <div className="workspace-scene-copy"><span className="workspace-scene-index">研究空间 / {scene.index}</span><h2>{scene.label}</h2><p>{scene.note}</p></div>
  <div className="workspace-instrument" aria-hidden="true"><svg viewBox="0 0 460 220" fill="none"><ellipse cx="230" cy="125" rx="196" ry="52"/><ellipse cx="230" cy="125" rx="160" ry="40"/><ellipse cx="230" cy="125" rx="192" ry="65" transform="rotate(-16 230 125)"/><path d="M230 12V210M24 125H436"/><circle cx="230" cy="125" r="6"/><circle cx="51" cy="106" r="4"/><circle cx="398" cy="150" r="4"/></svg><span className="instrument-plinth"/><span className="instrument-plate"><Icon size={54} strokeWidth={1.25}/></span><i className="instrument-signal"/></div>
 </section>;
}
