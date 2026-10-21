// The existing D1 boundary and the Vercel/Turso facade implement this subset.
// No provider credentials or model prompts belong in execution events.
export interface HarnessStatement {
  bind(...values:unknown[]):HarnessStatement;
  first<T>():Promise<T|null>;
  all<T>():Promise<{results:T[]}>;
  run():Promise<{meta:{changes:number}}>;
}
export interface HarnessDatabase {prepare(sql:string):HarnessStatement}

export async function initializeHarnessDatabase(db:HarnessDatabase){
  for(const sql of [
    `CREATE TABLE IF NOT EXISTS research_harness_checkpoints (
      thread_id TEXT NOT NULL, namespace TEXT NOT NULL, checkpoint_id TEXT NOT NULL,
      parent_id TEXT, checkpoint_type TEXT NOT NULL, checkpoint_data TEXT NOT NULL,
      metadata_type TEXT NOT NULL, metadata_data TEXT NOT NULL,
      PRIMARY KEY(thread_id,namespace,checkpoint_id))`,
    `CREATE TABLE IF NOT EXISTS research_harness_writes (
      thread_id TEXT NOT NULL, namespace TEXT NOT NULL, checkpoint_id TEXT NOT NULL,
      task_id TEXT NOT NULL, write_index INTEGER NOT NULL, channel TEXT NOT NULL,
      value_type TEXT NOT NULL, value_data TEXT NOT NULL,
      PRIMARY KEY(thread_id,namespace,checkpoint_id,task_id,write_index))`,
    `CREATE TABLE IF NOT EXISTS research_harness_threads (
      thread_id TEXT PRIMARY KEY, binding_hash TEXT NOT NULL, created TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS research_harness_operations (
      thread_id TEXT NOT NULL, operation_id TEXT NOT NULL,
      state TEXT NOT NULL, result TEXT, updated TEXT NOT NULL,
      PRIMARY KEY(thread_id,operation_id))`,
  ])await db.prepare(sql).run();
}

export class HarnessJournal {
  readonly db:HarnessDatabase;
  readonly threadId:string;
  constructor(db:HarnessDatabase,threadId:string){this.db=db;this.threadId=threadId}
  async bind(hash:string){
    await this.db.prepare('INSERT INTO research_harness_threads (thread_id,binding_hash,created) VALUES (?,?,?) ON CONFLICT(thread_id) DO NOTHING').bind(this.threadId,hash,new Date().toISOString()).run();
    const row=await this.db.prepare('SELECT binding_hash FROM research_harness_threads WHERE thread_id=?').bind(this.threadId).first<{binding_hash:string}>();
    if(row?.binding_hash!==hash)throw new Error('HARNESS_INPUT_CHANGED');
  }
  async execute<T>(operationId:string,execute:()=>Promise<T>):Promise<T>{
    const row=await this.db.prepare('SELECT state,result FROM research_harness_operations WHERE thread_id=? AND operation_id=?').bind(this.threadId,operationId).first<{state:string;result:string|null}>();
    if(row?.state==='done'&&row.result!==null)return JSON.parse(row.result) as T;
    if(row)throw new Error('HARNESS_RESULT_UNCERTAIN');
    // Claim before touching a budget or a remote service. A competing worker
    // cannot run the same external action, even before its graph checkpoint.
    const claim=await this.db.prepare("INSERT INTO research_harness_operations (thread_id,operation_id,state,updated) VALUES (?,?,'started',?) ON CONFLICT(thread_id,operation_id) DO NOTHING").bind(this.threadId,operationId,new Date().toISOString()).run();
    if(!claim.meta.changes)throw new Error('HARNESS_RESULT_UNCERTAIN');
    try{
      const result=await execute();
      await this.db.prepare("UPDATE research_harness_operations SET state='done',result=?,updated=? WHERE thread_id=? AND operation_id=? AND state='started'").bind(JSON.stringify(result),new Date().toISOString(),this.threadId,operationId).run();
      return result;
    }catch(error){
      await this.db.prepare("UPDATE research_harness_operations SET state='uncertain',updated=? WHERE thread_id=? AND operation_id=? AND state='started'").bind(new Date().toISOString(),this.threadId,operationId).run();
      throw error;
    }
  }
}
