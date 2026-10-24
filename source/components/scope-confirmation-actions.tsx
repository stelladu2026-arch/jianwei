'use client';
import {Check,Play} from 'lucide-react';
export function ScopeConfirmationActions({confirmed,canResearch,busy,onConfirm,onResearch}:{confirmed:boolean;canResearch:boolean;busy:boolean;onConfirm:()=>void;onResearch:()=>void}){
 return <div className="panel-bottom">
  {confirmed?<span className="meta" role="status"><Check size={16} aria-hidden="true"/>范围已确认<span> · 编辑后需重新确认</span></span>:<><span className="meta">确认后开放资料检索与分析</span><button className="button primary" disabled={busy} onClick={onConfirm}><Check size={16} aria-hidden="true"/>确认研究范围</button></>}
  {confirmed&&canResearch&&<button className="button primary" disabled={busy} onClick={onResearch}><Play size={16} aria-hidden="true"/>开始一键研究</button>}
 </div>;
}
