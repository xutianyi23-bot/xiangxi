'use strict';

const attemptedYears=new Map();
const fetchingYears=new Set();
const failedYears=new Set();
function refreshHolidays(force=false){
 if(!db?.work.sync||!native||!db.projects.length)return;
 const currentYear=Number(localDay().slice(0,4)), targetYear=Number(month.slice(0,4));
 const years=new Set([currentYear,currentYear+1,targetYear]);
 for(const n of [...proj().mainNodes,...proj().otherNodes]){
  if(!n.when)continue;
  const year=Number(n.when.slice(0,4));
  years.add(year);
  for(let y=currentYear;y<=Math.min(year,currentYear+15);y++)years.add(y);
 }
 for(const y of years){
  const last=Math.max(db.work.years[y]?.checked||0,attemptedYears.get(y)||0);
  if(fetchingYears.has(y)||(!force&&Date.now()-last<86400000))continue;
  attemptedYears.set(y,Date.now());fetchingYears.add(y);send('holidayYear',{year:y});
 }
}
function onHolidayYear(data){
 const y=data.year;fetchingYears.delete(y);
 const days=validatedYear(data.payload,y);
 if(!days){failedYears.add(y);render();return}
 failedYears.delete(y);
 db.work.years[y]={days,checked:Date.now()};save();
}
function scheduleNodes(){return [...proj().mainNodes,...proj().otherNodes]}
function formatWhen(n){
 if(!n.when)return '待设定';
 if(n.when.length===7)return n.when.replace('-',' 年 ')+' 月（约）';
 return n.when.replace(/-/g,'/')+(n.time?' '+n.time:'');
}
function estimateMissing(start,end){
 if(!db.work.sync)return false;
 for(let y=Number(start.slice(0,4));y<=Number(end.slice(0,4));y++)if(!annual(db.work,y))return true;
 return false;
}
function countdown(label,n){
 if(!n)return `<div class="counter"><small>${label}</small><strong>待设定</strong><span>为节点填写时间后显示倒计时</span></div>`;
 const [start,end]=nodeBounds(n),today=localDay();
 const low=dayCounts(today,start,db.work),high=dayCounts(today,end,db.work);
 const range=(a,b)=>a===b?a:a+'–'+b;
 return `<button class="counter" data-a="node" data-id="${esc(n.id)}"><small>${label}</small><strong>${esc(n.title)}</strong><span>${range(low.total,high.total)} 个自然日 · ${range(low.working,high.working)} 个工作日${estimateMissing(today,end)?'（暂估）':''}</span></button>`;
}
function counters(){
 return `<div class="counters">${countdown('最近关键节点',nextNode(scheduleNodes()))}${countdown('下一主线节点',nextNode(proj().mainNodes))}</div>`
}
function nodePanel(main){
 const nodes=main?proj().mainNodes:proj().otherNodes;
 return `<section class="box nodes"><div class="sect"><h2>${main?'主线关键时间节点':'其他关键时间节点'}</h2>${btn('＋ 添加','newNode','link',main?'main':'other')}</div><p class="small">当前课题 · ${esc(proj().name)}</p>${nodes.map(n=>`<button class="nodeLine" data-a="node" data-id="${esc(n.id)}"><b>${esc(n.title)}</b><span>${esc(formatWhen(n))} ›</span></button>`).join('')}</section>`
}
function editNode(id,group){
 const scope=id&&proj().mainNodes.some(n=>n.id===id)?'main':group||'other';
 const nodes=scope==='main'?proj().mainNodes:proj().otherNodes;
 const n=nodes.find(x=>x.id===id)||{};
 const level=!n.when?'unset':n.when.length===7?'month':'date';
 const body=field('title','节点名称',n.title,'text',true)+
 `<label>时间精度<select name="precision">${[['date','具体日期'],['month','大致月份'],['unset','暂未确定']].map(([v,t])=>option(v,t,v===(n.id?level:'date'))).join('')}</select></label>`+
 field('month','月份',n.when?.slice(0,7)||month,'month')+field('date','日期',level==='date'?n.when:localDay(),'date')+`<label>时间（选填）<input name="time" type="text" inputmode="numeric" maxlength="5" placeholder="例如 2230" value="${esc(n.time)}"></label>`;
 form(id?'编辑关键节点':'添加关键节点',body,d=>{
  if(!d.title)throw Error('请填写节点名称。');
  const when=d.precision==='unset'?'':d[d.precision],time=d.precision==='date'?clockText(d.time):'';
  if(d.precision==='date'&&d.time&&!time)throw Error('请输入有效的四位时间，如 0930 或 2230。');
  if(d.precision!=='unset'&&(!validDate(d.precision==='month'?when+'-01':when)||when.slice(0,4)<'1900'||when.slice(0,4)>'2200'))throw Error('请选择 1900 至 2200 年之间的有效时间。');
  const values={title:d.title,when,time};
  if(n.id)Object.assign(n,values);else nodes.push({...values,id:uid()});
  if(when)month=monthOf(when);
  refreshHolidays();
 },f=>{
  const apply=()=>{for(const k of ['month','date','time']){const show=f.elements.precision.value===(k==='time'?'date':k);f.elements[k].disabled=!show;f.elements[k].closest('label').hidden=!show}};
  bindClock(f.elements.time);f.elements.precision.onchange=apply;apply();
 });
}
function workForm(){
 const w=db.work, rest=new Set(w.rest);
 const body=`<div class="small">此设置用于所有课题。勾选每周通常工作的日期。</div><div class="workweek">${[1,2,3,4,5,6,0].map((k,i)=>`<label><input type="checkbox" name="w${k}" ${w.weekdays.includes(k)?'checked':''}>周${'一二三四五六日'[i]}</label>`).join('')}</div><label class="tick"><input name="sync" type="checkbox" ${w.sync?'checked':''}>自动同步中国大陆节假日及调休补班</label><p class="small">联网更新，离线使用已有年度安排。自选休息日优先于补班。</p><label>自选休息日</label><div class="row"><input type="date" name="restDay" aria-label="选择休息日"><button type="button" id="addRest" class="btn">加入休息日</button></div><div id="restList" class="restList"></div>`;
 form('工作时间与休息日',body,d=>{
  const days=[0,1,2,3,4,5,6].filter(k=>d['w'+k]);w.weekdays=days;
  if(d.restDay){if(!validDate(d.restDay))throw Error('请选择有效日期。');rest.add(d.restDay)}
  w.rest=[...rest].sort();w.sync=Boolean(d.sync);refreshHolidays();
 },f=>{
  const list=f.querySelector('#restList'),input=f.elements.restDay;
  const draw=()=>{list.innerHTML=[...rest].sort().map(d=>`<button type="button" class="chip" data-rest="${esc(d)}" title="移除此休息日">${esc(d)} ×</button>`).join('')};
  list.onclick=e=>{if(e.target.dataset.rest){rest.delete(e.target.dataset.rest);draw()}};
  f.querySelector('#addRest').onclick=()=>{if(validDate(input.value)){rest.add(input.value);input.value='';draw()}else input.focus()};draw();
 });
}
function monthCell(day,list,nodes){
 const rule=dayRule(day,db.work);
 const dateClass=[day===localDay()?'today':'',monthOf(day)!==month?'outside':'',rule.working?'':'restDay'].join(' ');
 const items=list.filter(x=>x.date===day).map(x=>{
  const color=x.personal?personalTone:(system(x.system)?.color||personalTone);
  return `<div class="monthEvent ${x.done?'finished':''}" style="--tone:${tone(color)}">${toggleBox(x)}<button class="eventName" data-a="${x.openAction||(x.personal?'editPersonal':'editTask')}" data-id="${esc(x.id)}"><small>${esc(x.time||'全天')}</small> ${esc(x.title)}</button></div>`;
 }).join('');
 const marks=nodes.filter(n=>n.when===day).map(n=>btn('◆ '+(n.time?n.time+' ':'')+n.title,'node','mark',n.id)).join('');
 return `<div class="monthCell ${dateClass}"><button class="cellDate" title="${day} 添加日程" data-a="day" data-id="${day}"><b>${Number(day.slice(-2))}</b><small>${esc(rule.label)}</small></button>${marks}${items}</div>`;
}
function calendar(){
 const nodes=scheduleNodes(),list=events(),yr=Number(month.slice(0,4));
 const approximate=nodes.filter(n=>n.when===month).map(n=>btn('约本月 · '+n.title,'node','chip',n.id)).join('');
 const status=db.work.sync?(annual(db.work,yr)?(db.work.years[yr]?'已缓存年度安排':'使用内置年度安排'):'该年度安排待更新'):'按每周工作时间计算';
 return `${counters()}<div class="monthTools"><div class="row"><button class="btn" aria-label="上月" data-a="prev">‹</button><strong>${typeof interfaceLocale==='function'?new Intl.DateTimeFormat(interfaceLocale(),{year:'numeric',month:'long'}).format(new Date(yr,Number(month.slice(-2))-1,15)):yr+' 年 '+Number(month.slice(-2))+' 月'}</strong><button class="btn" aria-label="下月" data-a="next">›</button>${btn('本月','today','link')}</div>${btn('工作时间与休息日','work','btn')}</div>${approximate?`<div class="chips">${approximate}</div>`:''}<section class="calendar"><div class="monthGrid">${Array.from('一二三四五六日',v=>`<div class="weekday">周${v}</div>`).join('')}${monthDays(month).map(d=>monthCell(d,list,nodes)).join('')}</div><div class="legend">${[...proj().systems,{name:'个人事项',color:personalTone}].map(s=>`<span><i class="dot" style="--tone:${tone(s.color)}"></i>${esc(systemLabel(s))}</span>`).join('')}</div></section><div class="syncLine"><span>每周工作 ${db.work.weekdays.length} 天 · ${status}${db.work.sync&&failedYears.has(yr)?' · 联网更新未成功':''}</span>${db.work.sync?btn('刷新年度安排','sync','link'):''}</div>${db.projects.length>1?btn('从其他课题导入节点','importNodes','btn'):''}<div class="split nodePanels">${nodePanel(true)}${nodePanel(false)}</div><p class="small note">倒计时从明天起算，含节点当天。仅设月份时显示月初至月底的范围。缺少年度放假安排时，工作日暂按已知规则估算。</p>${chatPanel()}`;
}


