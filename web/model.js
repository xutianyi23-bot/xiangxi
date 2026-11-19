'use strict';
const tones=['#58477e','#a04c40','#276e79','#895385','#796329','#4e6a99','#924d6c','#50704a'];
const personalTone='#69737c';
const uid=()=>crypto.randomUUID();
function localDay(d=new Date()){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
function shift(day,n){const d=new Date(day+'T12:00:00');d.setDate(d.getDate()+n);return localDay(d)}
function weekStart(day){return shift(day,-((new Date(day+'T12:00:00').getDay()+6)%7))}
function seed(){
 const day=localDay();
 return {version:1,current:'p1',projects:[{id:'p1',name:'多孔材料的结构与性能',goal:'孔结构如何影响材料的吸附选择性？',demo:true,systems:[
 {id:'s1',name:'合成方法',goal:'建立可重复的材料制备方法',color:tones[0]},
 {id:'s2',name:'新物质表征',goal:'梳理结构特征与表征证据',color:tones[1]},
 {id:'s3',name:'吸附应用',goal:'比较不同材料的吸附表现',color:tones[2]}]}],
 tasks:[{id:'t1',project:'p1',system:'s1',title:'对比三篇合成方法文献',date:day,time:'14:00',done:false},{id:'t2',project:'p1',system:'s2',title:'整理本周表征图谱',date:shift(day,1),time:'10:00',done:false},{id:'t3',project:'p1',system:'s3',title:'汇总吸附性能对照数据',date:'',time:'',done:false}],personal:[]}
}
function validDate(date){return typeof date==='string' && /^\d{4}-\d{2}-\d{2}$/.test(date)&&localDay(new Date(date+'T12:00:00'))===date}
function applyPlan(state,items=[],nodes=[],projectID=state.current){
 if(!Array.isArray(items)||!Array.isArray(nodes)||(!items.length&&!nodes.length))throw Error('没有可添加的日程。')
 const next=JSON.parse(JSON.stringify(state));
 for(const i of items){
  if(!i||typeof i.personal!=='boolean'||typeof i.title!=='string'||!i.title.trim()||!validDate(i.date)||typeof i.time!=='string'||(i.time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(i.time)))throw Error('日期、时间或标题不完整。')
  if(i.personal){
   if(i.project||i.system||i.task)throw Error('个人事项的归属不明确。')
   next.personal.push({id:uid(),title:i.title.trim(),date:i.date,time:i.time});continue
  }
  const p=next.projects.find(p=>p.id===i.project),s=p?.systems.find(s=>s.id===i.system)
  if(!s)throw Error('请明确课题和研究体系。')
  const t=i.task?next.tasks.find(t=>t.id===i.task&&t.project===p.id&&t.system===s.id&&!t.done):null
  if(i.task&&!t)throw Error('原任务已变化，请重新安排。')
  if(t){t.date=i.date;t.time=i.time}
  else next.tasks.push({id:uid(),project:p.id,system:s.id,title:i.title.trim(),date:i.date,time:i.time,done:false})
 }
 const project=next.projects.find(p=>p.id===projectID);
 for(const n of nodes){
  if(!project||!n||!['main','other'].includes(n.category)||(n.project&&n.project!==projectID))throw Error('请指定当前课题的节点类别。');
  const list=n.category==='main'?project.mainNodes:project.otherNodes;
  const old=n.id?list.find(x=>x.id===n.id):list.find(x=>x.title===n.title);
  if(n.id&&!old)throw Error('节点已变化，请重新选择。');
  const title=(n.title??old?.title)?.trim(),when=n.when??old?.when??'';
  const time=n.time??(when.length===10?old?.time:'')??'';
  if(!title||typeof when!=='string'||(when&&(!validDate(when.length===7?when+'-01':when)||when.slice(0,4)<'1900'||when.slice(0,4)>'2200'))||
     typeof time!=='string'||(time&&(when.length!==10||clockText(time)!==time)))throw Error('节点日期或时分无效。');
  if(old)Object.assign(old,{title,when,time});else list.push({id:uid(),title,when,time});
 }
 return next
}

function systemLabel(s){return s.number?'体系 '+s.number+' · '+s.name:s.name}
function assignSystemNumber(systems,entry,number){
 if(!Number.isSafeInteger(number)||number<1||number>99999)throw Error('请输入 1 至 99999 的整数编号。');
 const previous=systems.find(s=>s.id===entry.id);
 const occupied=systems.find(s=>s.number===number&&s!==previous);
 if(occupied&&previous)occupied.number=previous.number;
 if(occupied&&!previous){
  let end=number;
  const used=new Set(systems.map(s=>s.number));
  while(used.has(end))end++;
  if(end>99999)throw Error('此编号之后没有空位，请选择其他编号。');
  for(const s of systems)if(s.number>=number&&s.number<end)s.number++;
 }
 if(previous)Object.assign(previous,entry,{number});
 else systems.push({...entry,number});
 systems.sort((a,b)=>a.number-b.number);
}

function clockText(value){
 const match=/^([01]\d|2[0-3]):?([0-5]\d)$/.exec(value);
 return match?match[1]+':'+match[2]:'';
}
function bindClock(input){
 input.onfocus=()=>input.select();
 input.onclick=()=>input.select();
 input.oninput=()=>{
  const formatted=clockText(input.value);
  if(formatted){input.value=formatted;input.setSelectionRange(formatted.length,formatted.length);input.blur()}
 };
}
