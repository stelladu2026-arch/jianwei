import assert from 'node:assert/strict';
import {newProject} from '../lib/research/domain.ts';
import {create,get,save,db} from '../lib/research/store.ts';
import {projectPayload,PROJECT_PAYLOAD_BYTES} from '../lib/research/project-capacity.ts';
const owned=[];
try{
 const p=newProject({title:'Synthetic storage regression',audience:'Synthetic only',decision:'Offline capacity contract'});owned.push(p.id);
 p.decision='x'.repeat(610000);await create(p);const before=structuredClone(p);
 await save(p,p.version);assert.equal(p.version,before.version+1);assert.equal((await get(p.id)).decision,before.decision);
 console.log('PASS project larger than old 600000-character cap remains readable and writable');
 const current=structuredClone(p);p.decision='中'.repeat(700000);const rejectedVersion=p.version,rejectedUpdated=p.updated;
 await assert.rejects(save(p,p.version),/2 MB/);assert.equal(p.version,rejectedVersion);assert.equal(p.updated,rejectedUpdated);assert.deepEqual(await get(p.id),current);
 console.log('PASS UTF-8 overflow preserves stored payload and caller version/timestamp');
 p.decision=current.decision;await assert.rejects(save(p,p.version-1),/VERSION_CONFLICT/);assert.equal(p.version,rejectedVersion);assert.equal(p.updated,rejectedUpdated);
 console.log('PASS stale CAS save does not mutate caller metadata or stored record');
 const tooLarge=newProject({title:'Synthetic oversized creation',audience:'Synthetic',decision:'中'.repeat(700000)});await assert.rejects(create(tooLarge),/2 MB/);assert.equal(await get(tooLarge.id),null);
 assert.equal(new TextEncoder().encode(projectPayload('x'.repeat(PROJECT_PAYLOAD_BYTES-2))).length,PROJECT_PAYLOAD_BYTES);assert.throws(()=>projectPayload('x'.repeat(PROJECT_PAYLOAD_BYTES-1)),/2 MB/);
 console.log('PASS creation and updates share exact UTF-8 boundary; oversized creation writes nothing');
}finally{for(const id of owned)await db().prepare('DELETE FROM research_projects WHERE id=?').bind(id).run();}
