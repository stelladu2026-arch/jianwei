'use client';

import {useRef,useState,type KeyboardEvent} from 'react';
import {ArrowDown,ArrowUpRight,BookOpen,Check,ChevronRight,Play,ScanLine,ShieldCheck} from 'lucide-react';
import {demoEvidence} from '@/lib/research/domain';
import {ResearchDeskMark} from './research-desk';

const original=demoEvidence('');
const lenses=[
 {id:'source',label:'原文',heading:'反复追问，还是一次偶发？',text:original[1].text,ref:'S2',source:'虚构人物 B',finding:'先保留问题原话，发生频率仍待核实。',icon:BookOpen},
 {id:'counter',label:'反证',heading:'同一个方向，也有相反声音。',text:original[2].text,ref:'S3',source:'虚构人物 C',finding:'已有替代可能足够，不能把抱怨直接当成需求。',icon:ShieldCheck},
 {id:'decision',label:'判断',heading:'先验证信息补全是否足够高频。',text:'招募符合条件的开发者，让其展示近期咨询，记录往返次数与耗时，再决定是否投入。',ref:'S2 / S3',source:'基于上述虚构材料的演示推断',finding:'留下下一步，也留下足以推翻判断的条件。',icon:Check},
] as const;

export function EvidenceLens(){
 const [selected,setSelected]=useState(0);
 const controls=useRef<Array<HTMLButtonElement|null>>([]);
 const lens=lenses[selected];
 function keyboard(event:KeyboardEvent<HTMLButtonElement>,index:number){
  let next=index;
  if(event.key==='ArrowRight')next=(index+1)%lenses.length;
  else if(event.key==='ArrowLeft')next=(index+lenses.length-1)%lenses.length;
  else if(event.key==='Home')next=0;
  else if(event.key==='End')next=lenses.length-1;
  else return;
  event.preventDefault();setSelected(next);controls.current[next]?.focus();
 }
 return <figure className={'evidence-lens lens-'+lens.id} aria-label="原文、反证与判断的交互演示">
  <div className="lens-mast"><span>小团队客户支持中的重复劳动</span><ScanLine size={20} aria-hidden="true"/></div>
  <div className="lens-stage">
   <div className="lens-reticle" aria-hidden="true"><span/><span/><span/><span/></div>
   <div className="lens-plane plane-back" aria-hidden="true"/>
   <div className="lens-plane plane-middle" aria-hidden="true"/>
   <article className="lens-reading" role="tabpanel" id="evidence-lens-panel" aria-labelledby={'lens-tab-'+lens.id} tabIndex={0}>
    <div key={lens.id} className="lens-reading-content">
     <div className="lens-reference"><lens.icon size={18} aria-hidden="true"/><span>{lens.ref}</span></div>
     <h3>{lens.heading}</h3>
     <blockquote>{lens.text}</blockquote>
     <p className="lens-source">{lens.source}</p>
     <div className="lens-finding"><span aria-hidden="true"/><p>{lens.finding}</p></div>
    </div>
   </article>
  </div>
  <div className="lens-controls" role="tablist" aria-label="查看原文、反证或判断">{lenses.map((item,index)=><button key={item.id} ref={node=>{controls.current[index]=node}} id={'lens-tab-'+item.id} role="tab" aria-selected={selected===index} aria-controls="evidence-lens-panel" tabIndex={selected===index?0:-1} onClick={()=>setSelected(index)} onKeyDown={event=>keyboard(event,index)}><item.icon size={16} aria-hidden="true"/>{item.label}</button>)}</div>
  <figcaption>虚构案例交互演示，不构成市场调研结论。</figcaption>
 </figure>;
}

const choices=[
 {title:'让问题先于答案',body:'先确认目标人群、场景和预期决策，再开始检索。',detail:'研究范围改变后，旧结论保留并标记待复核。'},
 {title:'让反证保持独立',body:'四角色复核中，反证角色先读原文，不读前序结论。',detail:'角色一致不是准确率，引用可定位也不等于需求成立。'},
 {title:'让中断可以接续',body:'保存阶段成果、预算和输入版本，从有效检查点继续。',detail:'不清零已用请求，不用隐式重试掩盖失败。'},
];

