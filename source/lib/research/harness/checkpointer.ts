import {Buffer} from 'node:buffer';
import {BaseCheckpointSaver,WRITES_IDX_MAP,type Checkpoint,type CheckpointTuple,type CheckpointListOptions,type CheckpointMetadata,type ChannelVersions,type PendingWrite} from '@langchain/langgraph-checkpoint';
import type {RunnableConfig} from '@langchain/core/runnables';
import type {HarnessDatabase} from './storage';

type Row={thread_id:string;namespace:string;checkpoint_id:string;parent_id:string|null;checkpoint_type:string;checkpoint_data:string;metadata_type:string;metadata_data:string};
type WriteRow={task_id:string;write_index:number;channel:string;value_type:string;value_data:string};
const encode=(bytes:Uint8Array)=>Buffer.from(bytes).toString('base64');
const decode=(value:string)=>new Uint8Array(Buffer.from(value,'base64'));
function keys(config:RunnableConfig){
  const c=config.configurable||{};
  if(typeof c.thread_id!=='string'||!c.thread_id||c.thread_id.length>255)throw new Error('HARNESS_THREAD_REQUIRED');
  return {thread:c.thread_id,namespace:String(c.checkpoint_ns||''),id:c.checkpoint_id as string|undefined};
}

// HTTP SQL only: never uses an ephemeral local SQLite file in Vercel.
export class ResearchCheckpointSaver extends BaseCheckpointSaver {
  readonly db:HarnessDatabase;
  constructor(db:HarnessDatabase){super();this.db=db}
  async getTuple(config:RunnableConfig):Promise<CheckpointTuple|undefined>{
    const k=keys(config);
    const row=await this.db.prepare(`SELECT * FROM research_harness_checkpoints WHERE thread_id=? AND namespace=?${k.id?' AND checkpoint_id=?':''} ORDER BY checkpoint_id DESC LIMIT 1`).bind(k.thread,k.namespace,...(k.id?[k.id]:[])).first<Row>();
    return row?this.tuple(row):undefined;
  }
  private async tuple(row:Row):Promise<CheckpointTuple>{
    const writes=await this.db.prepare('SELECT task_id,write_index,channel,value_type,value_data FROM research_harness_writes WHERE thread_id=? AND namespace=? AND checkpoint_id=? ORDER BY task_id,write_index').bind(row.thread_id,row.namespace,row.checkpoint_id).all<WriteRow>();
    return {
      config:{configurable:{thread_id:row.thread_id,checkpoint_ns:row.namespace,checkpoint_id:row.checkpoint_id}},
      checkpoint:await this.serde.loadsTyped(row.checkpoint_type,decode(row.checkpoint_data)) as Checkpoint,
      metadata:await this.serde.loadsTyped(row.metadata_type,decode(row.metadata_data)) as CheckpointMetadata,
      ...(row.parent_id?{parentConfig:{configurable:{thread_id:row.thread_id,checkpoint_ns:row.namespace,checkpoint_id:row.parent_id}}}:{}),
      pendingWrites:await Promise.all(writes.results.map(async w=>[w.task_id,w.channel,await this.serde.loadsTyped(w.value_type,decode(w.value_data))] as [string,string,unknown])),
    };
  }
  async *list(config:RunnableConfig,options:CheckpointListOptions={}){
    const k=keys(config),before=options.before?.configurable?.checkpoint_id;
    const rows=await this.db.prepare(`SELECT * FROM research_harness_checkpoints WHERE thread_id=? AND namespace=?${before?' AND checkpoint_id<?':''} ORDER BY checkpoint_id DESC`).bind(k.thread,k.namespace,...(before?[before]:[])).all<Row>();
    let yielded=0;
    for(const row of rows.results){
      const tuple=await this.tuple(row);
      if(options.filter&&!Object.entries(options.filter).every(([key,value])=>JSON.stringify((tuple.metadata as Record<string,unknown>|undefined)?.[key])===JSON.stringify(value)))continue;
      if(options.limit!==undefined&&yielded>=options.limit)return;
      yielded++;yield tuple;
    }
  }
  async put(config:RunnableConfig,checkpoint:Checkpoint,metadata:CheckpointMetadata,_versions:ChannelVersions){
    const k=keys(config),[type,data]=await this.serde.dumpsTyped(checkpoint),[mt,md]=await this.serde.dumpsTyped(metadata);
    await this.db.prepare('INSERT INTO research_harness_checkpoints (thread_id,namespace,checkpoint_id,parent_id,checkpoint_type,checkpoint_data,metadata_type,metadata_data) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(thread_id,namespace,checkpoint_id) DO UPDATE SET checkpoint_type=excluded.checkpoint_type,checkpoint_data=excluded.checkpoint_data,metadata_type=excluded.metadata_type,metadata_data=excluded.metadata_data').bind(k.thread,k.namespace,checkpoint.id,k.id||null,type,encode(data),mt,encode(md)).run();
    return {configurable:{thread_id:k.thread,checkpoint_ns:k.namespace,checkpoint_id:checkpoint.id}};
  }
  async putWrites(config:RunnableConfig,writes:PendingWrite[],taskId:string){
    const k=keys(config);if(!k.id)throw new Error('HARNESS_CHECKPOINT_REQUIRED');
    for(const [index,[channel,value]] of writes.entries()){
      const [type,data]=await this.serde.dumpsTyped(value),writeIndex=WRITES_IDX_MAP[channel]??index;
      // Regular writes are first-writer wins; framework error/interrupt
      // channels use negative indices and may be updated on resume.
      const conflict=writeIndex<0?'DO UPDATE SET value_type=excluded.value_type,value_data=excluded.value_data':'DO NOTHING';
      await this.db.prepare(`INSERT INTO research_harness_writes (thread_id,namespace,checkpoint_id,task_id,write_index,channel,value_type,value_data) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(thread_id,namespace,checkpoint_id,task_id,write_index) ${conflict}`).bind(k.thread,k.namespace,k.id,taskId,writeIndex,channel,type,encode(data)).run();
    }
  }
  async deleteThread(threadId:string){
    for(const table of ['research_harness_stage_inputs','research_harness_writes','research_harness_checkpoints','research_harness_operations','research_harness_threads'])await this.db.prepare(`DELETE FROM ${table} WHERE thread_id=?`).bind(threadId).run();
  }
}
