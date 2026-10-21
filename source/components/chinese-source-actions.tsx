'use client';

export function ChineseSourceActions({existingCount,canReview,busy,onImport,onReview}:{existingCount:number;canReview:boolean;busy:boolean;onImport:()=>void;onReview:()=>void}){
 return <div className="source-choice" role="region" aria-label="国内资料入口">
  <div><h3>用中文原文继续研究</h3><p>可导入已获授权的中文访谈、用户反馈或公开讨论原文。保留来源、日期及链接；同一作者或讨论串请填写相同标识，避免重复计算样本。</p></div>
  <div className="toolbar"><button className="button secondary" disabled={busy} onClick={onImport}>导入中文原文</button><button className="button secondary" disabled={busy||!canReview||existingCount===0} onClick={onReview}>复核已有资料</button></div>
  <p className="meta">已有 {existingCount} 条可分析正文。选择复核后，还需在上方确认本轮预算并点击开始，不会立即调用模型。{existingCount===0?'请先导入正文，再选择复核。':!canReview?'请先处理当前检查点并确认研究范围，再创建新一轮。':''} V2EX 订阅读取失败不代表没有需求；应用不会自动切换来源。公开讨论与自述不能证明实际付款或全体国内用户的需求。</p>
 </div>;
}
