// Copyright © 2026 徐天翼（笔名：鸡腿堡）
// SPDX-License-Identifier: GPL-3.0-only
'use strict';

let pc={draft:'',messages:[],busy:false,scope:'',snapshot:''};
let voiceArea='calendar';
function projectSnapshot(state,id){
 const project=state.projects.find(p=>p.id===id);
 const systems=project.systems.map(({id,name,number,goal,journal,researchQuestion,references,designs,experiments,paperTargets})=>({
  id,name,number,goal,journal,researchQuestion,references:(references||[]).map(r=>({id:r.id,title:r.title,citation:citationText(r)})),
  designs:(designs||[]).map(({id,title,submitted})=>({id,title,submitted})),
  experiments:(experiments||[]).map(({id,title,note,category,purpose,question,finished,results})=>({id,title,note,category,purpose,question,finished,
   results:(results||[]).map(({id,method,text,series,pendingReview})=>({id,method,text,statistics:series?.stats,pendingReview}))})),
  paperTargets:(paperTargets||[]).map(t=>({id:t.id,name:t.name,language:t.lang,manuscripts:t.drafts?.length||0}))
 }));
 return {id:project.id,name:project.name,goal:project.goal,systems,tasks:state.tasks.filter(t=>t.project===id)};
}
const assistantIcon='<svg class="assistantFace" width="36" height="36" viewBox="0 0 36 36" aria-hidden="true"><rect x="2" y="5" width="32" height="28" rx="11" fill="#ece6f7"/><path d="M18 10V6m-8 16v-4c0-3 3-5 8-5s8 2 8 5v4c0 3-4 5-8 5s-8-2-8-5Z" fill="#fff" stroke="#4b3e75" stroke-width="1.8"/><circle cx="18" cy="5" r="2.4" fill="#ff917d"/><g fill="#30255c"><circle cx="14.5" cy="19" r="1.5"/><circle cx="21.5" cy="19" r="1.5"/></g><path d="M16 23q2 1.7 4 0" fill="none" stroke="#4b3e75" stroke-linecap="round" stroke-width="1.5"/></svg>';
function assistantDock(){
 return db.assistantClosed?'<div class="assistantRail"><button type="button" class="assistantAvatar" aria-label="展开超级助手" title="超级助手" data-a="toggleAssistant">'+assistantIcon+'</button></div>':'<section class="assistantDock">'+projectAssistant()+'</section>';
}
function projectAssistant(){
 return `<section class="chat"><div class="sect"><h2 class="assistantAvatar" aria-label="超级助手" title="超级助手">${assistantIcon}</h2>${btn('收起','toggleAssistant','link')}</div><p class="assistantCaption">全局操作，你可以让我做任何事</p>${modelSelectors('project')}<div class="history" aria-live="polite">${pc.messages.map(m=>`<p><b>${m.role==='user'?'你':'助手'}</b>　${esc(m.text)}</p>`).join('')||''}</div><div class="compose"><input id="projectDraft" value="${esc(pc.draft)}" placeholder="输入指令…" aria-label="课题指令">${btn(listening&&voiceArea==='project'?'停止录音':'语音','projectVoice')}<button class="primary" data-a="projectAsk" ${pc.busy?'disabled':''}>${pc.busy?'处理中…':'发送'}</button></div></section>`;
}
function applyProjectReply(state,id,reply,inPlace=false){
 if(!reply||typeof reply.answer!=='string'||!Array.isArray(reply.actions))throw Error('模型返回格式无效。');
 const next=inPlace?state:JSON.parse(JSON.stringify(state));
 function required(v,label){if(typeof v!=='string'||!v.trim())throw Error('缺少'+label+'。');return v.trim()}
 function update(target,a,fields){for(const k of fields)if(a[k]!==undefined)target[k]=required(a[k],k)}
 for(const a of reply.actions){
  const targetId=a.project||id,p=next.projects.find(v=>v.id===targetId);if(!p)throw Error('课题已变化，请重试。');
  const s=p.systems.find(s=>s.id===a.system);
  if(a.op==='project'){
   if(a.name)named(a.name,next.projects,p.id);update(p,a,['name','goal']);continue;
  }
  if(a.op==='addSystem'){
   named(required(a.name,'体系名称'),p.systems);
   const color=tones.find(c=>!p.systems.some(s=>s.color===c))||'#'+uid().replace(/-/g,'').slice(0,6);
   assignSystemNumber(p.systems,{id:uid(),name:a.name,goal:a.goal||'',color},a.number??Math.max(0,...p.systems.map(s=>s.number))+1);continue;
  }
  if(!s)throw Error('无法定位当前课题内的体系。');
  if(a.op==='system'){
   if(a.name)named(a.name,p.systems,s.id);update(s,a,['name','goal']);
   if(a.number!==undefined)assignSystemNumber(p.systems,s,a.number);
  }else if(a.op==='journal')s.journal=required(a.journal,'目标期刊');
  else if(a.op==='batch')(s.experiments||=[]).push({id:uid(),title:required(a.title,'实验名称'),note:a.note||'',results:[]});
  else if(a.op==='result'){
   const b=batches(s).find(b=>b.id===a.batch);if(!b)throw Error('无法定位对应的实验。');
   b.results.push({id:uid(),method:required(a.method,'表征方法'),text:required(a.text,'表征结果')});
  }else if(a.op==='task'){
   const t=a.task?next.tasks.find(t=>t.id===a.task&&t.system===s.id&&t.project===targetId):{id:uid(),project:targetId,system:s.id,date:'',time:'',done:false};
   if(!t)throw Error('无法定位对应的任务。');
   update(t,a,['title']);required(t.title,'任务名称');
   if(a.date!==undefined){if(a.date!==''&&!validDate(a.date))throw Error('任务日期无效。');t.date=a.date}
   if(a.time!==undefined){if(a.time!==''&&!clockText(a.time))throw Error('任务时间无效。');t.time=clockText(a.time)}
   if(t.time&&!t.date)throw Error('任务缺少日期。');
   if(a.done!==undefined){if(typeof a.done!=='boolean')throw Error('任务状态无效。');t.done=a.done}
   if(!a.task)next.tasks.push(t);
  }else throw Error('无法执行该修改。');
 }
 return next;
}
function readReply(data){return JSON.parse(data.trim().replace(/^\x60{3}(?:json)?\s*|\s*\x60{3}$/g,''))}
async function assistantContext(projects,question,ai){
 const raw=JSON.stringify(projects);if(contextBytes(raw)<=22000)return projects;
 const evidence=[];
 for(const project of projects){
  const rows=[{kind:'project',id:project.id,name:project.name,goal:project.goal},...project.tasks.map(x=>({...x,kind:'task'})),...project.meetings.map(x=>({...x,kind:'meeting'}))];
  for(const s of project.systems){
   rows.push({kind:'system',id:s.id,name:s.name,number:s.number,goal:s.goal,question:s.researchQuestion,journal:s.journal});
   for(const key of ['references','designs','experiments','paperTargets'])for(const r of s[key])rows.push({...r,kind:key,system:s.id,systemName:s.name});
  }
  let batch='';
  const collect=async text=>{
   const out=await flowAI('assistantEvidence',ai,{question,project:{id:project.id,name:project.name},records:text});
   if(typeof out.evidence==='string'&&out.evidence.trim())evidence.push(out.evidence.trim());
  };
  for(const row of rows){
   const prefix=JSON.stringify({project:project.id,kind:row.kind,id:row.id,system:row.system}),value=JSON.stringify(row);
   for(const part of textPieces(value,5200)){
    const entry=prefix+' '+part+'\n';if(batch&&contextBytes(batch)+contextBytes(entry)>8500){await collect(batch);batch=''}batch+=entry;
   }
  }
  if(batch)await collect(batch);
 }
 const joined=evidence.join('\n');
 if(contextBytes(joined)>19000)throw Error('匹配到的研究资料较多，请补充课题名或体系名后再试。');
 return {relevantRecords:joined,projects:projects.map(p=>({id:p.id,name:p.name}))};
}
async function askProject(){
 const message=pc.draft.trim(),p=selectedService('project'),model=db.aiChoices.project?.model;
 if(!message||pc.busy)return;
 if(!p?.models.includes(model)){toast('请先选择服务商和模型。');return}
 if(!native){toast('请在 Mac App 中使用模型。');return}
 stopVoice();pc.messages.push({role:'user',text:message});pc.draft='';pc.busy=true;pc.scope=db.current;
 const projects=db.projects.map(p=>({...projectSnapshot(db,p.id),meetings:(p.quickMeetings||[]).map(m=>({id:m.id,title:m.title,date:m.date}))}));
 pc.snapshot=Object.fromEntries(projects.map(p=>[p.id,contextSignature(JSON.stringify(p))]));render();
 try{
  const relevant=await assistantContext(projects,message,{provider:p.id,model});
  const context=JSON.stringify({today:localDay(),current:pc.scope,projects:relevant,conversation:pc.messages.slice(-12).map(m=>({...m,text:m.text.slice(-3500)}))});
  send('askProject',{provider:p.id,model,context});
 }catch(e){receiveProject('projectError',e.message)}

}
function receiveProject(type,data){
 if(!pc.busy)return;
 pc.busy=false;
 try{
  if(type==='projectError')throw Error(data);
  const reply=readReply(data);
  const tools=reply.tools||[];if(!Array.isArray(tools)||tools.length>1)throw Error('请一次执行一个效率工具。');
  for(const id of new Set(reply.actions.map(a=>a.project||pc.scope))){
   const p=db.projects.find(p=>p.id===id);if(!p||contextSignature(JSON.stringify({...projectSnapshot(db,id),meetings:(p.quickMeetings||[]).map(m=>({id:m.id,title:m.title,date:m.date}))}))!==pc.snapshot[id])throw Error('请求期间课题发生了变化，请重新发送。');
  }
  const next=applyProjectReply(db,pc.scope,reply);
  if(tools.length)assistantTool(tools[0],next,true);
  if(reply.actions.length)applyProjectReply(db,pc.scope,reply,true);
  pc.messages.push({role:'assistant',text:reply.answer});
  if(reply.actions.length)save();else render();
  if(tools.length)assistantTool(tools[0],db,false);

 }catch(e){pc.draft=[...pc.messages].reverse().find(m=>m.role==='user')?.text||'';pc.messages.push({role:'assistant',text:'未写入修改。'+e.message});render()}
}

