// Display-only segmentation. Saved plans, citations and exports stay unchanged.
export function actionParagraphs(text:string):string[]{
 return text.replace(/\r\n?/g,'\n').split(/\n+/).flatMap(raw=>{
  const line=raw.trim();if(!line)return [];
  // Keep all sentences belonging to one explicitly numbered action together.
  // Decimal points and URLs are not treated as sentence separators.
  const markers=/(?:^|[\s。；;：:])((?:\d{1,2}(?:[、．）)]|\.(?!\d))|[（(]\d{1,2}[）)]|[一二三四五六七八九十]+[、．）)]|[（(][一二三四五六七八九十]+[）)]|[①-⑳])\s*)/gu;
  const positions=[...line.matchAll(markers)].map(m=>m.index!+m[0].length-m[1].length);
  if(positions.length>1){
   const starts=positions[0]===0?positions:[0,...positions];
   return starts.map((start,i)=>line.slice(start,starts[i+1]??line.length).trim()).filter(Boolean);
  }
  if(positions[0]===0||/^[-*•]\s+/.test(line))return [line];
  return line.split(/(?<=[。！？；])\s*/u).map(part=>part.trim()).filter(Boolean);
 });
}
