// Copyright © 2026 徐天翼（笔名：鸡腿堡）
// SPDX-License-Identifier: GPL-3.0-only
'use strict';

let pendingImport=null,importBusy=false;
const importAreas={background:'课题背景',idea:'想法与创新',meeting:'导师交流',design:'课题设计',experiment:'实验记录',reference:'参考文献',reagent:'试剂归档',task:'任务与安排',paper:'论文草稿'};
function importMeter(){
 const s=pendingImport;if(!s||!importBusy||!s.controller)return '';
 if(s.scanning)return '<div class="importMeter"><progress></progress><span>读取文件</span>'+btn('终止','stopImport','link')+'</div>';
 const n=s.files.filter(f=>f.done).length;
 return '<div class="importMeter"><progress value="'+n+'" max="'+(s.files.length||1)+'"></progress><span>'+n+' / '+s.files.length+'</span>'+btn('终止','stopImport','link')+'</div>';
}
function confirmStopImport(){
 const s=pendingImport;if(!s?.controller)return;
 s.confirmingStop=true;dialog.addEventListener('close',()=>{s.confirmingStop=false;if(pendingImport===s&&!importBusy)reviewWorkspace()},{once:true});
 form('终止本次导入？',noteBlock('已选择的原文件将保留。'),()=>{
  if(s!==pendingImport)return;s.controller.abort();pendingImport=null;if(s.session)void askBatch('discardWorkspace',{session:s.session}).catch(e=>toast(e.message));render();
 },f=>f.querySelector('.primary').textContent='确认终止');
}
function projectEntry(){
 form('添加课题','<label>课题来源<select name="mode">'+option('new','新课题',!pendingImport)+option('existing',pendingImport?'继续导入已有课题':'已有课题',!!pendingImport)+'</select></label>',d=>queueMicrotask(()=>d.mode==='new'?projectForm(false):importSetup()),f=>f.querySelector('.primary').textContent='下一步');
}
function importSetup(){
 if(importBusy)return toast('正在整理已有课题，请稍候。');
 if(pendingImport)return reviewWorkspace();
 form('导入已有课题',modelSelectors('workspaceImport')+'<p>当前功能当内容较多时速度较慢，建议选择工作速度较快的大模型。选择文件夹或 ZIP 后可核对整理结果。</p>',()=>{
  const ai=selectedAI('workspaceImport');queueMicrotask(()=>startWorkspace(ai).catch(e=>toast(e.message)));
 },f=>f.querySelector('.primary').textContent='选择文件夹或压缩包');
}
async function startWorkspace(ai){
 if(importBusy)return;importBusy=true;
 try{
  const stage={scanning:true,controller:new AbortController()};pendingImport=stage;render();
  let input;try{input=await askBatch('chooseWorkspace',{},stage.controller.signal)}finally{if(pendingImport===stage)pendingImport=null}
  if(input.cancelled||stage.controller.signal.aborted)return;
  if(!input.files.length){await askBatch('discardWorkspace',{session:input.session});throw Error('所选资料中没有支持的文件，请重新选择。')}
  pendingImport={...input,ai,items:[],files:input.files.map(f=>({...f,done:false})),cache:{}};
  await classifyWorkspace(pendingImport);
 }finally{importBusy=false;if(pendingImport&&!pendingImport.confirmingStop)reviewWorkspace()}
}
async function classifyWorkspace(state){
 const controller=state.controller=new AbortController(),signal=controller.signal;
 try{await flowJob('workspaceImport',async progress=>{
  for(const [i,file] of state.files.entries()){
   if(signal.aborted)return;if(file.done)continue;progress('整理已有课题');
   let body='';
   try{body=await askBatch('readWorkspace',{session:state.session,id:file.id},signal)}catch(e){file.warning=e.message}
   if(signal.aborted)return;
   if(!body.trim()){
    state.items.push({file:file.id,system:'待整理',area:'reference',title:file.title,note:'',source:file.path});file.done=true;continue;
   }
   const chunks=textPieces(body,5400);
   for(let part=file.nextPart||0;part<chunks.length;part++){
    const known=Array.from(new Set(state.items.map(x=>x.system))).slice(-32).map(name=>Array.from(name).slice(0,100).join(''));
    if(signal.aborted)return;
    const out=await flowAI('workspaceImport',state.ai,{source:file.path,material:chunks[part],part:part+1,total:chunks.length,systems:known},signal);if(signal.aborted)return;
    if(!Array.isArray(out.records))throw Error('未取得文件的分类结果，可继续整理。');
    const rows=out.records.map(x=>({file:file.id,system:requireText(x.system,'体系名称'),area:Object.hasOwn(importAreas,x.area)?x.area:'reference',title:requireText(x.title,'记录名称'),note:typeof x.note==='string'?x.note:'',fields:x.fields&&typeof x.fields==='object'?x.fields:{},source:file.path}));
    for(const row of rows){
     const same=state.items.find(r=>r.file===row.file&&r.system===row.system&&r.area===row.area&&r.title===row.title);
     if(!same){state.items.push(row);continue}
     if(row.note&&!same.note.includes(row.note))same.note=[same.note,row.note].filter(Boolean).join('\n');
     for(const [key,value] of Object.entries(row.fields))if(!same.fields[key])same.fields[key]=value;
    }
    file.nextPart=part+1;
   }
   if(!state.items.some(r=>r.file===file.id))state.items.push({file:file.id,system:'待整理',area:'reference',title:file.title,note:'',source:file.path});
   file.done=true;render();
  }
 })}finally{delete state.controller}
}
function reviewWorkspace(){
 const state=pendingImport;if(!state)return;
 const edits=state.review||{};
 const ready=state.files.every(f=>f.done),status=state.files.filter(f=>f.done).length+' / '+state.files.length;
 const skipped=[...state.skipped,...state.files.filter(f=>f.warning).map(f=>f.path+' · '+f.warning)];
 form('核对导入内容',field('name','课题名称',state.name,'text',true)+field('goal','核心科学问题',state.goal)+noteBlock(status)+'<div class="actions"><button type="button" class="btn" id="dropImport">放弃本次导入</button></div>'+
 (skipped.length?'<details><summary>跳过或无法提取正文的文件（'+skipped.length+'）</summary>'+noteBlock(skipped.join('\n'))+'</details>':'')+
 state.items.map((r,i)=>'<fieldset><legend>'+esc(r.source)+'</legend><label class="tick"><input type="checkbox" name="use_'+i+'" checked>导入这条记录</label>'+field('sys_'+i,'研究体系',r.system)+field('title_'+i,'记录名称',r.title)+'<label>归入<select name="area_'+i+'">'+Object.entries(importAreas).map(([k,v])=>option(k,v,r.area===k)).join('')+'</select></label>'+longField('note_'+i,'资料内容',r.note)+'</fieldset>').join(''),d=>{
  state.name=d.name;state.goal=d.goal;state.review={...d};
  if(!ready){queueMicrotask(async()=>{if(importBusy)return;importBusy=true;try{await classifyWorkspace(state)}finally{importBusy=false;if(pendingImport&&!pendingImport.confirmingStop)reviewWorkspace()}});return}
  named(d.name,db.projects);const items=state.items.flatMap((r,i)=>d['use_'+i]?[{...r,system:requireText(d['sys_'+i],'研究体系'),title:requireText(d['title_'+i],'记录名称'),area:d['area_'+i],note:d['note_'+i]}]:[]);
  if(!items.length)throw Error('请至少选择一条资料。');
  queueMicrotask(()=>commitImportedProject(state,items).catch(e=>{toast(e.message);reviewWorkspace()}));
 },f=>{
  for(const [i] of state.items.entries())if(Object.hasOwn(edits,'title_'+i)){
   for(const key of ['sys_','title_','area_','note_'])f.elements.namedItem(key+i).value=edits[key+i]||'';
   f.elements.namedItem('use_'+i).checked=!!edits['use_'+i];
  }
  f.querySelector('.primary').textContent=ready?'确认创建课题':'继续 AI 整理';
  f.querySelector('#dropImport').onclick=()=>{pendingImport=null;dialog.close();askBatch('discardWorkspace',{session:state.session}).catch(e=>toast(e.message))};
 });
}
function buildImportedProject(state,items,files){
 const p={id:uid(),name:state.name,goal:state.goal||'',systems:[],mainNodes:initialNodes(mainTitles),otherNodes:initialNodes(otherTitles)},tasks=[];
 for(const r of items){
  let s=p.systems.find(x=>x.name===r.system);if(!s){s={id:uid(),name:r.system,number:p.systems.length+1,color:tones[p.systems.length%tones.length],goal:'',references:[]};p.systems.push(s)}
  let ref=s.references.find(v=>v.file===files[r.file]);if(!ref){ref={id:uid(),title:r.source.split('/').at(-1),file:files[r.file],kind:'研究资料',source:r.source,note:r.note};s.references.push(ref)}
  const f=r.fields||{},entry={id:uid(),title:r.title,sourceRef:ref.id,source:r.source},value=k=>typeof f[k]==='string'?f[k]:'';
  switch(r.area){
   case 'background':p.researchBackground=[p.researchBackground,s.name+' · '+r.note].filter(Boolean).join('\n\n');break;
   case 'idea':case 'meeting':(s[r.area==='idea'?'ideas':'meetings']||=[]).push({...entry,text:r.note,date:value('date')});break;
   case 'design':(s.designs||=[]).push({...entry,version:1,question:value('question'),steps:value('steps')||r.note,controls:value('controls'),readout:value('readout'),batchOutline:Array.isArray(f.batchOutline)?f.batchOutline.filter(x=>typeof x==='string'):[],refs:[ref.id]});break;
   case 'experiment':(s.experiments||=[]).push({...entry,purpose:value('purpose'),question:value('question'),materials:value('materials'),procedure:value('procedure'),note:r.note,log:value('observation')?[{id:uid(),date:value('date'),observation:value('observation')}]:[],results:value('result')?[{id:uid(),method:value('method')||'待核对',text:value('result'),pendingReview:true}]:[]});break;
   case 'task':tasks.push({...entry,project:p.id,system:s.id,title:r.title,date:validDate(value('date'))?value('date'):'',time:'',done:false,detail:r.note});break;
   case 'reagent':(s.reagents||=[]).push({...entry,name:r.title,cas:validCAS(value('cas'))?value('cas'):'',amount:value('amount'),note:r.note});break;
   case 'paper':(s.importedPapers||=[]).push({...entry,body:r.note,file:ref.file});break;
   default:ref.title=r.title;ref.kind='参考文献';ref.note=r.note;for(const k of ['authors','doi','journal','year'])if(value(k))ref[k]=value(k);
  }
 }return {p,tasks};
}
async function commitImportedProject(state,items){
 if(importBusy)return;importBusy=true;
 try{const files=await askBatch('commitWorkspace',{session:state.session,ids:[...new Set(items.map(r=>r.file))]});named(state.name,db.projects);
  const result=buildImportedProject(state,items,files);db.projects.push(result.p);db.tasks.push(...result.tasks);db.current=result.p.id;
  collapsedProject='';filter='';area='';view='overview';resetChat();pendingImport=null;save();await askBatch('discardWorkspace',{session:state.session});toast('已有课题已导入。');
 }finally{importBusy=false}
}
