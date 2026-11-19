'use strict';

const compactName=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const paperMarkerNames={bracket:'方括号顺序编码',superscript:'上标顺序编码',parentheses:'圆括号顺序编码',authorYear:'作者与年份',footnote:'页脚注释'};
function newPaperTarget(name){return {id:uid(),name,lang:'英文',count:12,corpus:[],authors:[],drafts:[],status:''}}
function paperTargets(s){
 s.paperTargets||=[];
 if(s.journal&&!s.paperTargets.some(t=>compactName(t.name)===compactName(s.journal)))s.paperTargets.push(newPaperTarget(s.journal));
 return s.paperTargets;
}
function currentTarget(s){const ts=paperTargets(s);return ts.find(t=>t.id===s.currentTarget)||ts[0]}
function selectedAuthors(t){return (t.authors||[]).map(id=>db.authors?.find(a=>a.id===id)).filter(Boolean)}
function paperPanel(s){
 const targets=paperTargets(s),t=currentTarget(s),draft=t&&(t.drafts.find(d=>d.id===t.activeDraft)||t.drafts.at(-1));
 const evidence=measurementGroups(s).flatMap((b,i)=>b.results.map(r=>`<p><b>${b===s.sharedMeasurements?"体系级检测":batchNumber(b,i)} · ${esc(r.method)}</b>　${esc(r.text||r.sourceName)}</p>`));
 const tabs='<nav class="libraryTabs">'+[['generate','论文生成'],['revise','论文修改']].map(([key,title])=>btn(title,'paperTab',(s.paperTab||'generate')===key?'btn selectedPlan':'btn',key)).join('')+'</nav>';
 if(s.paperTab==='revise')return tabs+'<div class="actions">'+targets.map(x=>btn(x.name,'paperSelect',x===t?'btn selectedPlan':'btn',x.id)).join('')+'</div>'+reviewPanel(s,t);
 return tabs+`${(s.importedPapers||[]).map(r=>'<section class="box"><h2>'+esc(r.title)+'</h2>'+noteBlock(r.body)+btn('打开原件','paperOriginal','btn',r.id)+'</section>').join('')}<section class="box"><div class="sect"><h2>目标期刊</h2>${btn('＋ 添加目标期刊','paperNew','primary')}</div><div class="actions">${targets.map(x=>btn(x.name,'paperSelect',x===t?'btn selectedPlan':'btn',x.id)).join('')}</div></section>
 ${t?`<section class="box"><div class="sect"><h2>${esc(t.name)}</h2>${btn('期刊与排版设置','paperSettings','link')}</div><p>${esc(t.lang)} · 全文语料 ${t.corpus.length} / ${t.count}</p><p class="small">AI会自动下载对应期刊的相似论文，学习其语言、排版、绘图风格并生成对应论文</p>${modelSelectors('corpus')}<div class="actions">${btn('获取全文并学习期刊','paperLearn','primary')}${btn('补入已有全文','paperAttach','btn')}${btn('AI 查找投稿须知','paperGuide','btn')}</div>${t.guide?'<details><summary>投稿须知</summary>'+noteBlock(t.guide)+noteBlock([t.guideSource,t.guideDate].filter(Boolean).join(' · '))+'</details>':''}<p role="status">${esc(flowJobs.get('guide'+t.id)||flowJobs.get(t.id)||t.status)}</p>
 ${t.corpus.length?`<details><summary>查看语料及来源</summary>${t.corpus.map((r,i)=>`<p>${esc(citationLine(r,i))} ${btn('打开全文','paperCorpusOpen','link',r.id)}</p>`).join('')}</details>`:''}
 ${t.profile?`<details><summary>已学习的期刊格式 · ${t.profile.n} 篇</summary>${noteBlock(t.profile.guide)}${noteBlock(t.profile.sections.join(' · '))}</details>`:''}</section>`:''}
 <section class="box"><div class="sect"><h2>常用作者</h2>${btn('＋ 添加作者','paperAuthor','link')}</div>${(db.authors||[]).map(a=>`<div class="line"><b>${esc(a.name)}</b><span>${esc(a.affiliation)} · ${esc(a.email)}</span>${btn('编辑','paperAuthor','link',a.id)}</div>`).join('')||'<p class="empty">保存常用作者的署名、单位和邮箱。</p>'}</section>
 ${t?`<section class="box"><h2>生成期刊论文</h2>${modelSelectors('manuscript')}<p>署名顺序　${esc(selectedAuthors(t).map(a=>a.name).join('、')||'尚未选择作者')}</p><div class="actions">${btn('选择作者与顺序','paperByline','btn')}${btn('检索依据并生成论文','paperWrite','primary')}</div></section>`:''}
 ${draft?`<section class="box"><div class="sect"><h2>期刊稿件</h2>${btn('导出 Word 稿件','exportPaperWord','primary')}</div><div class="actions">${t.drafts.map((d,i)=>btn('第 '+(i+1)+' 稿','paperVersion',d===draft?'btn selectedPlan':'btn',d.id)).join('')}${btn('导出排版网页','exportPaperHTML','btn')}</div>${renderManuscript(draft)}${btn("填写修改建议，继续改稿","revisePaper","btn")}${draft.feedback?noteBlock(draft.feedback):""}<details><summary>核对引用证据</summary>${evidenceNotes(draft)}</details></section>`:''}
 <section class="box"><details><summary>本体系的实验依据</summary>${evidence.join('')||'<p>尚未录入检测结果。</p>'}</details></section>`;
}
function targetForm(s,t){
 const c=scope(),markers=Object.entries(paperMarkerNames).map(([k,v])=>option(k,v,t?.marker===k)).join('');
 form(t?'期刊与排版设置':'添加目标期刊',field('name','期刊全称或 ISSN',t?.name,'text',true)+
 `<label>稿件语言<select name="lang">${['英文','中文'].map(x=>option(x,x,x===(t?.lang||'英文'))).join('')}</select></label>`+
 field('count','目标语料篇数（10–15）',t?.count||12,'number',true)+longField('guide','补充投稿要求（选填）',t?.guide)+
 field('style','期刊 CSL 引文样式标识（选填）',t?.style)+`<label>正文引文及注脚<select name="marker">${option('','从期刊样本学习',!t?.marker)}${markers}</select></label>`,d=>{
  const count=Number(d.count);if(!Number.isInteger(count)||count<10||count>15)throw Error('语料篇数须为 10 至 15。');
  if(paperTargets(s).some(x=>x!==t&&compactName(x.name)===compactName(d.name)))throw Error('该期刊已经存在。');
  if(t&&t.name!==d.name)throw Error('改投其他期刊请使用「添加目标期刊」，原稿可保留。');
  if(d.style&&!/^[a-z0-9][a-z0-9-]*$/.test(d.style))throw Error('请填写 CSL 文件名中的样式标识。');
  const target=t||newPaperTarget(d.name);Object.assign(target,{...d,count});if(!t)s.paperTargets.push(target);
  s.currentTarget=target.id;if(!s.journal)s.journal=d.name;
  if(native&&(!t||count>target.corpus.length))queueMicrotask(()=>learnJournal(c,target.id));
 },f=>{if(t)f.elements.name.readOnly=true;f.elements.count.min=10;f.elements.count.max=15});
}
function authorForm(id,target){
 const a=db.authors?.find(x=>x.id===id);
 form(a?'编辑作者':'添加常用作者',field('name','署名',a?.name,'text',true)+field('english','英文署名（选填）',a?.english)+field('affiliation','工作单位',a?.affiliation,'text',true)+field('affiliationEN','英文单位（选填）',a?.affiliationEN)+field('email','邮箱',a?.email,'email'),d=>{
  if(!d.name||!d.affiliation)throw Error('请填写署名和单位。');
  if(a)Object.assign(a,d);else {const item={...d,id:uid()};(db.authors||=[]).push(item);if(target)target.authors.push(item.id)}
 });
}
function bylineForm(t){
 const list=db.authors||[];if(!list.length)return authorForm('');
 const choices=list.map(a=>`<div class="authorChoice"><label class="tick"><input type="checkbox" name="pick_${esc(a.id)}" ${t.authors.includes(a.id)?'checked':''}>${esc(a.name)}</label>${field('order_'+a.id,'顺序',t.authors.includes(a.id)?t.authors.indexOf(a.id)+1:'','number')}</div>`).join('');
 form('选择本稿作者',choices+'<label>通讯作者<select name="corresponding">'+option('','未指定',!t.corresponding)+list.map(a=>option(a.id,a.name,a.id===t.corresponding)).join('')+'</select></label>',d=>{
  const ids=list.filter(a=>d['pick_'+a.id]).sort((a,b)=>(Number(d['order_'+a.id])||999)-(Number(d['order_'+b.id])||999)).map(a=>a.id);
  if(d.corresponding&&!ids.includes(d.corresponding))throw Error('请将通讯作者勾选到署名列表。');
  t.authors=ids;t.corresponding=d.corresponding;
 });
}
function journalObject(c,id){return locate(c)?.paperTargets?.find(t=>t.id===id)}
function corpusKey(r){return (r.doi||r.pmc||r.articleURL||compactName(r.title)).toLowerCase()}
function sameJournal(t,r){return [r.verifiedJournal,r.journal,...(r.issn||'').split(',')].some(v=>v&&compactName(v)===compactName(t.name))}
function eligiblePaper(r){
 const title=(r.title||'').trim();
 return !!title && r.notice!=='yes' && !/^(?:(?:author |publisher |editorial )?(?:correction|erratum|corrigendum|retraction|withdrawal|expression of concern)(?: (?:notice|note|statement))?\s*(?:[:：–—-]|(?:of|to|for)\b)|(?:retracted|withdrawn)\s*[:：]|(?:撤稿(?:通知|声明)?|勘误|更正(?:启事|通知|声明)?)\s*[:：])/i.test(title);
}
function corpusAdd(t,r){
 if(!eligiblePaper(r)||t.corpus.length>=t.count||t.corpus.some(x=>corpusKey(x)===corpusKey(r)||samePaper(x,r)))return false;
 t.corpus.push({...r,id:uid()});return true;
}
function sampleText(pages,limit=9000){
 const body=pages.join('\n').trim();if(body.length<=limit)return body;
 const out=[];const part=Math.floor(limit/5);
 for(let i=0;i<5;i++){const start=Math.floor((body.length-part)*i/4);out.push(body.slice(start,start+part))}
 return out.join('\n[…]\n');
}
function profileFrom(out,n){
 if(!Array.isArray(out.sections)||!out.sections.length||!(out.marker in paperMarkerNames))throw Error('未能识别期刊的结构或引文格式。');
 let template=requireText(out.referenceTemplate,'参考文献格式');
 if(!template.includes('{title}')&&!template.includes('{journal}'))throw Error('参考文献格式缺少题名或期刊字段。');
 const literal=template.replace(/\{(?:authors|title|journal|year|volume|issue|pages|doi)\}/g,'').replace(/https?:\/\/(?:dx\.)?doi\.org\/|\b(?:doi|vol|no|pp|p|iss|art)\b|\[J(?:\/OL)?\]|[卷期页第]/gi,'');
 const uncertain=/[\p{L}\p{N}{}]/u.test(literal);
 if(uncertain)template=[...new Set(template.match(/\{(?:authors|title|journal|year|volume|issue|pages|doi)\}/g))].join('. ')+'.';
 return {guide:requireText(out.guide,'期刊写作要求')+(uncertain?'\n参考文献字段顺序已提取，细节标点请核对投稿须知。':''),sections:out.sections.map(s=>requireText(s,'章节名')),marker:out.marker,
  template,bibliographyNumber:['bracket','dot','parentheses','none'].includes(out.bibliographyNumber)?out.bibliographyNumber:null,
  bibliographyOrder:out.bibliographyOrder==='alphabetical'?'alphabetical':out.bibliographyOrder==='appearance'?'appearance':null,
  figureStyle:{color:/^#[a-f0-9]{6}$/i.test(out.figureStyle?.color)?out.figureStyle.color:'#1d6e57',font:out.figureStyle?.font==='serif'?'serif':'sans-serif',width:Math.min(3,Math.max(1,Number(out.figureStyle?.width)||1.6))},font:out.font==='sans'?'sans':'serif',columns:out.columns===2?2:1,n};
}
async function studyCorpus(c,t,progress){
 if(t.corpus.length<10)throw Error('已取得 '+t.corpus.length+' 篇同刊全文。补足 10 篇后即可学习。');
 const ai=selectedAI('corpus'),profiles=[];
 for(const [i,r] of t.corpus.entries()){
  progress('学习第 '+(i+1)+' / '+t.corpus.length+' 篇 · '+r.title);
  if(!r.sampleProfile){
   const pages=await askBatch('readAttachment',{file:r.file}),sample=sampleText(pages);
   if(sample.trim().length<200)throw Error('「'+r.title+'」全文文字不足，请更换有文本层的副本。');
   let image='';if(r.file.toLowerCase().endsWith('.pdf')){try{image=await askBatch('journalFigure',{file:r.file})}catch{}}
   let profile;
   if(image){try{profile=await flowAI('journalStyle',{...ai,image},{journal:t.name,title:r.title,sample,visualEvidence:'样本原始页面'})}catch{}}
   r.sampleProfile=profileFrom(profile||await flowAI('journalStyle',ai,{journal:t.name,title:r.title,sample,visualEvidence:'只有文字及图注，标明视觉细节未知'}),1);
   r.evidence=sampleText(pages,3500);save(false);
  }profiles.push(r.sampleProfile);
 }
 const style=await flowAI('journalStyle',ai,{journal:t.name,samples:profiles,authorGuidelines:t.guide});
 if(journalObject(c,t.id)!==t)throw Error('目标期刊已变化。');
 t.profile=profileFrom(style,profiles.length);t.status='已学习 '+profiles.length+' 篇同刊全文。';
}
async function institutionCorpus(c,t,catalog,progress,topic=''){
 if(!native||activeDownload||paperJob)return;
 const s=locate(c);
 const provider=matchPublisher(publishers(),{journal:t.name},s.paperPreference)||
  (/[^\x00-\x7F]/.test(t.name)?publishers().find(p=>p.id==='cnki'):null);
 if(!provider||!sessionPlatform(provider))return;
 const url=provider.search.replace('{query}',encodeURIComponent([t.name,topic].filter(Boolean).join(' ')));
 progress('在已配置的 '+provider.name+' 会话中查找同刊全文…');
 const job={c};const response=await batchPaper(job,provider,null,url);
 if(!response.rowsJSON)return;
 for(const row of JSON.parse(response.rowsJSON)){
  if(t.corpus.length>=t.count||journalObject(c,t.id)!==t||paperJob||activeDownload)break;
  const verified=catalog.find(r=>samePaper(r,row))||(sameJournal(t,row)?row:null);
  if(!verified||!eligiblePaper(verified)||t.corpus.some(x=>samePaper(x,verified)))continue;
  progress('获取同刊全文 · '+row.title);
  const out=await batchPaper(job,provider,{...row,...verified,articleURL:row.articleURL},null,provider.id==='cnki'?url:undefined);
  if(out.file){corpusAdd(t,{...verified,articleURL:row.articleURL,file:out.file});save(false)}
  if(out.limited||out.paused)break;
 }
}
async function learnJournal(c,id){
 const t=journalObject(c,id);if(!t)return;
 await flowJob(id,async progress=>{
  try{
   if(t.corpus.length<t.count){
    progress('检索「'+t.name+'」的期刊题录…');
    let rows=[];let lookupError='';
    let topic=locate(c)?.researchQuestion||locate(c)?.goal||locate(c)?.name||'';
    try{const q=await flowAI('paperQuery',selectedAI('corpus'),{system:locate(c)?.name,goal:topic});topic=q.queries?.find(v=>typeof v==='string'&&v.trim())||topic}catch{}
    try{rows=await askBatch('journalCatalog',{query:t.name,topic})}catch(e){lookupError=e.message}
    for(const r of rows){
     if(t.corpus.length>=t.count)break;
     if(!r.verifiedJournal||!eligiblePaper(r))continue;
     if(t.corpus.some(x=>samePaper(x,r)))continue;
     const known=references(locate(c)).find(x=>x.file&&samePaper(x,r));
     if(!known&&!r.pmc&&!r.pdfURL)continue;
     progress('获取同刊全文 '+(t.corpus.length+1)+' / '+t.count+' · '+r.title);
     let attachment=known;
     try{if(!attachment)attachment=await askBatch('journalFullText',{pmc:r.pmc||'',pdf:r.pdfURL||''})}catch{continue}
     if(journalObject(c,id)!==t)return;
     if(attachment?.file&&corpusAdd(t,{...r,file:attachment.file}))save(false);
    }
    if(t.corpus.length<t.count)await institutionCorpus(c,t,rows,progress,topic);
    if(!t.corpus.length&&lookupError)throw Error(lookupError);
   }
   await studyCorpus(c,t,progress);
  }catch(e){t.status=e.message;toast(e.message)}finally{save()}
 });
}
async function verifiedLocal(r){
 let match;
 if(r.doi)match=await askBatch('verifyPaper',{query:r.doi});
 else match=(await askBatch('paperEvidence',{query:r.title})).find(v=>compactName(v.title)===compactName(r.title));
 if(match&&!eligiblePaper(match))throw Error('撤稿、更正及类似通知不能作为研究论文语料或论据。');
 if(!match||compactName(match.title)!==compactName(r.title))throw Error('题名与公开题录无法匹配，请核对文献名称或 DOI。');
 return match;
}
function attachCorpus(s,t){
 const c=scope(),refs=references(s).filter(r=>r.file&&!t.corpus.some(x=>samePaper(x,r)));
 if(!refs.length)return toast('请先在文献区导入同刊全文，并填写正式题名或 DOI。');
 form('补入本体系的期刊全文',refs.map(r=>`<label class="tick"><input type="checkbox" name="ref_${esc(r.id)}">${esc(r.title)}</label>`).join(''),d=>{
  const selected=refs.filter(r=>d['ref_'+r.id]);if(!selected.length)throw Error('请选择全文。');
  if(flowJobs.has(t.id))throw Error('请等待当前期刊任务结束。');
  queueMicrotask(()=>flowJob(t.id,async progress=>{
   const issues=[];
   for(const r of selected){
    if(t.corpus.length>=t.count)break;
    try{progress('核对期刊及题名 · '+r.title);const v=await verifiedLocal(r);if(!sameJournal(t,v))throw Error('期刊不匹配');corpusAdd(t,{...v,file:r.file});save(false)}
    catch(e){issues.push(r.title+' · '+e.message)}
   }
   t.status=issues.join('\n');save();
   if(t.corpus.length>=10){await studyCorpus(c,t,progress);save()}
  }));
 });
}
function writingMeasurements(s,b,p){
 const current=b.report&&b.report.stamp===reportStamp(s,b,p)?b.report:null;
 return {results:b.results.filter(r=>!r.pendingReview).map(r=>({kind:r.kind,source:r.sourceName,method:r.method,text:r.text||r.excerpt,remark:r.remark,statistics:r.series?.stats,units:r.series?[r.series.xLabel,r.series.yLabel]:null})),report:current?.body||'',reportRemark:current?.remark||''};
}
function writingResearch(c){
 const p=db.projects.find(x=>x.id===c.project),s=locate(c);
 return {project:p.name,background:p.researchBackground||'',centralQuestion:p.goal,system:s.name,systemGoal:s.researchQuestion||s.goal,
  meetings:meetingContext([...(s.meetings||[]),...(s.designMeetings||[])]),ideas:meetingContext([...(s.ideas||[]),...(s.designIdeas||[])]),
  designs:designs(s).map(d=>({...planValue(d),submitted:!!d.submitted})),relationships:s.relations||[],
  approvedAdvice:db.tasks.filter(t=>t.meetingId&&t.project===c.project&&t.system===c.system).map(t=>({stage:t.stage,target:t.target,detail:t.detail})),
  sharedMeasurements:s.sharedMeasurements?.results.length?writingMeasurements(s,s.sharedMeasurements,p):undefined,
  experiments:batches(s).map(b=>({id:b.id,designId:b.designId,title:b.title,status:batchState(s,b,p),question:b.question,purpose:b.purpose,category:b.category,experimentLog:b.log||[],materials:b.materials,procedure:b.procedure,note:b.note,
   ...writingMeasurements(s,b,p)}))};
}
async function findEvidence(s,t,research,ai,progress){
 const pool=[],seen=new Set();
 function add(r,evidence){
  if(!eligiblePaper(r)||!(r.doi||r.pmc||r.articleURL)||!evidence?.trim())return;
  const key=corpusKey(r);if(seen.has(key))return;
  seen.add(key);pool.push({id:'R'+(pool.length+1),title:r.title,authors:r.authors,journal:r.journal,year:r.year,volume:r.volume,issue:r.issue,pages:r.pages,doi:r.doi,pmc:r.pmc,articleURL:r.articleURL,evidence:evidence.slice(0,3800)});
 }
 for(const r of references(s)){
  if(!r.note&&!r.file)continue;
  try{const v=await verifiedLocal(r);add(v,v.note||(r.file?sampleText(await askBatch('readAttachment',{file:r.file}),3600):''))}catch{continue}
 }
 progress('按研究问题检索可核对的文献依据…');
 const lookup=await flowAI('paperQuery',ai,{field:research.system,goal:research.systemGoal,background:research.background,topics:research.experiments.map(b=>b.purpose).filter(Boolean)});
 if(!Array.isArray(lookup.queries)||!lookup.queries.some(q=>typeof q==='string'&&q.trim()))throw Error('未生成可用的文献检索词。');
 let failure='';
 for(const query of lookup.queries.filter(x=>typeof x==='string'&&x.trim()).slice(0,3)){
  try{const rows=await askBatch('paperEvidence',{query});for(const r of rows)add(r,r.note)}catch(e){failure=e.message}
 }
 for(const r of t.corpus)add(r,r.note||r.evidence);
 if(!pool.length)throw Error(failure||'尚无可核验且带摘要或全文的参考文献。');
 return pool;
}
function verifyParagraphs(raw,sources){
 if(!Array.isArray(raw)||!raw.length)throw Error('模型缺少章节正文。');
 return raw.map(paragraph=>{
  if(!Array.isArray(paragraph)||!paragraph.length)throw Error('段落结构无效。');
  return paragraph.map(segment=>{
   const text=requireText(segment.text,'正文');
   if(/\[\s*(?:R?\d+[\s,，–-]*)+\]|\b10\.\d{4,9}\/\S+/i.test(text))throw Error('正文包含未绑定的引文编号或 DOI。');
   if(!Array.isArray(segment.refs))throw Error('缺少引文映射。');
   const refs=segment.refs.map(ref=>{
    const source=sources.find(r=>r.id===ref.id),quote=requireText(ref.quote,'引用依据');
    if(!source||quote.length<8||!source.evidence.replace(/\s+/g,' ').includes(quote.replace(/\s+/g,' ')))throw Error('引文未能对应真实资料中的原句。');
    return {id:source.id,quote};
   });return {text,refs};
  });
 });
}
function fallbackEntry(s,template){
 const fields={...s,doi:s.doi||''};
 if(!fields.doi)template=template.replace(/(?:https?:\/\/(?:dx\.)?doi\.org\/|doi\s*:\s*)?\{doi\}/ig,'');
 return template.replace(/\{(authors|title|journal|year|volume|issue|pages|doi)\}/g,(_,k)=>fields[k]||'')
  .replace(/\(\s*\)|\[\s*\]/g,'').replace(/\s+([,.:])/g,'$1').replace(/[,.:](?:\s*[,.:])+(?=\s|$)/g,m=>m.endsWith('.')?'.':m[0])
  .replace(/^[\s.,:]+|[\s,:]+$/g,'').trim();
}
function journalSettings(t){
 return JSON.stringify([t.lang,t.guide,t.style,t.marker,t.profile,t.corresponding,selectedAuthors(t)]);
}
async function writeManuscript(c,t,feedback="",previous=null){
 const s=locate(c),ai=selectedAI('manuscript'),authors=selectedAuthors(t).map(a=>({...a,corresponding:t.corresponding===a.id}));
 if(!authors.length)throw Error('请先选择本稿作者。');
 if(!t.profile||t.profile.n<10)throw Error('请先完成至少 10 篇目标期刊全文的学习。');
 const settings=journalSettings(t),research=writingResearch(c);if(!research.experiments.some(b=>b.results.length)&&!research.sharedMeasurements?.results.length)throw Error('请先添加单锅或体系的检测结果。');
 await flowJob(t.id,async progress=>{
  try{
   const sources=await findEvidence(s,t,research,ai,progress);
   const journal={name:t.name,lang:t.lang,guidelines:t.guide,profile:t.profile};
   const context={journal,research,feedback,previous:previous?{title:previous.title,abstract:previous.abstract,sections:previous.sections}:null},sourceBudget=Math.max(450,Math.min(1700,Math.floor(31000/sources.length)));
   const shortSources=sources.map(r=>({id:r.id,title:r.title,evidence:r.evidence.slice(0,sourceBudget)}));
   progress('按目标期刊规划标题、摘要及章节…');
   const outline=await flowAI('paperOutline',ai,context);
   const title=requireText(outline.title,'论文标题'),abstract=requireText(outline.abstract,'摘要');
   if(!Array.isArray(outline.sections)||outline.sections.length<2||outline.sections.length>16)throw Error('缺少有效的期刊章节安排。');
   const sections=[];
   for(const heading of outline.sections){
    requireText(heading,'章节名');progress('撰写并核验 · '+heading);let paragraphs,problem='';
    for(let attempt=0;attempt<2;attempt++){
     const block=await flowAI('paperSection',ai,{...context,outline,heading,sources:shortSources,correction:problem});
     try{paragraphs=verifyParagraphs(block.paragraphs,shortSources);break}catch(e){problem=e.message}
    }
    if(!paragraphs)throw Error(heading+' · '+problem);
    sections.push({heading,paragraphs});
   }
   const used=[...new Set(sections.flatMap(s=>s.paragraphs.flatMap(p=>p.flatMap(v=>v.refs.map(r=>r.id)))))];
   if(!used.length)throw Error('稿件未实际引用任何已核验文献，请重新生成。');
   const refs=[];
   for(const id of used){
    const r=sources.find(r=>r.id===id);let entry='';
    if(t.style&&r.doi)entry=await askBatch('formatDOI',{query:r.doi,style:t.style,lang:t.lang});
    refs.push({...r,entry:entry?entry.replace(/^\s*(?:\[1\]|1[.)])\s*/,''):fallbackEntry(r,t.profile.template)});
   }
   if(journalObject(c,t.id)!==t||settings!==journalSettings(t)||JSON.stringify(writingResearch(c))!==JSON.stringify(research))throw Error('期刊设置、署名或研究资料已变化，请按最新资料生成。');
   const draft={id:uid(),date:localDay(),journal:t.name,lang:t.lang,feedback,authors,title,abstract,keywords:Array.isArray(outline.keywords)?outline.keywords.filter(v=>typeof v==='string'):[],sections,refs,marker:t.marker||t.profile.marker,columns:t.profile.columns,font:t.profile.font,model:ai.model,
    bibliographyNumber:t.profile.bibliographyNumber,bibliographyOrder:t.profile.bibliographyOrder,
    figures:measurementGroups(s).flatMap(b=>b.results.filter(r=>(r.series||r.preview)&&!r.pendingReview).map(r=>({title:b.title+' · '+r.method,svg:spectrumFigure(r,t.profile.figureStyle)})))};
   if(draft.bibliographyOrder==='alphabetical'||(!draft.bibliographyOrder&&draft.marker==='authorYear')){
    refs.sort((a,b)=>[a.authors,a.year,a.title].join(' ').localeCompare([b.authors,b.year,b.title].join(' '),t.lang==='中文'?'zh':'en'));
   }
   t.drafts.push(draft);t.activeDraft=draft.id;t.status='稿件已保存 · '+localDay();save();
  }catch(e){t.status=e.message;save();throw e}
 });
}
function refAuthorYear(r){
 const first=(r.authors||'').split(/,|，|;/)[0].trim(),name=/[\u3400-\u9fff]/.test(first)?first:first.split(/\s+/)[0];
 return [name||r.title,r.year].filter(Boolean).join(', ');
}
function citeRun(d,ids){
 const refs=ids.map(id=>d.refs.find(r=>r.id===id)).filter(Boolean),numbers=refs.map(r=>d.refs.indexOf(r)+1).join(', ');
 if(d.marker==='authorYear')return ' ('+refs.map(refAuthorYear).join('; ')+')';
 if(d.marker==='parentheses')return '('+numbers+')';if(d.marker==='superscript')return numbers;return '['+numbers+']';
}
function numberedEntry(d,r,i){
 const style=d.bibliographyNumber||({parentheses:'parentheses',superscript:'dot',authorYear:'none',footnote:'none'}[d.marker]||'bracket');
 const n=i+1,prefix=style==='none'?'':style==='dot'?n+'. ':style==='parentheses'?'('+n+') ':'['+n+'] ';
 return prefix+r.entry;
}
function formattedAuthors(d){return d.authors.map(a=>({name:d.lang==='英文'?a.english||a.name:a.name,affiliation:d.lang==='英文'?a.affiliationEN||a.affiliation:a.affiliation,email:a.email,corresponding:a.corresponding}))}
function renderManuscript(d){
 let foot=0;const notes=[];
 const sections=d.sections.map(s=>'<section><h3>'+esc(s.heading)+'</h3>'+s.paragraphs.map(p=>'<p>'+p.map(v=>{
  const ids=[...new Set(v.refs.map(r=>r.id))];let marker='';
  if(ids.length){
   if(d.marker==='footnote'){notes.push(ids.map(id=>d.refs.find(r=>r.id===id).entry).join('；'));marker='<sup><a href="#note-'+(++foot)+'">'+foot+'</a></sup>'}
   else{const m=esc(citeRun(d,ids));marker=d.marker==='superscript'?'<sup>'+m+'</sup>':m}
  }return esc(v.text)+marker;
 }).join(d.lang==='英文'?' ':'')+'</p>').join('')+'</section>').join('');
 const en=d.lang==='英文',authors=formattedAuthors(d);
 return `<article class="manuscript ${d.font==='sans'?'sans':''}"><h2>${esc(d.title)}</h2><p>${esc(authors.map(a=>a.name+(a.corresponding?' *':'')).join(', '))}</p><p class="affiliations">${authors.map(a=>esc([a.name,a.affiliation,a.email].filter(Boolean).join(' · '))).join('<br>')}</p><h3>${en?'Abstract':'摘要'}</h3>${noteBlock(d.abstract)}<p>${esc(d.keywords.join(en?', ':'；'))}</p><div class="journalBody cols${d.columns}">${sections}</div>${d.figures.map((f,i)=>'<div><b>'+(en?'Figure ':'图 ')+(i+1)+' · '+esc(f.title)+'</b>'+f.svg+'</div>').join('')}
 ${notes.length?'<h3>'+(en?'Notes':'注释')+'</h3>'+notes.map((n,i)=>'<p id="note-'+(i+1)+'"><sup>'+(i+1)+'</sup> '+esc(n)+'</p>').join(''):''}
 <h3>${en?'References':'参考文献'}</h3>${d.refs.map((r,i)=>'<p>'+esc(numberedEntry(d,r,i))+'</p>').join('')}</article>`;
}
function evidenceNotes(d){
 return d.sections.map(s=>s.paragraphs.flatMap(p=>p.flatMap(v=>v.refs.map(ref=>{
  const r=d.refs.find(x=>x.id===ref.id);
  return `<p><b>${esc(s.heading)} · ${esc(r.title)}</b><br>${esc(v.text)}<br>“${esc(ref.quote)}”<br>${esc(r.doi||r.pmc||r.articleURL)}</p>`;
 }))).join('')).join('');
}
const articleStyles='body{max-width:880px;margin:3em auto;font:12pt Georgia,"Songti SC",serif;line-height:1.55;color:#19231e}h2{font-size:1.65em}h3{break-after:avoid}.deskNote{white-space:pre-line}.spectrum{break-inside:avoid}svg{max-width:100%;width:580px}.sans{font-family:Arial,"PingFang SC",sans-serif}.cols2{column-count:2;column-gap:2em}.affiliations,figcaption{font-size:10pt}@media(max-width:650px){.cols2{column-count:1}}';
function exportArticle(name,body){
 if(!native)return toast('请在 Mac App 中导出。');
 send('exportResearch',{format:'html',name,html:'<!doctype html><html><head><meta charset="utf-8"><title>'+esc(name)+'</title><style>'+articleStyles+'</style></head><body>'+body+'</body></html>'});
}
function manuscriptClick(a,id){
 if(a==='paperTab'||a.startsWith('review'))return reviewClick(a,id,system(filter),currentTarget(system(filter)));
 if(a==='paperGuide'){const t=currentTarget(system(filter));if(t)void searchGuide(scope(),t).catch(e=>toast(e.message));return true}
 if(a==='paperOriginal'){const row=system(filter)?.importedPapers?.find(x=>x.id===id);if(row)send('openReference',{file:row.file});return true}
 if(!['paperNew','paperSettings','paperSelect','paperLearn','paperAttach','paperCorpusOpen','paperAuthor','paperByline','paperWrite','paperVersion','exportPaperHTML','exportPaperWord','journal'].includes(a))return false;
 const s=system(filter),t=currentTarget(s),c=scope();
 if(a==='paperNew'||a==='journal')targetForm(s,null);
 if(a==='paperSelect'){s.currentTarget=id;save()}
 if(a==='paperAuthor'){if(!id&&t&&(db.authors||[]).length)chooseSavedAuthor(t);else authorForm(id,id?null:t)}
 if(!t)return true;
 if(a==='paperSettings')targetForm(s,t);
 if(a==='paperVersion'){t.activeDraft=id;save()}
 if(a==='paperLearn')void learnJournal(c,t.id);
 if(a==='paperAttach')attachCorpus(s,t);
 if(a==='paperCorpusOpen'){const r=t.corpus.find(r=>r.id===id);if(r)send('openReference',{file:r.file})}
 if(a==='paperByline')bylineForm(t);
 if(a==='paperWrite')void writeManuscript(c,t).catch(e=>toast(e.message));
 const d=t.drafts.find(x=>x.id===t.activeDraft)||t.drafts.at(-1);
 if(a==='exportPaperHTML'&&d)exportArticle(d.title,renderManuscript(d));
 if(a==='exportPaperWord'&&d)void exportWord(d).catch(e=>toast(e.message));
 return true;
}

async function figurePNG(html){
 const box=document.createElement('div');box.innerHTML=html;
 const svg=box.querySelector('svg'),original=box.querySelector('img');if(!svg&&!original)throw Error('图形数据无效。');
 const image=new Image();image.src=original?original.src:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(svg));
 await image.decode();const canvas=document.createElement('canvas');canvas.width=original?image.naturalWidth:1220;canvas.height=original?image.naturalHeight:472;
 canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return {data:canvas.toDataURL('image/png').split(',')[1],width:canvas.width,height:canvas.height};
}
async function manuscriptDocument(d){
 const en=d.lang==='英文',paragraphs=[],notes=[],images=[];
 function para(text,style){paragraphs.push({style,runs:[{text}]})}
 para(d.title,'Title');const authors=formattedAuthors(d);
 para(authors.map(a=>a.name+(a.corresponding?' *':'')).join(', '),'Authors');
 for(const a of authors)para([a.name,a.affiliation,a.email].filter(Boolean).join(' · '),'Small');
 para(en?'Abstract':'摘要','Heading1');para(d.abstract);para(d.keywords.join(en?', ':'；'),'Small');
 for(const s of d.sections){
  para(s.heading,'Heading1');
  for(const p of s.paragraphs){
   const runs=[];p.forEach((v,index)=>{
    runs.push({text:(en&&index?' ':'')+v.text});const ids=[...new Set(v.refs.map(x=>x.id))];if(!ids.length)return;
    if(d.marker==='footnote'){notes.push(ids.map(id=>d.refs.find(x=>x.id===id).entry).join('; '));runs.push({footnote:notes.length})}
    else runs.push({text:citeRun(d,ids),sup:d.marker==='superscript'});
   });paragraphs.push({runs});
  }
 }
 for(const [i,figure] of d.figures.entries()){
  images.push(await figurePNG(figure.svg));paragraphs.push({image:i+1});para((en?'Figure ':'图 ')+(i+1)+' · '+figure.title,'Small');
 }
 para(en?'References':'参考文献','Heading1');
 d.refs.forEach((r,i)=>para(numberedEntry(d,r,i)));
 return {name:d.title,paragraphs,notes,images,columns:d.columns,font:d.font};
}
async function exportWord(d){
 if(!native)throw Error('请在 Mac App 中导出 Word。');
 send('exportResearch',{format:'docx',...await manuscriptDocument(d)});
}
