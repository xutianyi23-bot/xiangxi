'use strict';

const mainTitles=['开题报告','中期答辩','毕业'];
const otherTitles=['组会','找导师汇报','学术会议汇报'];
function initialNodes(titles){
 return titles.map(title=>({id:uid(),title,when:'',time:''}));
}
function upgradeWorkspace(state){
 if(state.version===1){
  state.mainNodes=initialNodes(mainTitles);
  for(const p of state.projects)p.otherNodes=initialNodes(otherTitles);
  state.work={weekdays:[1,2,3,4,5],rest:[],sync:false,years:{}};
  state.version=2;
 }
 if(state.version===2){
  for(const project of state.projects)project.systems.forEach((s,index)=>{s.number=index+1});
  state.providers=[];state.aiChoices={};state.version=3;
 }
 if(state.version===3){
  state.navOrder=[...workspaceItems];state.version=4;
  const choice=state.aiChoices.calendar;
  if(choice)state.aiChoices.project={...choice};
 }
 if(state.version===4){
  for(const project of state.projects)for(const s of project.systems){
   for(const plan of s.designs||[]){
    if(!plan.batchId)continue;
    plan.submitted=true;
    const b=(s.experiments||[]).find(x=>x.id===plan.batchId&&x.designId===plan.id);
    if(b){
     plan.taskId=b.taskId;
     const placeholder=b.planned&&b.title===plan.title&&!b.note&&!b.results?.length&&
      Object.keys(b).every(k=>['id','title','note','results','planned','designId','taskId'].includes(k));
     if(placeholder)s.experiments=s.experiments.filter(x=>x!==b);
    }
    delete plan.batchId;
   }
  }
  state.version=5;
 }
 for(const use of ['mail','toc','mechanism','interfacePack','workspaceImport','deck','thesis','minutes','advice','potDesign','measurement','corpus','manuscript','reagent','summary','keywords','batch','reading','background']){
  if(!state.aiChoices[use]&&state.aiChoices.design)state.aiChoices[use]={...state.aiChoices.design};
 }
 for(const p of state.projects){
  for(const s of p.systems)for(const b of s.experiments||[])b.results??=[];
  p.mainNodes??=state.mainNodes?.map(n=>({...n}))||initialNodes(mainTitles);
  p.otherNodes??=initialNodes(otherTitles);
 }
 delete state.mainNodes;
 for(const key of workspaceItems)if(!state.navOrder.includes(key))state.navOrder.push(key);
 return state;
}
const monthOf=day=>day.slice(0,7);
function offsetMonth(month,delta){
 const d=new Date(month+'-01T12:00:00');
 d.setMonth(d.getMonth()+delta);
 return monthOf(localDay(d));
}
function monthEnd(month){return shift(offsetMonth(month,1)+'-01',-1)}
function monthDays(month){
 const first=weekStart(month+'-01'), last=shift(weekStart(monthEnd(month)),6), days=[];
 for(let day=first;day<=last;day=shift(day,1))days.push(day);
 return days;
}
// 国务院办公厅年度放假调休通知，国办发明电〔2025〕7号、〔2026〕10号。
const published={};
function publishedYear(year,ranges,makeups){
 const days={};
 for(const [name,start,end] of ranges){
  for(let date=year+'-'+start;date<=year+'-'+end;date=shift(date,1))days[date]={name,isOffDay:true};
 }
 for(const day of makeups.split(' '))days[year+'-'+day]={name:'调休补班',isOffDay:false};
 published[year]=days;
}
publishedYear(2026,[['元旦','01-01','01-03'],['春节','02-15','02-23'],['清明','04-04','04-06'],['劳动节','05-01','05-05'],['端午','06-19','06-21'],['中秋','09-25','09-27'],['国庆','10-01','10-07']],'01-04 02-14 02-28 05-09 09-20 10-10');
publishedYear(2027,[['元旦','01-01','01-03'],['春节','02-05','02-13'],['清明','04-03','04-05'],['劳动节','05-01','05-05'],['端午','06-09','06-09'],['中秋','09-15','09-15'],['国庆','10-01','10-07']],'01-31 02-14 05-08 09-26 10-09');
function annual(work,year){return work.years[year]?.days||published[year]}
function weekday(day){return new Date(day+'T12:00:00').getDay()}
function dayRule(day,work){
 if(work.rest.includes(day))return {working:false,label:'自休'};
 const holiday=work.sync&&annual(work,day.slice(0,4))?.[day];
 if(holiday)return {working:!holiday.isOffDay,label:holiday.isOffDay?holiday.name:'补班'};
 return {working:work.weekdays.includes(weekday(day)),label:''};
}
function dayCounts(today,end,work){
 const total=Math.max(0,Math.round((Date.parse(end)-Date.parse(today))/86400000));
 let working=Math.floor(total/7)*work.weekdays.length;
 for(let i=1;i<=total%7;i++)if(work.weekdays.includes((weekday(today)+i)%7))working++;
 const exceptions=new Set(work.rest);
 if(work.sync)for(const year of new Set([...Object.keys(published),...Object.keys(work.years)])){
  if(year>=today.slice(0,4)&&year<=end.slice(0,4))for(const day of Object.keys(annual(work,year)))exceptions.add(day);
 }
 for(const day of exceptions){
  if(day>today&&day<=end)working+=Number(dayRule(day,work).working)-Number(work.weekdays.includes(weekday(day)));
 }
 return {total,working};
}
function nodeBounds(node){
 if(!node.when)return null;
 if(node.when.length===7)return [node.when+'-01',monthEnd(node.when)];
 return [node.when,node.when];
}
function nextNode(nodes,now=new Date()){
 const today=localDay(now),clock=now.toTimeString().slice(0,5);
 return nodes.filter(n=>{
  const b=nodeBounds(n);
  return b&&(b[1]>today||(b[1]===today&&(!n.time||n.time>=clock)));
 }).sort((a,b)=>{
  const key=n=>{const start=nodeBounds(n)[0];return (start<today?today:start)+(n.time||'23:59')};
  return key(a).localeCompare(key(b));
 })[0];
}
function validatedYear(payload,year){
 if(payload?.year!==Number(year)||!Array.isArray(payload.days)||payload.days.length<15||payload.days.length>100)return null;
 const days={};
 for(const entry of payload.days){
  if(!validDate(entry.date)||entry.date.slice(0,4)!==String(year)||typeof entry.isOffDay!=='boolean'||typeof entry.name!=='string'||days[entry.date])return null;
  days[entry.date]={name:entry.name,isOffDay:entry.isOffDay};
 }
 return days;
}
