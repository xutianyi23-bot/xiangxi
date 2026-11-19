'use strict';

let designRequest=null;
const references=s=>s.references||[];
const designs=s=>s.designs||[];
function referenceForm(id){
 const s=system(filter),r=references(s).find(x=>x.id===id);
 form(r?'编辑文献或笔记':'添加文献或笔记',field('title','标题',r?.title,'text',true)+field('kind','类别',r?.kind||'参考文献','text',true)+field('authors','作者（按发表顺序）',r?.authors)+field('journal','期刊或出版物名称',r?.journal)+field('year','年份',r?.year)+field('volume','卷',r?.volume)+field('issue','期',r?.issue)+field('pages','页码或文章号',r?.pages)+field('refType','文献类型标识（期刊 J，学位论文 D，专著 M）',r?.refType)+field('source','来源或原文件名',r?.source)+field('doi','DOI',r?.doi)+field('articleURL','文章网页或 PDF 链接',r?.articleURL,'url')+longField('remark','我的备注',r?.remark)+longField('note','调研笔记或正文摘录',r?.note),d=>{
  if(!d.title||!d.kind)throw Error('请填写标题和类别。');
  if(d.articleURL)webURL(d.articleURL);
  if(r)Object.assign(r,d);else(s.references||=[]).push({...d,id:uid()});
 });
}
function designText(p){return [['研究问题',p.question],['对照与变量',p.controls],['工作安排',p.steps],['评价指标与待核条件',p.readout],...(p.batchOutline?.length?[['分锅安排（'+p.batchOutline.length+' 锅 / 组）',p.batchOutline.map((v,i)=>(i+1)+'. '+v).join('\n')]]:[])].map(([k,v])=>k+'\n'+v).join('\n\n')}
function validateDesign(raw,allowed){
 const p={};
 for(const key of ['title','question','controls','steps','readout']){
  if(typeof raw?.[key]!=='string'||!raw[key].trim())throw Error('方案字段不完整，请重新生成。');
  p[key]=raw[key].trim();
 }
 if(!Array.isArray(raw.refs)||raw.refs.some(id=>!allowed.includes(id))||(allowed.length&&!raw.refs.length))throw Error('方案缺少有效的文献依据。');
 const outline=Array.isArray(raw.batchOutline)?raw.batchOutline:typeof raw.batchOutline==='string'?raw.batchOutline.split('\n'):[];
 return {...p,batchOutline:outline.filter(v=>typeof v==='string'&&v.trim()).map(v=>v.trim()),refs:[...new Set(raw.refs)]};
}
function scheduleDesign(state,project,systemId,design){
 const s=state.projects.find(x=>x.id===project)?.systems.find(x=>x.id===systemId);
 if(!s||!designs(s).includes(design))throw Error('研究体系已变化。');
 Object.assign(design,{submitted:true,published:{...planValue(design),version:design.version||1}});
}
const workflowStages=['background','library','designs','lab','paper'];
const areaNames={background:'背景工作',library:'文献工作',designs:'课题设计',lab:'实验工作区',paper:'论文工作区'};
const librarySections=['referenceShelf','autoDownload','manualDownload'];
const libraryNames={referenceShelf:'参考文献',autoDownload:'一键下载',manualDownload:'手动下载'};
const deskJobs=new Map(), searches=new Map(), revisionDrafts=new Map();
let activePlan='';
function workflowNav(){
 return '<nav class="workflow" aria-label="研究体系工作流程"><ol>'+workflowStages.map(id=>
  `<li><button data-a="area" data-id="${id}" ${area===id?'aria-current="step"':''}>${areaNames[id]}</button></li>`).join('')+'</ol></nav>';
}
function libraryPanel(s){
 const tab=librarySections.includes(section)?section:'referenceShelf';
 const buttons=librarySections.map(id=>`<button data-a="section" data-id="${id}" ${tab===id?'aria-current="page"':''}>${libraryNames[id]}</button>`).join('');
 return '<nav class="libraryTabs" aria-label="文献工作">'+buttons+'</nav>'+
  (tab==='referenceShelf'?referenceShelf(s):tab==='autoDownload'?batchPanel(s):manualDownloadPanel(s));
}
function scope(){return {project:db.current,system:filter}}
function locate(c){return db.projects.find(p=>p.id===c.project)?.systems.find(s=>s.id===c.system)}
function scopedKey(c){return c.project+'/'+c.system}
function noteBlock(text){return `<p class="deskNote">${esc(text)}</p>`}
function selectedAI(use){
 const p=selectedService(use),model=db.aiChoices[use]?.model;
 if(!native||!p?.models.includes(model))throw Error('请先选择服务商和模型。');
 return {provider:p.id,model};
}
function meetingPanel(s,designStage=false){
 const meetings=(designStage?s.designMeetings:s.meetings)||[];
 return `<section class="box"><div class="sect"><h2>${designStage?'和导师交流 / 组会记录':'导师交流'}</h2><div class="actions">${btn('导入录音','importAudio')}${btn('记一次交流','meeting','primary')}</div></div>${modelSelectors('summary')}
 ${[...meetings].reverse().map(m=>`<article class="deskItem"><small>${esc(m.date)}</small><h3>${esc(m.title)}</h3>${m.summary?noteBlock(m.summary):''}${m.text?`<details><summary>交流记录与转写稿</summary>${noteBlock(m.text)}</details>`:''}${m.error?noteBlock(m.error):''}<div class="actions">${m.file?btn('播放录音','playAudio','link',m.id)+btn(deskJobs.get('transcribe')?.id===m.id?'转写中…':'转写录音','transcribe','btn',m.id):''}${btn('编辑记录','meeting','btn',m.id)}${m.text?btn(deskJobs.get('summary')?.id===m.id?'总结中…':'AI 总结','summary','btn',m.id):''}</div></article>`).join('')||'<p class="empty">在这里保存一次谈话的记录或录音。</p>'}</section>`;
}
function ideaPanel(ideas=[]){
 return `<section class="box"><div class="sect"><h2>想法与创新</h2>${btn('记下想法','idea','primary')}</div>${[...ideas].reverse().map(i=>`<article class="deskItem"><small>${esc(i.date)}</small><h3>${esc(i.title)}</h3>${noteBlock(i.text)}${btn('编辑想法','idea','link',i.id)}</article>`).join('')||'<p class="empty">随时记下新的假设、观察或值得尝试的方向。</p>'}</section>`;
}
function contextPanel(s){return meetingPanel(s)+ideaPanel(s.ideas)+projectBackgroundPanel()}
function recordForm(s,id,idea){
 const list=idea?(s[area==='designs'?'designIdeas':'ideas']||=[]):(s[area==='designs'?'designMeetings':'meetings']||=[]),item=list.find(x=>x.id===id);
 form(idea?'记录想法与创新':'记录导师交流',field('title','主题',item?.title,'text',true)+field('date','记录日期',item?.date||localDay(),'date',true)+longField('text',idea?'想法、假设或创新点':'交流记录或录音转写稿',item?.text)+(idea?'':longField('summary','交流总结',item?.summary)),d=>{
  if(idea&&!d.text)throw Error('请填写想法。');
  if(item)Object.assign(item,d);else list.push({...d,id:uid()});
 });
}
function manualDownloadPanel(s){
 const state=searches.get(scopedKey(scope()))||{},refs=references(s);
 return `<section class="box"><div class="sect"><h2>查找背景文献</h2>${btn('编辑研究问题','researchGoal','link')}</div>${noteBlock(s.researchQuestion||s.goal||proj().goal)}${modelSelectors('keywords')}${libraryAccessPanel(s)}<div class="actions">${btn('按研究背景检索','smartSearch','primary')}${btn('输入检索词','searchManual')}</div>
 ${state.query?`<p class="small">检索词　${esc(state.query)}</p>`:''}${state.status?noteBlock(state.status):''}
 ${(state.rows||[]).map((r,i)=>`<article class="deskItem"><small>${esc([r.source,r.year,r.journal].filter(Boolean).join(' · '))}</small><h3>${esc(citationLine(r,i))}</h3>${r.note?`<details><summary>摘要</summary>${noteBlock(r.note)}</details>`:''}<div class="actions">${r.doi?btn('打开 DOI','resultDOI','link',i):''}${btn('获取全文','paperResult','primary',i)}${btn(refs.some(x=>samePaper(x,r))?'已收藏':'收藏文献','collect','btn',i)}</div></article>`).join('')}</section>`;
}
function paperTitleText(title){
 const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
 const source=String(title||'未命名文献').replace(/&amp;/gi,'&')
  .replace(/&(amp|lt|gt|quot|apos|nbsp);/gi,(_,name)=>entities[name.toLowerCase()]);
 return source.replace(/<(sub|sup)>([0-9+−-]+)<\/\1>/gi,(_,tag,value)=>{
  const glyphs=tag.toLowerCase()==='sub'?'₀₁₂₃₄₅₆₇₈₉₊₋':'⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻';
  return Array.from(value,ch=>glyphs['0123456789+-'.indexOf(ch==='−'?'-':ch)]).join('');
 }).replace(/<\/?(?:jats:)?(?:i|em|italic|b|bold|strong|sub|sup)>/gi,'').replace(/\s+/g,' ').trim();
}
function shortPaperTitle(title){
 const compact=paperTitleText(title),chinese=/[\u3400-\u9fff]/.test(compact),limit=chinese?30:55;
 const chars=Array.from(compact);
 if(chars.length<=limit)return compact;
 let head=chars.slice(0,limit).join('');
 if(!chinese&&head.lastIndexOf(' ')>limit/2&&!/\s/.test(chars[limit]))head=head.slice(0,head.lastIndexOf(' '));
 return head.trimEnd()+'…';
}
function referenceRow(s,r){
 const id=esc(r.id),c=scope(),open=expandedReferences.get(scopedKey(c))===r.id;
 const state=readingState(c,r),full=esc(paperTitleText(r.title));
 const dot=`<i class="readingDot ${state.color}" aria-hidden="true"></i>`;
 const mark=r.readingReport?.body&&state.color==='green'
  ?`<button class="readingMark" data-a="openReading" data-id="${id}" aria-label="AI 总结已完成，打开阅读报告" title="${esc(state.text)}">${dot}</button>`
  :`<span class="readingMark" ${state.color==='yellow'?'data-busy-reading':''} role="img" aria-label="${esc(state.text)}" title="${esc(state.text)}">${dot}</span>`;
 return `<article class="paperRow"><div class="paperLine"><input type="checkbox" data-ref-check="${id}" aria-label="选择 ${full}" ${shelfSelection(c).has(r.id)?'checked':''}><button class="paperTitle" data-a="refDetails" data-id="${id}" aria-expanded="${open}" title="${full}">${esc(citationLine(r,references(s).indexOf(r)))}</button>${mark}</div>${open?referenceDetails(s,r,state):''}</article>`;
}
function referenceDetails(s,r,state){
 const book=r.file?.toLowerCase().endsWith('.pdf');
 const meta=esc(citationLine(r,references(s).indexOf(r)));
 const notes=[['类别',r.kind],['下载来源',r.downloadSource],['我的备注',r.remark],['笔记与摘录',r.note]].filter(([,v])=>v);
 const attachment=r.file?btn(book?'打开 PDF':'打开副本','openRef','btn',r.id):
  r.pmc&&!matchPublisher(publishers(),r,s.paperPreference)?.network?btn('下载开放全文','download','btn',r.id):'';
 return `<div class="paperDetails"><h3>${esc(paperTitleText(r.title))}</h3>${meta?`<p class="small">${meta}</p>`:''}
 <div class="actions">${attachment}${!book?btn('获取全文','paperRef','btn',r.id):''}
 <button class="btn" data-a="readPaper" data-id="${esc(r.id)}" ${readingJob?'disabled':''}>${r.readingReport?.body?'重新阅读':'AI 自动阅读总结'}</button>
 ${r.readingReport?.body?btn('阅读报告','openReading','btn',r.id):''}${r.previousFile?btn('打开原资料','openPreviousRef','link',r.id):''}${r.doi?btn('打开 DOI','refDOI','link',r.id):''}
 ${btn('编辑文献与备注','ref','link',r.id)}${btn('删除','removeRef','link removeRef',r.id)}</div>
 ${state.error?`<p role="status" class="paperError">${esc(state.error)}</p>`:''}
 ${notes.length?`<details><summary>备注与资料</summary>${notes.map(([k,v])=>`<small>${k}</small>${noteBlock(v)}`).join('')}</details>`:''}</div>`;
}
function referenceShelf(s){
 const refs=references(s);
 return `<section class="box" data-shelf><div class="sect"><h2>参考文献 <span class="num">${refs.length}</span></h2><div class="actions">${btn('手动添加','ref','link')}${btn('导入文献','importRef')}</div></div>${readingToolbar(s)}
 ${refs.length?`<div class="paperList"><div class="paperHead" aria-hidden="true"><span>论文</span><span title="红色：未阅读　黄色：正在阅读　绿色：总结已完成">AI 阅读</span></div>${refs.map(r=>referenceRow(s,r)).join('')}</div>`:'<p class="empty">还没有参考文献。</p>'}</section>`;
}
function removeReference(s,id){
 const ref=references(s).find(r=>r.id===id);
 if(!ref)return;
 if(designs(s).some(p=>p.refs?.includes(id)||p.history?.some(h=>h.plan.refs?.includes(id)))){
  const {title,authors,journal,year,volume,issue,pages,doi,refType,articleURL,kind,source}=ref;
  (s.removedCitations||={})[id]={title,authors,journal,year,volume,issue,pages,doi,refType,articleURL,kind,source};
 }
 s.references=s.references.filter(r=>r.id!==id);
}
function samePaper(a,b){return !!(a.doi&&b.doi&&a.doi.toLowerCase()===b.doi.toLowerCase())||a.title.trim().toLowerCase()===b.title.trim().toLowerCase()}
function searchStart(c,query){
 if(publisherSearch(c,query))return;
 const id=uid();searches.set(scopedKey(c),{id,query,status:'正在查询 Crossref 和 Europe PMC…'});send('librarySearch',{...c,id,query,journal:locate(c)?.searchJournal||''});render();
}
function researchGoal(s){
 form('研究问题',longField('question','希望通过课题设计回答什么问题？',s.researchQuestion||s.goal||proj().goal),d=>{if(!d.question)throw Error('请填写研究问题。');s.researchQuestion=d.question});
}
function meetingContext(items=[]){
 const limit=Math.min(2400,Math.max(100,Math.floor(16000/(items.length||1))));
 return items.map(m=>({date:m.date,title:m.title,note:(m.summary||m.text||'').slice(0,limit),
  excerpt:m.summary&&m.text?m.text.slice(0,Math.floor(limit/2)):undefined}));
}
function literatureTopic(s){
 const p=proj();
 return {project:p.name,background:p.researchBackground||'',projectGoal:p.goal,question:s.researchQuestion||s.goal||p.goal,system:s.name,
  meetings:meetingContext(s.meetings),ideas:meetingContext(s.ideas)};
}
function contextForDesign(s){
 return {...literatureTopic(s),systemGoal:s.goal,designMeetings:meetingContext(s.designMeetings),designIdeas:meetingContext(s.designIdeas)};
}
function designPanel(s){
 const plans=designs(s),p=plans.find(x=>x.id===activePlan)||plans.at(-1),busy=!!designRequest;
 const list=plans.map(x=>btn(x.title,'selectPlan',x===p?'btn selectedPlan':'btn',x.id)).join('');
 const turns=(p?.history||[]).map(h=>`<details><summary>${esc(h.feedback)} · 第 ${h.version} 版</summary>${noteBlock(designText(h.plan))}${citationBlock(s,h.plan)}</details>`).join('');
 return meetingPanel(s,true)+ideaPanel(s.designIdeas)+`<section class="box"><div class="sect"><h2>研究问题</h2>${btn('编辑','researchGoal','link')}</div>${noteBlock(s.researchQuestion||s.goal||proj().goal)}${modelSelectors('design')}<div class="actions">${btn(busy?'正在生成…':'生成总体方案草案','aiDesign','primary')}${btn('手动起草','manualDesign')}</div></section>
 ${p?`<section class="box"><div class="actions planList">${list}</div><small>${p.submitted?(p.published&&p.published.version!==(p.version||1)?'有修改待重新提交':'已提交到实验区'):'草案'} · 第 ${p.version||1} 版</small><h2>${esc(p.title)}</h2>${noteBlock(designText(p))}${citationBlock(s,p)}${turns}<div class="actions">${btn('手动编辑','design','btn',p.id)}${btn(p.submitted?'重新提交到实验区':'提交到实验区','submitDesign','primary',p.id)}</div></section>
 ${`<section class="box"><h2>和 AI 修改方案</h2>${modelSelectors('design')}<label>给当前草案的修改意见<textarea id="revisionText" data-plan="${esc(p.id)}" rows="3" placeholder="例如：增加一组空白对照，并说明两组应保持一致的条件。">${esc(revisionDrafts.get(p.id)||'')}</textarea></label>${btn(busy?'正在处理…':'发送修改意见','revise','primary',p.id)}</section>`}`:'<section class="box empty">生成或手动起草后，可以在这里逐版讨论和修改。</section>'}`;
}
function designForm(id){
 const s=system(filter),p=designs(s).find(x=>x.id===id);
 const checks=references(s).map((r,i)=>`<label class="tick"><input name="r_${esc(r.id)}" type="checkbox" ${p?.refs?.includes(r.id)?'checked':''}>${esc(citationLine(r,i))}</label>`).join('');
 const body=field('title','总体方案名称',p?.title,'text',true)+longField('question','研究问题',p?.question)+longField('controls','对照与变量',p?.controls)+longField('steps','工作安排',p?.steps)+longField('readout','评价指标与待核条件',p?.readout)+`<fieldset><legend>文献依据</legend>${checks||'暂无资料'}</fieldset>`;
 form(p?'编辑草案':'手动起草',body,d=>{
  const refs=references(s).filter(r=>d['r_'+r.id]).map(r=>r.id),values=validateDesign({...d,batchOutline:p?.batchOutline,refs},refs);
  if(p)updatePlan(p,values,'手动修改');else{activePlan=uid();(s.designs||=[]).push({...values,id:activePlan,version:1})}
 });
}
function planValue(p){return Object.fromEntries(['title','question','controls','steps','readout','batchOutline','refs'].map(k=>[k,p[k]]))}
function updatePlan(p,values,feedback){
 const version=p.version||1;if(p.submitted&&!p.published)p.published={...planValue(p),version};(p.history||=[]).push({version,plan:planValue(p),feedback});Object.assign(p,values,{version:version+1});
}
function requestDesign(s,refs,request,p){
 if(designRequest)throw Error('请等待当前方案返回。');
 const excerptLimit=Math.min(8000,Math.max(300,Math.floor(36000/(refs.length||1))));
 const ai=selectedAI('design'),ctx={...scope(),refs:refs.map(r=>r.id),id:p?.id,version:p?.version||1,feedback:request};
 designRequest={...ctx};
 send('design',{...ai,context:JSON.stringify({...contextForDesign(s),request,previous:p?planValue(p):undefined,feedback:p?request:undefined,sources:refs.map(r=>({id:r.id,citation:citationText(r),title:r.title,remark:r.remark||'',reading:r.readingReport?.body?.slice(0,Math.floor(excerptLimit/2)),note:(r.note||'').slice(0,excerptLimit)}))})});render();
}
function aiDesignForm(){
 const s=system(filter),refs=references(s);
 if(!refs.length)return toast('请先在文献区收藏或导入依据。');
 if(designRequest)return toast('请等待当前方案返回。');
 const options=refs.map((r,i)=>`<label class="tick"><input type="checkbox" name="r_${esc(r.id)}" checked>${esc(citationLine(r,i))}${r.file?' · 已归档':''}</label>`).join('');
 if(!db.providers.length)return toast('请先在模型页接入服务商。');
 form('生成实验草案',modelSelectors('design')+longField('request','研究问题与设计要求',s.researchQuestion||s.goal||proj().goal)+`<fieldset><legend>发送给所选模型的文献与摘录</legend>${options}</fieldset><p class="small">同时参考课题背景、个人想法，以及背景工作和课题设计两个阶段已保存的导师交流与组会记录。</p>`,d=>{
  const selected=refs.filter(r=>d['r_'+r.id]);if(!d.request||!selected.length)throw Error('请填写设计目标并选择至少一份文献。');requestDesign(s,selected,d.request);
 },f=>f.querySelector('.primary').textContent='生成草案');
}
function receiveDesign(type,data){
 const c=designRequest;designRequest=null;if(!c)return;
 try{
  if(type==='designError')throw Error(data);
  const s=locate(c);if(!s||c.refs.some(id=>!references(s).some(r=>r.id===id)))throw Error('研究资料发生了变化，请重新生成。');
  const values=validateDesign(readReply(data),c.refs);
  if(c.id){const p=designs(s).find(x=>x.id===c.id);if(!p||(p.version||1)!==c.version)throw Error('草案已修改或提交，本次回复未覆盖现有方案。');updatePlan(p,values,c.feedback);revisionDrafts.delete(p.id)}
  else {const p={...values,id:uid(),version:1};(s.designs||=[]).push(p);if(scopedKey(scope())===scopedKey(c))activePlan=p.id}
  save();toast(c.id?'已按意见修订，上一版可展开查看。':'草案已保存。');
 }catch(e){render();toast(e.message)}
}
function deskClick(a,id){
 if(a==='area'&&view==='tasks'&&workflowStages.includes(id)){
  area=id;section=id==='library'?'referenceShelf':'';
  if(id==='lab')labSession(system(filter)).open='';
  send('openArea',{title:systemLabel(system(filter))+' · '+(typeof interfaceLabel==='function'?interfaceLabel(areaNames[id]):areaNames[id])});
  app.querySelector('.main').scrollTop=0;render();return true;
 }
 if(a==='section'&&area==='library'&&librarySections.includes(id)){
  section=id;app.querySelector('.main').scrollTop=0;render();return true;
 }
 if(view!=='tasks'||!area)return false;
 const c=scope(),s=system(filter),results=searches.get(scopedKey(c)),r=results?.rows?.[Number(id)],m=[...(s.meetings||[]),...(s.designMeetings||[])].find(x=>x.id===id),p=designs(s).find(x=>x.id===id);
 switch(a){
 case 'removeRef':{
  const ref=references(s).find(r=>r.id===id);if(!ref)break;
  form('删除这篇参考文献？',noteBlock('将从本体系移除《'+ref.title+'》及其备注。磁盘上的文件会保留。'),()=>removeReference(s,id),f=>{
   const confirm=f.querySelector('.primary');confirm.textContent='确认删除';confirm.classList.add('deleteConfirm');
  });break;
 }
 case 'importAudio':send('importAudio',{...c,id:uid(),stage:area});break;
 case 'meeting':case 'idea':recordForm(s,id,a==='idea');break;
 case 'playAudio':send('playRecording',{file:m.file});break;
 case 'transcribe':
  if(deskJobs.has(a))throw Error('已有录音正在转写。');
  deskJobs.set(a,{...c,id,text:m.text||''});send(a,{...c,id,file:m.file});render();break;
 case 'summary':case 'smartSearch':{
  const op=a==='summary'?'summary':'keywords',ai=selectedAI(op);if(deskJobs.has(op))throw Error('请等待当前请求完成。');
  const input=m?{transcript:m.text}:literatureTopic(s);
  deskJobs.set(op,{...c,id,text:m?.text});if(op==='keywords')searches.set(scopedKey(c),{status:'正在根据研究背景提取检索词…'});
  send(op,{...ai,context:JSON.stringify(input)});render();break;
 }
 case 'researchGoal':researchGoal(s);break;
 case 'searchManual':form('输入检索词',field('query','关键词或文献标题',results?.query,'text',true),d=>searchStart(c,d.query),f=>f.querySelector('.primary').textContent='检索');break;
 case 'collect':
  if(r&&!references(s).some(x=>samePaper(x,r))){(s.references||=[]).push({...r,id:uid(),kind:r.note?'文献摘要':'文献题录'});save()}break;
 case 'download':{const ref=references(s).find(x=>x.id===id);if(!ref?.pmc||ref.file||deskJobs.has('paper:'+id))break;if(matchPublisher(publishers(),ref,s.paperPreference)?.network){getPaper(ref);break}deskJobs.set('paper:'+id,c);send('downloadPaper',{...c,id,pmc:ref.pmc});render();break}
 case 'selectPlan':activePlan=id;render();break;
 case 'revise':{
  const draft=(revisionDrafts.get(id)||'').trim();if(!p||!draft)throw Error('请先输入对当前草案的修改意见。');
  requestDesign(s,references(s).filter(r=>p.refs?.includes(r.id)),draft,p);break;
 }
 case 'submitDesign':
  if(p){scheduleDesign(db,c.project,c.system,p);save();toast('总体方案已提交至实验工作区。')}break;
 default:return false;
 }
 return true;
}
function researchEvent(type,data){
 if(['summaryReply','summaryError','keywordsReply','keywordsError'].includes(type)){
  const op=type.startsWith('summary')?'summary':'keywords',c=deskJobs.get(op);deskJobs.delete(op);if(!c)return true;
  try{
   if(type.endsWith('Error'))throw Error(data);const v=readReply(data);
   if(op==='keywords'){if(typeof v.query!=='string'||!v.query.trim())throw Error('未取得检索词。');searchStart(c,v.query.trim());return true}
   const s=locate(c),m=[...(s?.meetings||[]),...(s?.designMeetings||[])].find(x=>x.id===c.id);
   if(!m||m.text!==c.text)throw Error('交流原文已修改，请重新总结。');
   if(typeof v.summary!=='string'||!v.summary.trim())throw Error('未取得有效总结。');
   m.summary=v.summary;save();toast('交流总结已保存。');
  }catch(e){if(op==='keywords')searches.set(scopedKey(c),{status:e.message});render();toast(e.message)}
  return true;
 }
 if(!['audioImported','transcribed','searchResults','paperDownloaded'].includes(type))return false;
 const s=locate(data);if(!s)return true;
 if(type==='audioImported'){(s[data.stage==='designs'?'designMeetings':'meetings']||=[]).push({id:data.id,title:data.title,file:data.file,date:localDay(),text:'',summary:''});save();toast('录音已导入，可以开始转写。')}
 if(type==='transcribed'){
  const pending=deskJobs.get('transcribe');deskJobs.delete('transcribe');const m=[...(s.meetings||[]),...(s.designMeetings||[])].find(x=>x.id===data.id);if(!m)return true;
  if(data.text&&m.text===pending?.text)m.text=data.text;
  m.error=data.error||'';save();toast(m.error||'转写完成，可校对后生成总结。');
 }
 if(type==='searchResults'){
  const st=searches.get(scopedKey(data));if(!st||st.id!==data.id)return true;
  st.rows=[];for(const r of data.rows){const old=st.rows.find(x=>samePaper(x,r));if(!old)st.rows.push(r);else{old.pmc||=r.pmc;old.note||=r.note;old.pdfURL||=r.pdfURL}}
  st.status='找到 '+st.rows.length+' 条文献'+(data.failed.length?' · '+data.failed.join('、')+' 暂时无法连接，可重新检索。':'');render();
 }
 if(type==='paperDownloaded'){
  deskJobs.delete('paper:'+data.id);const r=references(s).find(x=>x.id===data.id);
  if(data.error){render();toast(data.error)}else if(r){Object.assign(r,{file:data.file,note:[r.note,data.note].filter(Boolean).join('\n\n'),kind:'开放全文'});save();toast('全文已保存为可打开的文本副本。')}
 }
 return true;
}
