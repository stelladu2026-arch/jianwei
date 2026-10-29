'use client';
import {useEffect,useState} from 'react';
import {requestJSON} from '@/lib/research/browser-api';
export function PublicSourceSummary(){
 const [channels,setChannels]=useState<{bochaReady?:boolean;tavilyReady?:boolean;discussionsReady?:boolean;communities?:string[]}|null>(null);
 const [web,setWeb]=useState<boolean|'error'|null>(null);
 useEffect(()=>{const c=new AbortController();void requestJSON<{webSearchReady:boolean;bochaReady?:boolean;tavilyReady?:boolean;discussionsReady?:boolean;communities?:string[]}>('/api/source-status',{signal:c.signal}).then(v=>{if(!c.signal.aborted){setWeb(v.webSearchReady);setChannels(v)}}).catch(()=>{if(!c.signal.aborted)setWeb('error')});return()=>c.abort()},[]);
 return <div className="source-choice" role="group" aria-label="本轮公开资料来源"><strong>按研究主题分配公开渠道</strong><p className="meta">技术与产品问题优先 GitHub Issue、人工评论和 Hacker News。Dify、n8n 题目另读取官方项目文档与最近版本记录，用于核对已有能力和修复情况。业务题目优先问题讨论；通用题目保留中国新闻网、国家统计局、少数派、博客园、OSCHINA 与中文维基百科。</p><p className="meta">每个检索词共享最多10次来源请求。按研究目标分配渠道，产品问题优先兼顾使用反馈和已有能力；有未用额度且目标资料缺失时，最多转给一个尚未执行的渠道，不重试失败来源。评论与原 Issue 保留同一线程，机器人回复不进入分析；官方资料不作为客户证言。文档和最近版本记录不能证明所有历史问题已修复。</p><p className="meta" role="status">{web===true?'网页搜索发现已配置：逐条标记正文与摘要；预算内优先对支持的站点读取一次原文。':web===false?'网页搜索发现尚未启用：当前仍使用上述公开渠道，可通过批量链接导入补充。':web==='error'?'网页搜索配置状态暂不可读取；以采集记录为准。':'网页搜索配置状态正在读取；以采集记录中的渠道结果为准。'}</p><p className="meta">{channels?`博查：${channels.bochaReady?'已配置':'未启用'}；Tavily：${channels.tavilyReady?'已配置':'未启用'}；GitHub Discussions：${channels.discussionsReady?'已配置':'未启用'}；产品社区（仅匹配当前主题时执行）：${channels.communities?.join('、')||'未选择'}。配置就绪不代表本轮已执行，具体以采集回执为准。`:'渠道配置读取中。'}</p></div>;
}
