import {sourceFit} from './source-fit';
import type {Evidence} from './domain';
// Original excerpts may be truncated, but discovery summaries are not original bodies.
export function isAnalysisBody(e:Evidence){return !e.excluded&&e.kind!=='synthetic'&&e.contentBasis!=='excerpt'&&e.text.trim().length>=40&&!/^该(帖子|条目)只有标题/.test(e.text);}
export function evidenceReadiness(items:Evidence[]){return {bodies:items.filter(isAnalysisBody).length,summaries:items.filter(e=>!e.excluded&&e.kind!=='synthetic'&&e.contentBasis==='excerpt').length};}

export function isResearchEvidence(e:Evidence,topic:string){return isAnalysisBody(e)&&sourceFit(e,topic).allowed;}
