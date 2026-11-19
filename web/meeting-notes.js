'use strict';

const flowJobs=new Map();
async function flowJob(key,work){
 if(flowJobs.has(key))return;
 flowJobs.set(key,'处理中…');render();
 try{await work(message=>{flowJobs.set(key,message);render()})}
 catch(e){toast(e.message)}
 finally{flowJobs.delete(key);render()}
}
async function flowAI(kind,choice,payload,signal){
 const value=readReply(await askBatch('workflowAI',{...choice,kind,context:JSON.stringify(payload)},signal));
 if(!value||typeof value!=='object')throw Error('模型返回的格式无法读取。');
 return value;
}
function requireText(value,label){
 if(typeof value!=='string'||!value.trim())throw Error('缺少'+label+'。');
 return value.trim();
}
let activeQuick='',quickVoice=null;
function quickPage(p){
 const list=p.quickMeetings||[],m=list.find(x=>x.id===activeQuick)||list.at(-1);
 const picker=list.map(x=>btn(x.date+' · '+x.title,'quickSelect',x===m?'btn selectedPlan':'btn',x.id)).join('');
 return `<section class="box"><div class="sect"><h2>${esc(p.name)}</h2>${btn('＋ 新建组会','quickNew','primary')}</div><div class="actions">${picker}</div>${m?'':'<p class="empty">新建记录后即可开始麦克风转写。</p>'}</section>${m?quickEditor(p,m):''}`;
}
function quickEditor(p,m){
 const live=quickVoice?.id===m.id,busy=flowJobs.get(m.id);
 return `<section class="box"><div class="sect"><h2>${esc(m.title)}</h2><small>${esc(m.date)}</small></div>
 <div class="actions">${btn(live?'停止转写':'开始麦克风转写','quickVoice',live?'btn':'primary',m.id)}${btn('编辑主题与原文','quickEdit','btn',m.id)}</div>
 <div class="transcript" id="quickTranscript" aria-live="off">${esc(m.transcript||'暂无转写')}</div></section>
 <section class="box"><div class="sect"><h2>课题相关会议纪要</h2>${m.minutes?btn('编辑纪要','quickMinutesEdit','link',m.id):''}</div>${modelSelectors('minutes')}
 ${m.minutes?noteBlock(m.minutes):''}${btn('从转写生成纪要','quickMinutes','btn',m.id)} ${busy?esc(busy):''}</section>
 <section class="box"><h2>下一步工作建议</h2>${modelSelectors('advice')}${btn('根据纪要生成建议','quickAdvice','btn',m.id)}
 ${(m.advice||[]).map(a=>`<div class="deskItem"><b>${esc(a.title)}</b>${noteBlock(a.text)}${a.applied?'<small>已应用 · '+esc(a.destination)+'</small>':btn('修改、审核与应用','quickReview','primary',a.id)}</div>`).join('')}</section>`;
}
function quickRecord(p,id){return p?.quickMeetings?.find(m=>m.id===id)}
function endQuickVoice(){
 if(!quickVoice)return;
 clearTimeout(quickVoice.saveTimer);send('stopMeetingMic');quickVoice=null;save(false);
}
function quickVoiceEvent(type,d){
 if(type!=='meetingSpeech')return false;
 const v=quickVoice;if(v?.token!==d.token)return true;
 const m=quickRecord(db.projects.find(p=>p.id===v.project),v.id);
 if(!m){endQuickVoice();return true}
 if(d.text&&Number.isInteger(d.segment)){
  v.parts.set(d.segment,d.text);
  m.transcript=[v.prefix,...[...v.parts].sort((a,b)=>a[0]-b[0]).map(x=>x[1])].filter(Boolean).join('\n');
  if(!v.saveTimer)v.saveTimer=setTimeout(()=>{v.saveTimer=null;save(false)},800);
  const el=document.querySelector('#quickTranscript');if(el){el.textContent=m.transcript;el.scrollTop=el.scrollHeight}
 }
 if(d.error){endQuickVoice();toast(d.error);render()}return true;
}
function quickProjectContext(p){
 return {name:p.name,goal:p.goal,background:p.researchBackground||'',systems:p.systems.map(s=>({id:s.id,name:s.name,goal:s.researchQuestion||s.goal,
  research:designs(s).map(d=>({id:d.id,title:d.title})),batches:batches(s).map(b=>({id:b.id,title:b.title}))}))};
}
async function quickGenerate(p,m,advice){
 const key=m.id,ai=selectedAI(advice?'advice':'minutes'),source=advice?m.minutes:m.transcript;
 if(!source?.trim())throw Error(advice?'请先生成会议纪要。':'请先转写或输入组会记录。');
 if(quickVoice?.id===key)throw Error('请先停止转写。');
 await flowJob(key,async progress=>{
  const context=quickProjectContext(p);
  let content=source;
  if(!advice&&source.length>11000){
   const parts=source.match(/[\s\S]{1,9500}/gu)||[],notes=[];
   for(const [i,text] of parts.entries()){
    progress('筛选转写 '+(i+1)+' / '+parts.length);
    notes.push(requireText((await flowAI('minutes',ai,{project:context,date:m.date,transcript:text})).minutes,'分段纪要'));
   }
   content=notes.join('\n');
  }
  const out=await flowAI(advice?'advice':'minutes',ai,{project:context,date:m.date,[advice?'minutes':'transcript']:content});
  const current=quickRecord(db.projects.find(x=>x.id===p.id),key);
  if(!current||(advice?current.minutes:current.transcript)!==source)throw Error('原记录已变化，请重新生成。');
  const applied=(current.advice||[]).filter(a=>a.applied);
  if(advice){
   if(!Array.isArray(out.items))throw Error('未取得建议清单。');
   const proposals=out.items.map(x=>({id:uid(),title:requireText(x.title,'建议标题'),text:requireText(x.text,'建议说明'),system:x.system,stage:x.stage,target:x.target}));
   const pending=proposals.filter(x=>!applied.some(a=>(a.originalTitle||a.title)===x.title&&(a.originalText||a.text)===x.text));
   current.advice=[...applied,...pending];
   if(!pending.length)toast('本次纪要没有新的待审核建议。');
  }else{current.minutes=requireText(out.minutes,'会议纪要');current.advice=applied}
  save();
 });
}
function applyQuickAdvice(m,id,d){
 const a=m.advice?.find(x=>x.id===id),p=db.projects.find(x=>x.id===d.project),s=p?.systems.find(x=>x.id===d.system);
 if(!a||a.applied||!s||!workflowStages.includes(d.stage))throw Error('建议已应用，或目标课题与体系无效。');
 const targets=d.stage==='lab'?batches(s):d.stage==='designs'?designs(s):[];
 if(d.target&&!targets.some(t=>t.id===d.target))throw Error('请重新选择研究记录。');
 const title=requireText(d.title,'任务标题'),text=requireText(d.text,'建议内容');
 const task={id:uid(),project:p.id,system:s.id,title,date:'',time:'',done:false,stage:d.stage,target:d.target,meetingId:m.id,adviceId:id,detail:text};
 const target=targets.find(t=>t.id===d.target);
 db.tasks.push(task);
 Object.assign(a,{originalTitle:a.title,originalText:a.text,title,text,applied:task.id,destination:[p.name,s.name,areaNames[d.stage],target?.title].filter(Boolean).join(' / ')});
}
function reviewedWork(c,stage,target){
 return db.tasks.filter(t=>t.meetingId&&t.project===c.project&&t.system===c.system&&t.stage===stage&&(!target||!t.target||t.target===target));
}
function reviewedPanel(s){
 const target=area==='lab'?labSession(s).open:'',items=reviewedWork(scope(),area,target);
 return items.length?`<section class="box"><h2>组会已确认的工作</h2>${items.map(t=>`<div class="line">${toggleBox(t)}<div><b>${esc(t.title)}</b>${noteBlock(t.detail)}</div></div>`).join('')}</section>`:'';
}
function reviewQuick(p,m,a){
 const selects=['project','system','stage','target'].map((key,i)=>`<label>${['应用到课题','研究体系','研究环节','具体记录'][i]}<select name="${key}"></select></label>`).join('');
 form('审核组会建议',field('title','任务标题',a.title,'text',true)+longField('text','可修改的工作建议',a.text)+selects,d=>applyQuickAdvice(m,a.id,d),f=>{
  const {project,system,stage,target}=f.elements;
  project.innerHTML=db.projects.map(x=>option(x.id,x.name,x.id===p.id)).join('');
  stage.innerHTML=workflowStages.map(k=>option(k,areaNames[k],k===(a.stage||'designs'))).join('');
  function targets(){
   const s=db.projects.find(x=>x.id===project.value)?.systems.find(x=>x.id===system.value);
   const rows=!s?[]:stage.value==='lab'?batches(s):stage.value==='designs'?designs(s):[];
   target.innerHTML=option('','整个研究环节',!a.target)+rows.map(r=>option(r.id,r.title,r.id===a.target)).join('');
  }
  function systems(){system.innerHTML=db.projects.find(x=>x.id===project.value).systems.map(s=>option(s.id,s.name,s.id===a.system)).join('');targets()}
  project.onchange=systems;stage.onchange=system.onchange=targets;systems();f.querySelector('.primary').textContent='确认应用';
 });
}
function quickAction(a,id){
 if(!a.startsWith('quick')||view!=='quick')return false;
 const p=proj(),m=quickRecord(p,id);
 if(a==='quickSelect'){endQuickVoice();activeQuick=id;render()}
 if(a==='quickNew')form('新建组会记录',field('title','组会主题','组会','text',true)+field('date','日期',localDay(),'date',true),d=>{
  endQuickVoice();activeQuick=uid();(p.quickMeetings||=[]).push({...d,id:activeQuick,transcript:''});
 });
 if(a==='quickVoice'&&m){
  if(quickVoice){endQuickVoice()}else{
   if(!native)throw Error('请在 Mac App 中使用麦克风。');
   stopVoice();quickVoice={project:p.id,id:m.id,token:uid(),prefix:m.transcript||'',parts:new Map()};send('startMeetingMic',{token:quickVoice.token});
  }render();
 }
 if(a==='quickEdit'&&m){
  endQuickVoice();form('编辑组会记录',field('title','主题',m.title,'text',true)+field('date','日期',m.date,'date',true)+longField('transcript','转写记录',m.transcript),d=>Object.assign(m,d));
 }
 if(a==='quickMinutesEdit'&&m)form('编辑纪要',longField('minutes','与当前课题相关的纪要',m.minutes),d=>{m.minutes=requireText(d.minutes,'纪要');m.advice=(m.advice||[]).filter(a=>a.applied)});
 if((a==='quickMinutes'||a==='quickAdvice')&&m)void quickGenerate(p,m,a==='quickAdvice').catch(e=>toast(e.message));
 if(a==='quickReview'){
  const meeting=p.quickMeetings.find(x=>x.advice?.some(a=>a.id===id));if(meeting)reviewQuick(p,meeting,meeting.advice.find(a=>a.id===id));
 }
 return true;
}
