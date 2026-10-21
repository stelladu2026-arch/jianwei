import type {HarnessDatabase} from './storage';
export type HarnessStatus={checkpoints:number;completedOperations:number;unfinishedOperations:number;uncertainOperations:number};
export async function harnessStatus(db:HarnessDatabase,threadIds:string[]):Promise<HarnessStatus>{
  const ids=[...new Set(threadIds)].slice(-30);
  if(!ids.length)return {checkpoints:0,completedOperations:0,unfinishedOperations:0,uncertainOperations:0};
  const placeholders=ids.map(()=>'?').join(',');
  const [checkpoints,operations]=await Promise.all([
    db.prepare(`SELECT COUNT(*) AS count FROM research_harness_checkpoints WHERE thread_id IN (${placeholders})`).bind(...ids).first<{count:number}>(),
    db.prepare(`SELECT SUM(CASE WHEN state='done' THEN 1 ELSE 0 END) AS completed,SUM(CASE WHEN state='started' THEN 1 ELSE 0 END) AS unfinished,SUM(CASE WHEN state='uncertain' THEN 1 ELSE 0 END) AS uncertain FROM research_harness_operations WHERE thread_id IN (${placeholders})`).bind(...ids).first<{completed:number|null;unfinished:number|null;uncertain:number|null}>(),
  ]);
  return {checkpoints:checkpoints?.count||0,completedOperations:operations?.completed||0,unfinishedOperations:operations?.unfinished||0,uncertainOperations:operations?.uncertain||0};
}
