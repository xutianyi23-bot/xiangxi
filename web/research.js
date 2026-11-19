'use strict';

const workspaceItems=['overview','calendar','reports','thesis','models','vpn','publishers','backup','language','feedback'];
function moveItem(list,source,target,renumber=false){
 const from=list.findIndex(x=>(x.id??x)===source),to=list.findIndex(x=>(x.id??x)===target);
 if(from<0||to<0||from===to)return false;
 list.splice(to,0,list.splice(from,1)[0]);
 if(renumber)list.forEach((s,i)=>s.number=i+1);
 return true;
}
function dragAttributes(group,id){return `draggable="true" data-sort="${group}" data-sort-id="${esc(id)}" title="拖动调整顺序"`}
function bindSorting(){
 let moving=null,over=null;
 const clear=()=>{over?.classList.remove('dropTarget');over=null};
 app.addEventListener('dragstart',e=>{
  const el=e.target.closest('[data-sort]');if(!el)return;
  moving={group:el.dataset.sort,id:el.dataset.sortId,project:db.current};e.dataTransfer.effectAllowed='move';
  e.dataTransfer.setData('text/plain',el.dataset.sortId);
 });
 app.addEventListener('dragover',e=>{
  const el=e.target.closest('[data-sort]');
  if(!moving||el?.dataset.sort!==moving.group||el.dataset.sortId===moving.id||(moving.group==='nav'&&projectViews.includes(moving.id)!==projectViews.includes(el.dataset.sortId))){clear();return}
  e.preventDefault();e.dataTransfer.dropEffect='move';clear();over=el;over.classList.add('dropTarget');
 });
 app.addEventListener('drop',e=>{
  const el=e.target.closest('[data-sort]');if(!moving||el?.dataset.sort!==moving.group||moving.project!==db.current||(moving.group==='nav'&&projectViews.includes(moving.id)!==projectViews.includes(el.dataset.sortId)))return;
  e.preventDefault();const group=moving.group,list=group==='projects'?db.projects:group==='nav'?db.navOrder:proj().systems;
  const changed=moveItem(list,moving.id,el.dataset.sortId,group==='systems');moving=null;clear();if(changed)save();
 });
 app.addEventListener('dragend',()=>{moving=null;clear()});
}
function batches(s){return s.experiments||[]}
function longField(name,label,value=''){return `<label>${esc(label)}<textarea rows="3" name="${name}">${esc(value)}</textarea></label>`}
function reportType(title){
 if(/组会|课题组例会|小组例会/.test(title))return '组会';
 if(/导师|老师/.test(title)&&/汇报|报告|进展/.test(title))return '导师汇报';
 if(/学术会议|会议汇报|会议报告|大会报告|口头报告|墙报/.test(title))return '学术会议汇报';
 if(/汇报/.test(title))return '其他汇报';
 return '';
}
function reportSources(){
 const nodes=scheduleNodes().filter(n=>n.when).map(n=>({id:n.id,title:n.title,date:n.when,time:n.time,kind:'node'}));
 return [...events(),...nodes].map(x=>({...x,category:reportType(x.title)||(x.reportTask?"其他汇报":"")})).filter(x=>x.category).sort(byDate);
}
function reportsPage(){
 const sources=reportSources(),reports=proj().reports||[];
 const auto=sources.filter(s=>!s.openAction).filter(s=>!reports.some(r=>r.source===s.id));
 return `<section class="box"><div class="sect"><h2>汇报任务 <span class="num">${reports.length}</span></h2></div>${reports.map(r=>{
 const src=sources.find(s=>s.id===r.source)||findReportSource(r.source);
 return btn([src?.title||r.title,src?.date||r.date||'待排期',src?.time||r.time||''].join('　'),'editReport','nodeLine',r.id)+reportStudio(r);
 }).join('')||'<p class="empty">尚未创建汇报任务。</p>'}</section><section class="box agenda"><div class="sect"><h2>从日历识别</h2></div>${auto.map(s=>`<div class="line"><span class="tag">${s.category}</span><b>${esc(s.title)}</b><span class="small">${esc(s.date)} ${esc(s.time)}</span>${btn('创建汇报任务','linkReport','link',s.id)}</div>`).join('')||'<p class="empty">本课题日历中的组会、导师汇报和学术会议汇报会出现在这里。</p>'}</section>`;
}
function findReportSource(id){
 if(!id)return null;
 const t=events().find(x=>x.id===id);if(t)return t;
 const n=scheduleNodes().find(x=>x.id===id);return n?{title:n.title,date:n.when,time:n.time}:null;
}
function reportForm(id,sourceId){
 const p=proj(),r=(p.reports||[]).find(r=>r.id===id),src=findReportSource(sourceId||r?.source);
 const body=src?`<p>${esc(src.title)} · ${esc(src.date||'待设定')} ${esc(src.time)}</p><p class="small">与日历同步</p>`:field('title','汇报名称',r?.title,'text',true)+field('date','计划日期',r?.date,'date',true)+field('time','开始时间',r?.time,'time',true);
 form(r?'编辑汇报任务':'创建汇报任务',body+`<label>类型<select name="category">${['组会','导师汇报','学术会议汇报','其他汇报'].map(v=>option(v,v,v===(r?.category||reportType(src?.title||'')))).join('')}</select></label>`+longField('notes','准备事项',r?.notes)+scopeFields(r?.selection),d=>{
  if(!src&&!d.title)throw Error('请填写汇报名称。');
  const next={selection:readScope(d),notes:d.notes,category:d.category,time:src?.time||d.time,title:src?.title||d.title,date:src?.date||d.date,source:sourceId||r?.source||''};
  if(r)Object.assign(r,next);else (p.reports||=[]).push({...next,id:uid()});
 });
}
