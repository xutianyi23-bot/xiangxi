'use strict';

const shelfSelections=new Map();
let readingJob=null;
const readingErrors=new Map(),expandedReferences=new Map();
let readingSettingsOpen=false;
function shelfSelection(c){
 const key=scopedKey(c);
 if(!shelfSelections.has(key))shelfSelections.set(key,new Set());
 return shelfSelections.get(key);
}
const readingLimit=12000, noteLimit=2000;
function readingChunks(pages,isPDF){
 const chunks=[],limit=readingLimit,missing=[];
 let buf='';
 pages.forEach((raw,i)=>{
  if(!raw.trim()){missing.push(i+1);return}
  const tag=isPDF?'[PDF 第 '+(i+1)+' 页]':'[正文]';
  for(let pos=0;pos<raw.length;pos+=limit-100){
   const part=tag+'\n'+raw.slice(pos,pos+limit-100)+'\n';
   if(buf&&buf.length+part.length>limit){chunks.push(buf);buf=''}
   buf+=part;
  }
 });
 if(buf)chunks.push(buf);
 return {chunks,missing};
}
async function readPaper(r,ai,progress){
 if(!r.file)throw Error('请先下载或导入论文全文。');
 const pages=await askBatch('readAttachment',{file:r.file});
 const isPDF=r.file.toLowerCase().endsWith('.pdf');
 const {chunks,missing}=readingChunks(pages,isPDF);
 async function ask(phase,material){
  const result=await askBatch('readingAI',{...ai,context:JSON.stringify({phase,title:r.title,material})});
  if(typeof result!=='string'||!result.trim())throw Error('模型没有返回阅读结果。');
  return result.trim();
 }
 if(!chunks.length)throw Error('没有可提取的正文。');
 let groups=chunks,level=0,body;
 while(groups.length>1){
  const notes=[];
  let needsSections=false;
  for(const [i,part] of groups.entries()){
   progress((level?'合并证据':'提取证据')+' '+(i+1)+' / '+groups.length);
   let note=await ask(level?'merge':'extract',part);
   if(note.length>noteLimit){
    progress('精简第 '+(i+1)+' 段证据');
    note=await ask('condense',note.length<=readingLimit?note:part);
   }
   if(note.length>noteLimit){needsSections=true;break}
   notes.push(note);
  }
  if(needsSections){
   // A verbose model can still report on every original section in full.
   const reports=[];
   for(const [i,part] of chunks.entries()){
    progress('整理分段报告 '+(i+1)+' / '+chunks.length);
    const tags=[...part.matchAll(/^\[PDF 第 (\d+) 页\]$/gm)].map(m=>m[1]);
    const range=tags.length?' · PDF 第 '+[...new Set([tags[0],tags.at(-1)])].join('–')+' 页':'';
    reports.push('第 '+(i+1)+' 部分'+range+'\n'+await ask('sectionReport',part));
   }
   body='按原文顺序整理，共 '+reports.length+' 部分。\n\n'+reports.join('\n\n');break;
  }
  // Each note is at most 2,000 characters, so each level strictly reduces the group count.
  groups=[];let group='';
  for(const note of notes){
   if(group.length+2+note.length>readingLimit){groups.push(group);group=''}
   group=group?group+'\n\n'+note:note;
  }
  if(group)groups.push(group);
  level++;
 }
 if(!body){progress('整理阅读报告');body=await ask('report',groups[0])}
 return {body,sourceFile:r.file,date:new Date().toISOString(),model:ai.model,provider:ai.provider,pages:isPDF?pages.length:0,missing};
}
function readingState(c,r){
 const key=scopedKey(c),error=readingErrors.get(key)?.get(r.id)||'';
 if(readingJob?.key===key&&readingJob.current===r.id)return {color:'yellow',text:'AI 正在阅读'+(readingJob.stage?' · '+readingJob.stage:''),error:''};
 const complete=r.readingReport?.body&&(!r.readingReport.sourceFile||r.readingReport.sourceFile===r.file);
 const label=complete?'AI 总结已完成':'AI 未阅读';
 return {color:complete?'green':'red',text:error?label+' · '+error:label,error};
}
function shelfRefresh(){
 if(view==='tasks'&&area==='library'&&section==='referenceShelf')render();
}
async function readSelection(c,ids){
 if(readingJob)throw Error('已有阅读任务进行中。');
 const ai=selectedAI('reading'),key=scopedKey(c);
 if(!ids.length)return;
 if(!readingErrors.has(key))readingErrors.set(key,new Map());
 const errors=readingErrors.get(key);
 readingJob={key,current:null};
 try{
  for(const id of ids){
   const ref=references(locate(c)||{}).find(r=>r.id===id);
   if(!ref)continue;
   const snapshot={...ref};
   readingJob.current=id;readingJob.stage='';errors.delete(id);shelfRefresh();
   try{
    const report=await readPaper(snapshot,ai,stage=>{
     readingJob.stage=stage;
     const mark=document.querySelector('[data-busy-reading]');
     if(mark?.setAttribute){const label=readingState(c,ref).text;mark.title=label;mark.setAttribute('aria-label',label)}
    });
    const current=references(locate(c)||{}).find(r=>r.id===id);
    if(!current||current.file!==snapshot.file)throw Error('原文献已移除或更换。');
    current.readingReport=report;save(false);
   }catch(err){errors.set(id,err.message)}
  }
 }finally{readingJob=null;shelfRefresh()}
}
function readingToolbar(s){
 const refs=references(s),sel=shelfSelection(scope()),count=refs.filter(r=>sel.has(r.id)).length;
 return `<div class="actions shelfTools"><label class="tick"><input type="checkbox" data-ref-all ${refs.length&&count===refs.length?'checked':''}>全选</label><button class="btn" data-a="readSelected" ${!count||readingJob?'disabled':''}>批量 AI 阅读${count?'（'+count+'）':''}</button><button class="link removeRef" data-a="deleteSelected" ${!count?'disabled':''}>批量删除</button><button class="link readingSettings" data-a="readingSettings" aria-expanded="${readingSettingsOpen}">阅读模型</button></div>
 ${readingSettingsOpen?modelSelectors('reading'):''}`;
}
function readingChange(t){
 if(!t.matches('[data-ref-check],[data-ref-all]'))return false;
 const set=shelfSelection(scope());
 const ids=t.hasAttribute('data-ref-all')?references(system(filter)).map(r=>r.id):[t.dataset.refCheck];
 for(const id of ids){if(t.checked)set.add(id);else set.delete(id)}
 render();return true;
}
function readingAction(a,id){
 if(a==='readingSettings'){readingSettingsOpen=!readingSettingsOpen;render();return true}
 if(a==='refDetails'){const key=scopedKey(scope());expandedReferences.set(key,expandedReferences.get(key)===id?'':id);render();return true}
 if(!['readPaper','readSelected','deleteSelected','openReading'].includes(a))return false;
 const c=scope(),s=locate(c),refs=references(s),sel=shelfSelection(c);
 const picked=refs.filter(r=>sel.has(r.id)),ref=refs.find(r=>r.id===id);
 if(a==='readPaper'||a==='readSelected'){
  const ids=a==='readPaper'?[id]:picked.map(r=>r.id);
  if(!selectedService('reading')?.models.includes(db.aiChoices.reading?.model)){readingSettingsOpen=true;render()}
  void readSelection(c,ids).catch(err=>toast(err.message));
 }else if(a==='deleteSelected'&&picked.length){
  form('删除选中的 '+picked.length+' 篇文献？',noteBlock('将移除所选条目、备注和阅读报告。磁盘上的附件副本会保留。'),()=>{
   for(const r of picked){removeReference(s,r.id);sel.delete(r.id)}
  },f=>{f.querySelector('.primary').textContent='确认批量删除';f.querySelector('.primary').classList.add('deleteConfirm')});
 }else if(a==='openReading'&&ref?.readingReport){
  const r=ref.readingReport;
  dialog.innerHTML=`<h2>AI 阅读报告</h2><h3>${esc(citationLine(ref,references(system(filter)).indexOf(ref)))}</h3><p class="small">${esc(r.model)} · ${esc(new Date(r.date).toLocaleString())}${r.pages?' · PDF 共 '+r.pages+' 页':''}</p>${r.missing?.length?noteBlock('未提取到文字的页码：'+r.missing.join('、')):''}${noteBlock(r.body)}<button class="btn" id="closeReading">关闭</button>`;
  dialog.showModal();dialog.querySelector('#closeReading').onclick=()=>dialog.close();
 }
 return true;
}
