import assert from 'node:assert/strict';
// Exercise the documented SQL-over-HTTP protocol against real, in-memory SQLite.
export function sqliteTursoTransport(sqlite){return async(url,init)=>{
 assert.equal(url,'https://synthetic-test.turso.io/v2/pipeline');assert.equal(init.redirect,'manual');assert.equal(init.cache,'no-store');assert.equal(init.headers.Authorization,'Bearer synthetic-turso-token-only');
 const {requests}=JSON.parse(init.body);assert.equal(requests.length,2);assert.equal(requests[1].type,'close');const {sql,args=[]}=requests[0].stmt;
 const values=args.map(v=>v.type==='null'?null:v.type==='integer'?Number(v.value):v.value);
 try{const statement=sqlite.prepare(sql),columns=statement.columns();let rows=[],changes=0;if(columns.length)rows=statement.all(...values).map(row=>columns.map(c=>row[c.name]===null?{type:'null'}:{type:typeof row[c.name]==='number'?'integer':'text',value:String(row[c.name])}));else changes=Number(statement.run(...values).changes);
 return Response.json({results:[{type:'ok',response:{type:'execute',result:{cols:columns.map(c=>({name:c.name})),rows,affected_row_count:changes}}},{type:'ok',response:{type:'close'}}]});
 }catch{return Response.json({results:[{type:'error',error:{message:'Synthetic rejected SQL'}},{type:'ok',response:{type:'close'}}]})}
}}