export function ResearchShowcase({busy,onDemo,onWorkspace,onNew}:{busy:boolean;onDemo:()=>void;onWorkspace:()=>void;onNew:()=>void}){
 return <div className="research-showcase">
  <nav className="showcase-nav" aria-label="作品导览导航">
   <a className="showcase-brand" href="#showcase-top" aria-label="见微，返回作品开头"><ResearchDeskMark/><span>见微</span></a>
   <div><a href="#design-decisions">产品取舍</a><a href="#research-path">研究链路</a><button disabled={busy} onClick={onWorkspace}>研究空间<ArrowUpRight size={16} aria-hidden="true"/></button></div>
  </nav>
  <section className="showcase-hero" id="showcase-top" aria-labelledby="showcase-title">
   <div className="showcase-intro">
    <h1 id="showcase-title">原文与反证之间，<br/>看见产品机会。</h1>
    <p>见微是一个产品机会研究 Agent，让模糊方向成为有依据、可复核的下一步。</p>
    <div className="showcase-actions"><button className="showcase-primary" disabled={busy} onClick={onDemo}><Play size={17} aria-hidden="true"/>{busy?'正在打开案例…':'打开演示案例'}</button><a className="showcase-text-link" href="#design-decisions">查看设计取舍<ArrowDown size={16} aria-hidden="true"/></a></div>
   </div>
   <EvidenceLens/>
   <div className="showcase-hero-foot"><span>产品机会研究 Agent</span><span>从问题出发，以验证收尾。</span></div>
  </section>
  <section className="showcase-decisions" id="design-decisions" aria-labelledby="decisions-title">
   <div className="showcase-section-heading"><h2 id="decisions-title">研究的价值，<br/>藏在取舍里。</h2><p>自动化负责整理证据，产品设计负责界定边界。</p></div>
   <div className="decision-index">{choices.map((choice,index)=><details key={choice.title} className="decision-item" open={index===0}><summary><h3>{choice.title}</h3><span className="decision-toggle" aria-hidden="true"/></summary><div className="decision-answer"><p>{choice.body}</p><p>{choice.detail}</p></div></details>)}</div>
  </section>
  <section className="showcase-path" id="research-path" aria-labelledby="path-title">
   <div className="showcase-section-heading"><h2 id="path-title">一条可以追溯的<br/>研究链路。</h2><p>自动检索与多角色复核，服务于同一个决策问题。</p></div>
   <ol className="research-path-list">
    <li><span>01</span><div><h3>界定研究范围</h3><p>目标人群、问题场景、预期决策。</p></div></li>
    <li><span>02</span><div><h3>采集并核对原文</h3><p>保留出处，区分正文与摘要。</p></div></li>
    <li><span>03</span><div><h3>分析与独立反证</h3><p>复核已有资料，核对引用与未知项。</p></div></li>
    <li><span>04</span><div><h3>人工确认下一步</h3><p>保存条件性草稿，设计验证计划。</p></div></li>
   </ol>
   <p className="showcase-boundary"><ShieldCheck size={18} aria-hidden="true"/>流程完成、角色一致、原文可定位，都不代表需求或付费已经得到验证。</p>
  </section>
  <section className="showcase-close" aria-labelledby="showcase-close-title"><div><h2 id="showcase-close-title">带着一个问题，<br/>进入研究。</h2><p>看固定演示，或用自己的方向开始一轮研究。</p></div><div className="showcase-close-actions"><button className="showcase-primary" disabled={busy} onClick={onWorkspace}>进入研究空间<ChevronRight size={18} aria-hidden="true"/></button><button className="showcase-text-link" disabled={busy} onClick={onNew}>新建研究<ArrowUpRight size={16} aria-hidden="true"/></button></div></section>
  <footer className="showcase-footer"><span>见微</span><p>保留依据，也保留未知。</p><a href="#showcase-top">回到开头<ArrowUpRight size={16} aria-hidden="true"/></a></footer>
 </div>;
}
