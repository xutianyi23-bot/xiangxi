'use strict';

function projectExportItems(p){
 const items=[];
 function add(area,title,body,system='',figures=[],id=''){
  const text=Array.isArray(body)?body.filter(Boolean).join('\n\n'):body;
  if(text?.trim()||figures.length)items.push({area,title,text:text||'',system,figures,id});
 }
 const textFields=(obj,fields)=>fields.map(([key,label])=>obj[key]&&label+'　'+obj[key]).filter(Boolean).join('\n');
 add('overview','课题概况',[p.goal,...p.systems.map(s=>[s.name,s.goal].filter(Boolean).join(' · '))]);
 add('background','课题研究背景',p.researchBackground);
 for(const t of db.tasks.filter(t=>t.project===p.id))add('calendar',t.title,[t.done?'已完成':'待完成',[t.date,t.time].filter(Boolean).join(' '),t.detail],t.system);
 for(const n of [...(p.mainNodes||[]),...(p.otherNodes||[])])if(n.when)add('calendar',n.title,[n.when,n.time]);
 for(const m of p.quickMeetings||[])add('quick',m.title,[m.date,m.transcript,m.minutes,...(m.advice||[]).map(a=>a.title+'　'+a.text)]);
 for(const r of p.reports||[]){
  const source=r.source&&(db.tasks.find(x=>x.id===r.source)||db.personal.find(x=>x.id===r.source)||[...(p.mainNodes||[]),...(p.otherNodes||[])].find(n=>n.id===r.source));
  if(!r.source&&r.date)add('calendar',r.title,[r.date,r.time,r.notes]);
  add('reports',source?.title||r.title,[source?.date||source?.when||r.date,source?.time||r.time,r.category,r.notes,...(r.slides||[]).map(s=>[s.title,...s.points].join('\n'))]);
 }
 if(p.thesis?.chapters?.length)for(const ch of p.thesis.chapters)add('thesis',ch.title,[(p.thesis.byline||[]).join('　'),ch.body]);
 if(p.thesis?.title)add('thesis','学位论文写作设置',[p.thesis.title,p.thesis.degree,p.thesis.length,p.thesis.format,p.thesis.parts,p.thesis.templateName]);
 for(const s of p.systems){
  const addSystem=(area,title,body,figures=[],id='')=>add(area,title,body,s.id,figures,id);
  addSystem('designs','研究问题',s.researchQuestion);
  for(const [key,area,label] of [['ideas','background','想法与创新'],['meetings','background','导师交流'],['designIdeas','designs','想法与创新'],['designMeetings','designs','设计阶段组会']]){
   for(const r of s[key]||[])addSystem(area,label+' · '+r.title,[r.date,r.text,r.summary]);
  }
  for(const r of references(s))addSystem('library',r.title,[citationText(r),r.remark,r.note,r.readingReport?.body]);
  for(const d of designs(s))addSystem('designs',d.title,[designText(d),sourceList(s,d)]);
  for(const d of submittedPlans(s))addSystem('lab','实验设计概要 · '+d.title,[designText(d),sourceList(s,d)]);
  for(const b of measurementGroups(s)){
   const fields=textFields(b,[['start','开始'],['end','结束'],['category','分类'],['question','研究问题'],['purpose','目的'],['materials','投料与样品'],['procedure','操作与条件'],['note','描述与备注']]);
   const logs=(b.log||[]).map(r=>textFields(r,[['date','记录日期'],['observation','现象'],['issue','问题'],['deviation','方案偏差']]));
   const draft=b.preparation&&textFields(b.preparation,[['purpose','实验目的'],['question','研究问题'],['materials','投料与样品'],['procedure','操作与条件']]);
   if(b!==s.sharedMeasurements)addSystem('lab',b.title,[batchState(s,b,p),b.outline,fields,draft],[],b.id);
   if(logs.length)addSystem('lab',b.title+' · 实验记录',logs,[],b.id);
   for(const r of b.results||[]){
    const title=b.title+' · '+(r.method||r.sourceName||'检测结果');
    const figures=r.series||r.preview?[{title,svg:spectrumFigure(r)}]:[];
    const values=[r.pendingReview?'待核对':'',r.sourceName,r.requirement,r.text,r.remark&&"备注　"+r.remark,r.raw||r.excerpt,
     r.series?.stats&&JSON.stringify(r.series.stats),r.series&&!r.raw&&[r.series.xLabel+'\t'+r.series.yLabel,...r.series.points.map(pair=>pair.join('\t'))].join('\n')];
    addSystem('lab',title,values,figures,b.id);
   }
   addSystem('lab',b.title+' · 数据分析报告',[b.report?.body,b.report?.remark],[],b.id);
   if(b.start||b.end)addSystem('calendar',b.title,[b.start,b.end].filter(Boolean).join(' 至 '),[],b.id);
  }
  for(const r of s.relations||[])addSystem('lab',r.label,r.members.map(id=>batches(s).find(b=>b.id===id)?.title).filter(Boolean).join(' · '));
  if(s.reagents?.length)addSystem('lab','试剂归档',s.reagents.map(r=>inventoryFields.map(([k,l])=>r[k]&&l+' '+r[k]).filter(Boolean).join('　')));
  for(const r of s.importedPapers||[])addSystem('paper',r.title,r.body);
  for(const t of s.paperTargets||[]){
   addSystem('paper','目标期刊 · '+t.name,[t.name,t.lang,t.requirements,t.profile?.guide,...(t.corpus||[]).map(citationLine),...selectedAuthors(t).map(a=>[a.name,a.affiliation,a.email].filter(Boolean).join(' · '))]);
   for(const d of t.drafts||[])if(d.sections?.length)items.push({area:'paper',system:s.id,title:d.title,id:d.id,manuscript:d});
  }
 }
 return items;
}
function exportProject(scopeArea='',systemId='',batchId=''){
 const p=proj(),rows=projectExportItems(p).filter(x=>(!scopeArea||x.area===scopeArea)&&(!systemId||x.system===systemId||(!x.system&&scopeArea==='background'))&&(!batchId||x.id===batchId));
 if(!rows.length)return toast('当前范围没有可导出的内容。');
 const groups=new Map();rows.forEach((r,i)=>{const group=[p.systems.find(s=>s.id===r.system)?.name,areaNames[r.area]||names[r.area]].filter(Boolean).join(' / ');if(!groups.has(group))groups.set(group,[]);groups.get(group).push([r,i])});
 const options=[...groups].map(([name,entries])=>'<fieldset><legend>'+esc(name)+'</legend>'+entries.map(([r,i])=>'<label class="tick"><input type="checkbox" name="item_'+i+'" checked>'+esc(r.title)+'</label>').join('')+'</fieldset>').join('');
 form('导出本课题相关内容','<label>文件格式<select name="format"><option value="pdf">PDF</option><option value="docx">Word（.docx）</option></select></label><label class="tick"><input type="checkbox" id="allExport" checked>全选</label>'+options,d=>{
  const selected=rows.filter((r,i)=>d['item_'+i]);if(!selected.length)throw Error('请勾选要导出的内容。');
  queueMicrotask(()=>writeProjectExport(p,selected,d.format).catch(e=>toast(e.message)));
 },f=>{f.querySelector('.primary').textContent='选择保存位置';f.querySelector('#allExport').onchange=e=>{for(const box of f.querySelectorAll('[name^=item_]'))box.checked=e.target.checked}});
}
async function writeProjectExport(p,rows,format){
 if(!native)throw Error('请在 Mac App 中导出。');
 const paragraphs=[],images=[],notes=[];
 const paragraph=(text,style)=>paragraphs.push({style,runs:[{text}]});
 paragraph(p.name,'Title');
 for(const row of rows){
  paragraph([p.systems.find(s=>s.id===row.system)?.name,row.title].filter(Boolean).join(' / '),'Heading1');
  if(row.manuscript){
   const doc=await manuscriptDocument(row.manuscript),imageOffset=images.length,noteOffset=notes.length;
   for(const p of doc.paragraphs){
    if(p.image){paragraphs.push({image:p.image+imageOffset});continue}
    const runs=p.runs.map(r=>r.footnote?{footnote:r.footnote+noteOffset}:r);
    paragraphs.push({...p,runs});
   }
   images.push(...doc.images);notes.push(...doc.notes);continue;
  }
  for(const line of row.text.split(/\n+/))if(line.trim())paragraph(line);
  for(const figure of row.figures){paragraph(figure.title,'Small');images.push(await figurePNG(figure.svg));paragraphs.push({image:images.length})}
 }
 send('exportResearch',{format,name:p.name,paragraphs,images,notes});
}
