'use strict';

function chooseSavedAuthor(t){
 const list=db.authors||[];
 form('添加稿件作者','<label>从常用作者选择<select name="pick">'+option('','新建作者并加入本稿',false)+list.map(a=>option(a.id,a.name+' · '+a.affiliation,false)).join('')+'</select></label>',d=>{
  if(d.pick){if(!t.authors.includes(d.pick))t.authors.push(d.pick)}
  else queueMicrotask(()=>authorForm('',t));
 },f=>{f.elements.pick.selectedIndex=list.length?1:0});
}
function researchDates(p){
 if(!p)return [];
 const dates=(p.reports||[]).filter(r=>!r.source&&r.date).map(r=>({...r,openAction:'editReport'}));
 for(const s of p.systems)for(const b of batches(s))for(const [key,label] of [['start','开始'],['end','结束']]){
  if(b[key])dates.push({id:b.id,title:b.title+' · '+label,date:b[key].slice(0,10),time:b[key].slice(11),system:s.id,openAction:'openScheduledBatch'});
 }return dates;
}
function logPanel(b){
 return '<section class="box"><div class="sect"><h2>实验记录</h2>'+btn('＋ 记录现象与问题','batchLog','primary',b.id)+'</div>'+btn('安排起止时间','batchTimes','btn',b.id)+noteBlock([b.start,b.end].filter(Boolean).join(' 至 ').replaceAll('T',' '))+(b.log||[]).map(l=>'<article class="deskItem"><small>'+esc(l.date)+'</small>'+noteBlock([l.observation&&'实验现象　'+l.observation,l.issue&&'过程问题　'+l.issue,l.deviation&&'与原方案的差异　'+l.deviation].filter(Boolean).join('\n'))+btn('编辑记录','editBatchLog','link',l.id)+'</article>').join('')+'</section>';
}
function scopeFields(selected=[],projects=db.projects){
 return '<fieldset><legend>选择体系或具体实验</legend>'+projects.map(p=>'<h3>'+esc(p.name)+'</h3>'+p.systems.map(s=>'<label class="tick"><input type="checkbox" name="scope_'+esc(s.id)+'" '+(selected.includes(s.id)?'checked':'')+'>'+esc(s.name)+'（整个体系）</label>'+batches(s).map(b=>'<label class="tick"><input type="checkbox" name="scope_'+esc(b.id)+'" '+(selected.includes(b.id)?'checked':'')+'>'+esc(s.name+' / '+b.title)+'</label>').join('')).join('')).join('')+'</fieldset>';
}
function readScope(d){const ids=Object.keys(d).filter(k=>k.startsWith('scope_')).map(k=>k.slice(6));if(!ids.length)throw Error('请选择至少一个体系或实验。');return ids}
function chosenResearch(ids,projects){
 const data=[];
 for(const p of projects)for(const s of p.systems){
  const all=ids.includes(s.id),bs=batches(s).filter(b=>all||ids.includes(b.id));
  if(!all&&!bs.length)continue;
  const research=writingResearch({project:p.id,system:s.id}),bids=new Set(bs.map(b=>b.id));
  research.experiments=research.experiments.filter(b=>bids.has(b.id));
  if(!all){delete research.sharedMeasurements;research.designs=designs(s).filter(d=>bs.some(b=>b.designId===d.id)).map(planValue);research.relationships=research.relationships.filter(r=>r.members.every(id=>bids.has(id)));research.approvedAdvice=research.approvedAdvice.filter(a=>!a.target||bids.has(a.target))}
  research.systemId=s.id;research.references=references(s).map(citationText);data.push(research);
 }if(!data.length)throw Error('所选研究已移除，请重新选择。');return data;
}
async function makeDeck(r,feedback='',base=activeDeck(r)){
 const template=feedback?base?.template:r.deckTemplate,style=reportStyle(r);
 const ai=selectedAI('deck'),research=chosenResearch(r.selection||[],db.projects);
 await flowJob(r.id,async progress=>{
  const material=JSON.stringify(research);const evidence=contextBytes(material)>16000?await digestMaterial(material,ai,{},progress,10000):research;
  const out=await flowAI('deck',ai,{title:r.title,category:r.category,notes:r.notes,research:evidence,template:style,slideTemplate:template?.name,previous:feedback?base?.slides:undefined,feedback});
  if(!Array.isArray(out.slides)||!out.slides.length)throw Error('未生成有效幻灯片。');
  const slides=out.slides.map(x=>{if(!Array.isArray(x.points)||!x.points.length)throw Error('幻灯片缺少内容。');return {role:typeof x.role==='string'?x.role:'',title:requireText(x.title,'页标题'),points:x.points.map(y=>requireText(y,'要点'))}});
  if(!db.projects.some(p=>p.reports?.includes(r)))throw Error('汇报记录已变化。');
  if(feedback&&!deckHistory(r).some(x=>x.id===base?.id))throw Error('所选版本已删除。');
  const appearance={accent:/^#?[a-f0-9]{6}$/i.test(out.accent)?out.accent.replace("#",""):"205946",fontSize:Math.max(18,Math.min(30,Number(out.fontSize)||24))};
  const rows=deckHistory(r),number=Math.max(r.lastDeckNumber||0,...rows.map(x=>x.number))+1;
  const v={id:uid(),number,date:localDay(),slides,appearance,template,notes:feedback?[...(base?.notes||[]),feedback]:[]};
  rows.push(v);r.lastDeckNumber=number;selectDeck(r,v);save();
 });
}
function thesisPage(p){
 const t=p.thesis||{},chapters=t.chapters||[];
 return '<section class="box"><div class="sect"><h2>'+esc(t.title||'学位论文')+'</h2>'+btn('设置写作要求与研究范围','thesisSettings','btn')+'</div>'+noteBlock([t.degree,t.length,t.parts,t.templateName].filter(Boolean).join('\n'))+modelSelectors('thesis')+btn(t.pending?'继续生成学位论文':'按章节生成学位论文','makeThesis','primary')+' '+esc(flowJobs.get(p.id)||'')+'</section>'+(chapters.length?'<section class="box">'+btn('提出修改要求','reviseThesis','btn')+btn('导出 Word','thesisWord','btn')+chapters.map(ch=>'<details><summary>'+esc(ch.title)+' · '+ch.body.replace(/\s/g,'').length+' 字</summary>'+noteBlock(ch.body)+'</details>').join('')+'</section>':'');
}
const thesisSections=[['研究背景与目的',1000],['材料与方法',1500],['结果与讨论',3000],['本章小结',500]];
function thesisSettings(p,startWriting=false){
 const t=p.thesis||{};let templateDocument=t.templateDocument||"";
 const selection=t.selection||p.systems.map(s=>s.id);
 const sections=p.systems.map((s,i)=>{
  const settings=t.chapterPlan?.find(ch=>ch.system===s.id),all=selection.includes(s.id);
  const numbers=thesisSections.map(([label,words],j)=>field('words_'+s.id+'_'+j,label,settings?.sections?.find(v=>v.title===label)?.words??(settings?0:words),'number')).join('');
  return '<fieldset><legend>'+esc('体系 '+(i+1)+' · '+s.name)+'</legend><label class="tick"><input type="checkbox" name="scope_'+esc(s.id)+'" '+(all?'checked':'')+'>整章采用本体系</label><details><summary>只纳入部分实验</summary>'+batches(s).map(b=>'<label class="tick"><input type="checkbox" name="scope_'+esc(b.id)+'" '+(selection.includes(b.id)?'checked':'')+'>'+esc(b.title)+'</label>').join('')+'</details><div class="chapterWords">'+numbers+'</div></fieldset>';
 }).join('');
 form('学位论文写作设置',field('title','论文题目',t.title||p.name,'text',true)+'<label>学位<select name="degree">'+['硕士','博士'].map(v=>option(v,v,t.degree===v)).join('')+'</select></label>'+'<p>一个研究体系对应一章。填写各节目标字数，填 0 即跳过该节。</p>'+sections+'<details><summary>署名、模板与其他要求（选填）</summary>'+field('length','总篇幅或学校要求',t.length)+longField('format','学校排版与格式要求',t.format)+field('templateName','模板名称',t.templateName)+'<button type="button" class="btn" id="loadTemplate">导入模板（Word 或文本）</button>'+longField('template','模板内容与示例',t.template)+'<fieldset><legend>选择常用作者</legend>'+(db.authors||[]).map(a=>'<label class="tick"><input type="checkbox" name="author_'+esc(a.id)+'" '+(t.authors?.includes(a.id)?'checked':'')+'>'+esc(a.name+' · '+a.affiliation)+'</label>').join('')+'</fieldset>'+field('newAuthor','或填写新作者署名', '')+field('affiliation','新作者工作单位','')+field('email','新作者邮箱','','email')+'</details>',d=>{
  const selection=readScope(d);
  const chapterPlan=p.systems.filter(s=>selection.includes(s.id)||batches(s).some(b=>selection.includes(b.id))).map(s=>{
   const sections=thesisSections.map(([title],j)=>({title,words:Number(d['words_'+s.id+'_'+j])}));
   if(sections.some(v=>!Number.isSafeInteger(v.words)||v.words<0)||!sections.some(v=>v.words>0))throw Error(s.name+' 请填写有效字数，至少保留一节。');
   return {system:s.id,title:s.name,sections:sections.filter(v=>v.words>0)};
  });
  const authors=(db.authors||[]).filter(a=>d['author_'+a.id]).map(a=>a.id);
  if(d.newAuthor){const a={id:uid(),name:d.newAuthor,affiliation:d.affiliation,email:d.email};(db.authors||=[]).push(a);authors.push(a.id)}
  p.thesis={...t,templateDocument,...Object.fromEntries(['title','degree','length','format','parts','template','templateName'].map(k=>[k,d[k]])),authors,selection,chapterPlan,parts:chapterPlan.map(ch=>ch.title+' · '+ch.sections.reduce((n,v)=>n+v.words,0)+' 字').join('\n')};
  if(startWriting)queueMicrotask(()=>makeThesis(p).catch(e=>toast(e.message)));
 },f=>{if(startWriting)f.querySelector('.primary').textContent='保存并生成论文';f.querySelector('#loadTemplate').onclick=async()=>{try{const x=await askBatch('thesisTemplate',{});if(!x.cancelled){templateDocument=x.document||"";f.elements.template.value=x.text;f.elements.templateName.value=x.name}}catch(e){toast(e.message)}}});
}
function thesisParts(text){
 return requireText(text,'章节安排').split(/\n/).filter(x=>x.trim()).map(line=>{const m=line.trim().match(/^(.+?)\s*[|｜:：]\s*(\d+)\s*字?$/);if(!m||+m[2]<1)throw Error('请按「章节名 | 字数」逐行填写。');return {title:m[1].trim(),words:Number(m[2])}});
}
async function makeThesis(p,feedback){
 const t=p.thesis;if(!t)throw Error('请先设置论文写作要求。');
 feedback=feedback??t.pending?.feedback??'';
 const ai=selectedAI('thesis'),research=chosenResearch(t.selection,[p]),parts=t.chapterPlan?t.chapterPlan.flatMap(ch=>ch.sections.map(v=>({...v,system:ch.system,chapter:ch.title}))):thesisParts(t.parts),authors=selectedAuthors(t);
 await flowJob(p.id,async progress=>{
  const key=contextSignature(JSON.stringify([ai,t.title,t.degree,t.length,t.format,t.template,parts,authors,research,feedback,t.revisions?.length||0]));
  if(!t.pending||t.pending.key!==key){t.pending={key,feedback,blocks:[]};save(false)}
  const cache=t.pending.digests||={};
  const chapters=[];
  for(const [index,part] of parts.entries()){
   const chunks=Math.ceil(part.words/1600),blocks=t.pending.blocks[index]||=[];
   for(let i=blocks.length;i<chunks;i++){
    progress([part.chapter,part.title].filter(Boolean).join(' / ')+' · '+(i+1)+' / '+chunks);
    const body=await writeBoundedPart(ai,{title:t.title,degree:t.degree,length:t.length,format:t.format,template:t.template,authors,research:part.system?research.filter(r=>r.systemId===part.system):research,outline:parts,chapter:part.chapter||part.title,section:part.title,part:i+1,totalParts:chunks,targetWords:Math.ceil(part.words/chunks),preceding:blocks.at(-1)?.slice(-1200),previous:feedback?(part.system?t.chapters?.find(ch=>ch.system===part.system)?.sections?.find(v=>v.title===part.title):t.chapters?.find(ch=>ch.title===part.title))?.body.slice(i*1600,(i+1)*1600):'',feedback},cache,progress);
    if(db.projects.find(x=>x.id===p.id)?.thesis!==t)throw Error('写作要求已变更，请重新生成。');
    blocks.push(body);save(false);
   }
   const body=blocks.join('\n\n');
   if(part.system){
    let chapter=chapters.find(ch=>ch.system===part.system);
    if(!chapter){chapter={system:part.system,title:part.chapter,sections:[],body:''};chapters.push(chapter)}
    chapter.sections.push({title:part.title,body});chapter.body=chapter.sections.map(s=>s.title+'\n'+s.body).join('\n\n');
   }else chapters.push({title:part.title,body});
  }
  if(db.projects.find(x=>x.id===p.id)?.thesis!==t)throw Error('写作要求已变更，请重新生成。');
  delete t.pending;t.chapters=chapters;t.draftTemplate=t.templateDocument;t.byline=authors.map(a=>[a.name,a.affiliation,a.email].filter(Boolean).join(' · '));t.draftTitle=t.title;if(feedback)(t.revisions||=[]).push(feedback);save();
 });
}
function writingAction(a,id){
 const p=proj();if(!p)return false;
 function run(fn){Promise.resolve().then(fn).catch(e=>toast(e.message))}
 function revise(fn){form('修改建议',longField('feedback','希望保留、修改或补充哪些内容？'),d=>{const v=requireText(d.feedback,'修改建议');run(()=>fn(v))})}
 if(a==='openScheduledBatch'){const s=p.systems.find(s=>batches(s).some(b=>b.id===id));if(s){view='tasks';filter=s.id;area='lab';section='';labSession(s).open=id;send('openArea',{title:systemLabel(s)+' · '+areaNames.lab});render()}return true}
 if(['batchTimes','batchLog','editBatchLog'].includes(a)){
  const b=batches(system(filter)).find(b=>b.id===id||b.log?.some(l=>l.id===id));if(!b)return true;
  if(a==='batchTimes')form('实验起止时间',field('start','开始',b.start,'datetime-local')+field('end','结束',b.end,'datetime-local'),d=>{if(!!d.start!==!!d.end||d.end<d.start)throw Error('请填写完整且有效的起止时间。');Object.assign(b,d)});
  else {const l=b.log?.find(l=>l.id===id);form('实验过程记录',longField('observation','实验现象',l?.observation)+longField('issue','过程中遇到的问题',l?.issue)+longField('deviation','与原方案不一致的地方',l?.deviation),d=>{if(!Object.values(d).some(Boolean))throw Error('请填写实验记录。');if(l)Object.assign(l,d);else(b.log||=[]).push({...d,date:localDay(),id:uid()})})}return true;
 }
 if(a==='revisePaper'){const s=system(filter),t=currentTarget(s),c=scope(),draft=t.drafts.find(d=>d.id===t.activeDraft)||t.drafts.at(-1);revise(v=>writeManuscript(c,t,v,draft));return true}
 const r=p.reports?.find(r=>r.id===id);
 if(deckAction(a,id,p))return true;
 if(r&&a==='makeDeck'){run(()=>makeDeck(r));return true}
 if(a==='thesisSettings'){thesisSettings(p);return true}
 if(a==='makeThesis'){if(p.thesis)run(()=>makeThesis(p));else thesisSettings(p,true);return true}
 if(a==='reviseThesis'){revise(v=>makeThesis(p,v));return true}
 if(a==='thesisWord'){const t=p.thesis;send('exportResearch',{format:'docx',templateDocument:t.draftTemplate,name:t.draftTitle||t.title,paragraphs:[{style:'Title',runs:[{text:t.draftTitle||t.title}]},{runs:[{text:(t.byline||[]).join('　')}]},...t.chapters.flatMap(ch=>[{style:'Heading1',runs:[{text:ch.title}]},...(ch.sections?ch.sections.flatMap(v=>[{style:'Heading2',runs:[{text:v.title}]},...v.body.split(/\n+/).map(text=>({runs:[{text}]}))]):ch.body.split(/\n+/).map(text=>({runs:[{text}]})))])]});return true}
 return false;
}