function importNodesForm(){
 const dest=proj(),sources=db.projects.filter(p=>p!==dest);
 if(!sources.length)return;
 const body='<label>来源课题<select name="source">'+sources.map((p,i)=>option(p.id,p.name,!i)).join('')+'</select></label><div id="importChoices"></div><p class="small">只复制勾选的节点。同类同名节点将采用来源日期，两个课题以后可分别修改。</p>';
 form('导入关键时间节点',body,d=>{
  const source=sources.find(p=>p.id===d.source);
  let count=0;
  for(const group of ['mainNodes','otherNodes']){
   for(const n of source[group].filter(n=>n.when&&d[group+n.id])){
    const old=dest[group].find(x=>x.title===n.title);
    if(old)Object.assign(old,{when:n.when,time:n.time});else dest[group].push({...n,id:uid()});
    count++;
   }
  }
  if(!count)throw Error('请勾选要导入的节点。');
  refreshHolidays();
 },f=>{
  const draw=()=>{
   const p=sources.find(p=>p.id===f.elements.source.value);
   f.querySelector('#importChoices').innerHTML=['mainNodes','otherNodes'].map(group=>{
    const rows=p[group].filter(n=>n.when);
    return '<h3>'+(group==='mainNodes'?'主线节点':'其他节点')+'</h3>'+ (rows.map(n=>`<label class="tick"><input type="checkbox" name="${group}${esc(n.id)}" checked>${esc(n.title)}　${esc(formatWhen(n))}</label>`).join('')||'尚未填写日期');
   }).join('');
  };
  f.elements.source.onchange=draw;draw();
 });
}