function assistantTool(t,state,check){
 if(t.tool==='toc'){if(!check){view='toc';render();tocForm('',String(t.notes||''))}return}
 if(t.tool==='diagram'){
  const ids=t.batches||[],available=new Set(state.projects.flatMap(p=>p.systems.flatMap(s=>batches(s).map(b=>b.id))));
  if(!Array.isArray(ids)||ids.some(id=>!available.has(id)))throw Error('请选择有效实验。');
  if(check)return;
  view='mechanism';render();
  const draft={type:t.type==='flow'?'flow':'mechanism',source:ids.length?'batches':t.source==='image'?'image':'names',selection:ids,substrate:t.substrate||'',product:t.product||'',notes:t.notes||'',image:null};
  if(draft.source==='batches'||draft.source==='names'&&draft.substrate&&draft.product){
   let ai;try{ai=selectedAI('mechanism')}catch{diagramForm(draft);return}
   void generateDiagram(draft,ai);return;
  }
  diagramForm(draft);return;
 }
 const p=state.projects.find(v=>v.id===(t.project||pc.scope));if(!p||!['newMeeting','minutes','advice'].includes(t.tool))throw Error('工具或所属课题无效。');
 const m=p.quickMeetings?.find(v=>v.id===t.meeting);
 if(t.tool!=='newMeeting'&&!m)throw Error('请选择已有组会记录。');
 if(check)return;
 db.current=p.id;endQuickVoice();view='quick';filter='';activeQuick=m?.id||'';save();
 if(t.tool==='newMeeting'){
  if(!t.title){quickAction('quickNew','');return}
  activeQuick=uid();(p.quickMeetings||=[]).push({id:activeQuick,title:t.title,date:validDate(t.date)?t.date:localDay(),transcript:'',minutes:'',advice:[]});save();
 }
 else quickAction(t.tool==='minutes'?'quickMinutes':'quickAdvice',m.id);
}
