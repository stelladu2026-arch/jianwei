export type EvidenceFileResult={kind:'rows';rows:Record<string,unknown>[]} | {kind:'text';title:string;text:string};
function csvRows(text:string){const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(cell);cell='';}else if(c==='\n'&&!quoted){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}else cell+=c;}if(quoted)throw new Error('CSV 引号未闭合');if(cell||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}const headers=rows.shift()||[];return rows.filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(headers.map((k,i)=>[k.trim(),r[i]||''])));}
function checkedRows(rows:unknown):Record<string,unknown>[] {if(!Array.isArray(rows)||rows.length<1||rows.length>30)throw new Error('文件需包含 1–30 条资料。');if(rows.some(r=>!r||typeof r!=='object'||typeof r.title!=='string'||!r.title.trim()||typeof r.text!=='string'||!r.text.trim()))throw new Error('每条资料都须有非空的 title（标题）和 text（原文）文本。');if(rows.some(r=>r.title.trim().length>200||r.text.trim().length>8000))throw new Error('每条资料的标题最多 200 字符，原文最多 8000 字符；请拆分后导入。');return rows;}
export async function readEvidenceFile(file:Pick<File,'size'|'name'|'text'>,stillCurrent:()=>boolean):Promise<EvidenceFileResult|null>{
 if(file.size>200000)throw new Error('文件请小于 200 KB。');
 if(!/\.(json|csv|md|txt)$/i.test(file.name))throw new Error('请选择 JSON、CSV、Markdown 或 TXT 文件。');
 const text=(await file.text()).replace(/^\uFEFF/,'');
 if(!stillCurrent())return null;
 if(/\.json$/i.test(file.name)){let rows:unknown;try{rows=JSON.parse(text)}catch{throw new Error('JSON 格式不正确，请检查文件后重选。')}return {kind:'rows',rows:checkedRows(rows)}}
 if(/\.csv$/i.test(file.name))return {kind:'rows',rows:checkedRows(csvRows(text))};
 if(!text.trim())throw new Error('文件没有可导入的原文，请选择有内容的文件。');
 if(text.trim().length>8000)throw new Error('单条原文最多 8000 字符，请拆分为多个片段后导入。');
 if(file.name.length>200)throw new Error('文件名作为资料标题最多 200 字符，请缩短文件名后重选。');
 return {kind:'text',title:file.name,text};
}
