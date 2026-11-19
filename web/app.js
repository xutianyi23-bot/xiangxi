'use strict';
let area='',section='', db, view='overview', filter='', month=monthOf(localDay()), pending=false, listening=false, chat=[], voicePrefix='', draft='', saveStatus='已保存到本机';
const app=document.querySelector('#app'), dialog=document.querySelector('#editor');
const native=window.webkit?.messageHandlers?.workspace || window.xiangxiWindows;
const send=(op,data={})=>native?.postMessage({op,...data});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const proj=()=>db.projects.find(p=>p.id===db.current);
const tasks=()=>db.tasks.filter(t=>t.project===db.current);
const system=id=>proj().systems.find(s=>s.id===id);
const byDate=(a,b)=>((a.date||'9999')+a.time).localeCompare((b.date||'9999')+b.time);
const events=()=>[...researchDates(proj()),...tasks().filter(t=>t.date),...db.personal.map(x=>({...x,personal:true}))].sort(byDate);
const short=d=>d?d.slice(5).replace('-','/'):'待排期';
const tone=c=>/^#[0-9a-f]{6}$/i.test(c)?c:personalTone;
const logo='<img class="brandMark" src="xiangxi.svg" width="39" height="39" alt="">';
const icons={mail:'<rect x="2" y="4" width="20" height="16" rx="3"/><path d="m3 6 9 7 9-7"/>',quick:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4m-4 0h8"/>',mechanism:'<path d="M3 8l5-3 5 3v6l-5 3-5-3zm10 0 5-3 4 3m-9 6 5 3 4-3M5 9v4"/>',toc:'<rect x="2" y="4" width="20" height="16" rx="3"/><circle cx="7" cy="10" r="2"/><path d="M9 10h4l3 4m-4 0h4v-4"/>',language:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3q-8 9 0 18 8-9 0-18z"/>',thesis:'<path d="M4 3h13l3 3v15H4zM7 8h8M7 12h10M7 16h8"/>',feedback:'<path d="M3 4h18v13H9l-5 4v-4H3zM7 8h10M7 12h7"/>',backup:'<path d="M4 14v6h16v-6M12 4v11m-4-4 4 4 4-4"/>',vpn:'<path d="M12 2 3 6v6c0 5 5 8 9 10 4-2 9-5 9-10V6zM8 12l3 3 5-6"/>',publishers:'<path d="M3 4h7l2 2 2-2h7v14h-7l-2 2-2-2H3zM12 6v14"/>',reports:'<path d="M3 4h18v12H3zm9 12v5m-5 0 5-3 5 3M6 12l4-4 3 2 4-4"/>',models:'<path d="M12 2 3 7l9 5 9-5-9-5ZM3 12l9 5 9-5M3 17l9 5 9-5"/>',overview:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',tasks:'<path d="m3 6 2 2 4-5m3 4h9M3 15l2 2 4-5m3 4h9"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v5m10-5v5M3 11h18"/>'};
const names={mail:"科研邮件",toc:"TOC 图绘制",mechanism:"机理绘制",language:"语言",thesis:"大论文助手",quick:'组会速记',feedback:'意见反馈及说明',backup:'备份',vpn:'VPN',publishers:'论文提供商',overview:'课题总览',tasks:'研究体系',calendar:'课题日历',models:'模型',reports:'汇报助手'};
function btn(label,action,cls='btn',id=''){return `<button class="${cls}" data-a="${action}" data-id="${esc(id)}">${esc(label)}</button>`}
function toast(s){const n=document.querySelector('#notice');n.textContent=s;n.style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>n.style.display='none',3700)}
function save(refresh=true){if(native){saveStatus='正在保存';send('save',{state:db,removedReagentFiles:[...removedReagentFiles],deletedProject:deletionToSave});deletionToSave=''}else{try{localStorage.setItem('xiangxi-beta-preview',JSON.stringify(db))}catch{saveStatus='保存失败';toast(saveStatus)}}if(refresh)render()}
function render(){
 if(area&&view!=='tasks'){area='';section='';send('closeArea')}
 const scroll=app.querySelector('.main')?.scrollTop||0;
 const p=proj();
 const empty=!p&&['overview','reports','thesis','calendar','tasks','quick'].includes(view);
 app.innerHTML=`<aside><div class="brand">${logo}<div class="brandText"><strong>相析</strong><span>生化环材一站式工作站</span></div></div>${sidebarGroups()}<div class="bottom"><div class="credit">作者 · 徐天翼（笔名：鸡腿堡）<br>使用 GPT-6.2 Astra 开发</div><i></i> <span id="status">${esc(saveStatus)}</span></div></aside><main class="main"><div class="crumb">${btn('工作区','nav','link','overview')} <b>›</b> ${view==='tasks'?btn('课题总览','nav','link','overview')+' <b>›</b> '+(area?btn(systemLabel(system(filter)),'openSystem','link',filter)+' <b>›</b> '+areaNames[area]:esc(systemLabel(system(filter)))):names[view]}<span>${new Intl.DateTimeFormat(typeof interfaceLocale==='function'?interfaceLocale():'zh-CN',{month:'long',day:'numeric',weekday:'long'}).format(new Date())}</span></div><div class="page"><div class="heading"><div><h1>${esc(empty?names[view]:view==='overview'?p.name:view==='tasks'?systemLabel(system(filter)):names[view])}</h1><p class="sub">${!p?'':view==='overview'?(p.demo?'示例课题 · 科研工作区':'科研工作区'):['quick','mechanism','toc','mail'].includes(view)?'效率工具 · '+esc(p.name):!projectViews.includes(view)&&view!=='tasks'?'系统设置':esc(p.name)}</p></div>${empty||view==='mail'||view==='toc'||view==='mechanism'||view==='thesis'||view==='quick'||view==='backup'||view==='language'||view==='feedback'?'':view==='vpn'?btn('＋ 添加网络','vpnEdit','primary'):view==='publishers'?btn('＋ 添加提供商','pubEdit','primary'):view==='tasks'&&area?'':view==='models'?(db.providers.length?btn('＋ 添加服务商','provider','primary'):''):view==='reports'?btn('＋ 创建汇报任务','newReport','primary'):btn(view==='calendar'?'＋ 新建日程':'＋ 新建任务',view==='calendar'?'event':'task','primary')}</div>${empty?'<section class="box">还没有课题。点击左侧「＋ 添加」建立课题。</section>':view==='thesis'?thesisPage(p):view==='quick'?quickPage(p):view==='mail'?mailPage():view==='toc'?tocPage():view==='mechanism'?diagramPage():view==='language'?languagePage():view==='feedback'?feedbackPage():view==='backup'?backupPage():view==='vpn'||view==='publishers'?accessPage(view):view==='overview'?overview()+mailProgress(p):view==='tasks'?taskPage():view==='models'?modelsPage():view==='reports'?reportsPage():calendar()}</div></main>${assistantDock()}`;
 if(p&&(projectViews.includes(view)||view==='tasks'||view==='quick')){const heading=app.querySelector('.heading');heading?.insertAdjacentHTML?.('afterend','<div class="actions exportTools">'+btn(view==='overview'?'导出本课题相关内容':'导出当前部分','projectExport','btn')+'</div>')}
 if(typeof indexUserText==='function'&&typeof MutationObserver!=='undefined')indexUserText();
 app.querySelector('.main').scrollTop=scroll;
 if(view==='tasks'&&area==='lab'){const board=app.querySelector('.boardScroll');if(board){const ui=labSession(system(filter));board.scrollLeft=ui.left;board.scrollTop=ui.top}}
 const history=document.querySelector('.history');if(history)history.scrollTop=history.scrollHeight
}
function toggleBox(t){
 if(t.openAction)return '';
 const action=t.personal?'donePersonal':'done';
 return `<button class="check ${t.done?'done':''}" aria-label="${esc(t.title)}：${t.done?'取消完成':'标记完成'}" aria-pressed="${!!t.done}" data-a="${action}" data-id="${esc(t.id)}">${t.done?'✓':''}</button>`;
}
function taskRow(t){
 const s=t.openAction&&!t.system?{name:'课题汇报',color:personalTone}:t.personal?{name:'个人事项',color:personalTone}:system(t.system);
 return `<div class="line">${toggleBox(t)}<button class="name" data-a="${t.openAction||(t.personal?'editPersonal':'editTask')}" data-id="${esc(t.id)}"><span class="${t.done?'strike':''}">${esc(t.title)}</span><small>${esc(t.date||'待排期')} ${esc(t.time)}</small></button><span class="tag" style="--tone:${tone(s.color)}">${esc(systemLabel(s))}</span></div>`;
}
function overview(){
 const p=proj(), list=tasks(), upcoming=[...events(),...list.filter(t=>!t.date)].filter(t=>!t.done||!t.date||t.date>=shift(localDay(),-7)).sort(byDate);
 return `<section class="hero"><svg class="lattice" viewBox="0 0 190 130" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g stroke="#c1b2e0" fill="none" stroke-width="1"><path d="m6 102 26-15 26 15 26-15V57l26-15 26 15 26-15 26 15m-156 30V57l26-15 26 15m-26 45v29m52-89V12l26-15m0 60v30l26 15 26-15V57m-26 45v29M58 42V12L32-3"/></g><g fill="#ff917d"><circle cx="32" cy="87" r="3"/><circle cx="84" cy="57" r="3"/><circle cx="110" cy="42" r="3"/><circle cx="162" cy="102" r="3"/></g></svg><small>核心科学问题</small><h2>${esc(p.goal||'为课题写下一个核心问题')}</h2></section><div class="sect"><h2>研究体系<span class="num">${p.systems.length}</span></h2>${btn('＋ 添加体系','system','link')}</div><div class="cards">${p.systems.map(s=>{const a=list.filter(t=>t.system===s.id),done=a.filter(t=>t.done).length;return `<button ${dragAttributes('systems',s.id)} class="card" style="--tone:${tone(s.color)}" data-a="openSystem" data-id="${esc(s.id)}"><small class="systemNo">体系 ${s.number}</small><b>${esc(s.name)}</b><p>${esc(s.goal||'查看体系任务')}</p><span class="small">已完成 ${done} / ${a.length} 项任务</span><div class="meter"><i style="width:${a.length?done/a.length*100:0}%"></i></div></button>`}).join('')||'<div class="emptybox">添加第一个研究体系，为任务和日程分配颜色。</div>'}</div><section class="box agenda"><div class="sect"><h2>近期安排</h2>${btn('打开日历 ›','nav','link','calendar')}</div>${upcoming.map(taskRow).join('')||'<div class="empty">暂无安排。</div>'}</section>`;
}
function taskPage(){
 const s=system(filter),rows=tasks().filter(t=>t.system===s.id).sort(byDate);
 const panels={background:contextPanel,library:libraryPanel,designs:designPanel,lab:labPanel,paper:paperPanel};
 if(panels[area])return workflowNav()+reviewedPanel(s)+panels[area](s);
 return `${workflowNav()}<section class="box agenda"><div class="sect"><h2>体系任务 <span class="num">${rows.length}</span></h2>${btn('编辑体系','editSystem','link',s.id)}</div><p class="small">${esc(s.goal)}</p>${rows.map(taskRow).join('')||'<div class="empty">这里还没有任务。</div>'}</section>`;
}
function chatPanel(){return `<section class="chat"><div class="sect"><h2>日历助手</h2>${modelSelectors('calendar')}</div><div class="history" aria-live="polite">${chat.length?chat.map(m=>`<p><b>${m.role==='user'?'你':'助手'}</b>　${esc(m.text)}</p>`).join(''):'例如：把本课题的组会改到下周三 14:30，或把开题报告暂定在明年三月。'}</div><div class="compose"><input id="draft" value="${esc(draft)}" placeholder="输入安排，或使用语音…" aria-label="日程指令">${btn(listening?'停止录音':'语音','voice')}<button class="primary" data-a="ask" ${pending?'disabled':''}>${pending?'处理中…':'发送'}</button></div></section>`}
function field(name,title,value='',type='text',required=false){return `<label>${title}<input name="${name}" type="${type}" value="${esc(value)}" ${required?'required':''}></label>`}
function form(title,body,commit,init){
 dialog.innerHTML=`<form><h2>${esc(title)}</h2>${body}<div class="formerror" role="alert"></div><div class="actions formfoot"><button type="button" class="btn" id="cancel">取消</button><button class="primary">保存</button></div></form>`;
 if(!dialog.open)dialog.showModal();
 const f=dialog.querySelector('form');dialog.querySelector('#cancel').onclick=()=>dialog.close();init?.(f);
 f.onsubmit=e=>{e.preventDefault();try{const data=Object.fromEntries(new FormData(f));for(const k in data)data[k]=data[k].trim();commit(data);dialog.close();save()}catch(err){dialog.querySelector('.formerror').textContent=err.message}};
}
function named(title,items,id){if(!title)throw Error('请输入名称。');if(items.some(x=>x.name===title&&x.id!==id))throw Error('已有同名项目，请换一个名称。')}
function projectForm(edit,id){
 const p=edit?db.projects.find(x=>x.id===id):{};if(!p)return;
 form(edit?'编辑课题':'添加课题',field('name','课题名称',p.name,'text',true)+field('goal','核心科学问题',p.goal),d=>{
 named(d.name,db.projects,p.id);
 if(edit)Object.assign(p,d);else{const id=uid();db.projects.push({...d,id,systems:[],mainNodes:initialNodes(mainTitles),otherNodes:initialNodes(otherTitles)});db.current=id;collapsedProject='';filter='';view='overview';resetChat()}
 })
}
function systemForm(id,after=false){
 const p=proj(),s=system(id)||{},used=p.systems.filter(x=>x.id!==id).map(x=>x.color);
 let color=s.color||tones.find(x=>!used.includes(x));
 if(!color){let n=p.systems.length;do{color='#'+((n++*2654435761)>>>8).toString(16).padStart(6,'0')}while(used.includes(color)||color===personalTone)}
 form(s.id?'编辑体系':'添加研究体系',field('number','体系编号',s.number||Math.max(0,...p.systems.map(x=>x.number))+1,'number',true)+'<div class="small">编辑时若编号已占用，两个体系会互换编号。</div>'+field('name','体系名称',s.name,'text',true)+field('goal','该体系要解决的问题',s.goal)+field('color','日程颜色',color,'color'),d=>{
 named(d.name,p.systems,s.id);if(used.includes(d.color)||d.color===personalTone)throw Error('这个颜色已被其他体系或个人事项使用。');
 const entry={...d,id:s.id||uid()};assignSystemNumber(p.systems,entry,Number(d.number));if(after)setTimeout(()=>taskForm(null,false,'',entry.id),0);
 })
}
function option(value,title,selected){return `<option value="${esc(value)}" ${selected?'selected':''}>${esc(title)}</option>`}
function taskForm(item,personal=false,date='',preferred=''){
 const p=proj(),scheduled=Boolean(date||item?.date||personal),editing=Boolean(item),allowPersonal=!editing&&scheduled;
 if(!p.systems.length&&!personal&&!allowPersonal){return systemForm('',true)}
 const startKind=personal||(!p.systems.length&&allowPersonal)?'personal':'task';
 const body=(allowPersonal?`<label>事项类型<select name="kind">${p.systems.length?option('task','课题任务',startKind==='task'):''}${option('personal','个人事项（所有课题可见）',startKind==='personal')}</select></label>`:'')+
 field('title','标题',item?.title,'text',true)+'<label class="tick"><input type="checkbox" name="reportTask" '+(item?.reportTask?'checked':'')+'>汇报任务</label>'+
 `<label id="sysField">研究体系<select name="system">${p.systems.map(s=>option(s.id,systemLabel(s),s.id===(item?.system||preferred||filter))).join('')}</select></label>`+
 field('date',scheduled?'日期':'计划日期（选填）',item?.date||date,'date',personal||allowPersonal)+field('time','时间（留空表示全天）',item?.time,'time');
 form(editing?(personal?'编辑个人事项':'编辑任务'):scheduled?'添加日程':'添加任务',body,d=>{
 const isPersonal=(d.kind||startKind)==='personal';if(!d.title)throw Error('请输入标题。');
 if(d.date&&!validDate(d.date)||d.time&&!d.date)throw Error('请选择有效日期。');
 const values={title:d.title,date:d.date,time:d.time,reportTask:!!d.reportTask};
 if(isPersonal){if(!d.date)throw Error('个人事项需要日期。');if(editing)Object.assign(item,values);else db.personal.push({...values,id:uid()})}
 else{if(!system(d.system))throw Error('请选择研究体系。');if(editing)Object.assign(item,values,{system:d.system});else db.tasks.push({...values,id:uid(),project:p.id,system:d.system,done:false})}
 if(d.date&&view==='calendar')month=monthOf(d.date)
 },f=>{const show=()=>f.querySelector('#sysField').hidden=(f.elements.kind?.value||startKind)==='personal';show();if(f.elements.kind)f.elements.kind.onchange=show})
}
let conversation=[], lastUtterance='',calendarRequestProject='';
function stopVoice(){if(listening){send('stopVoice');listening=false}}
function resetChat(){chat=[];conversation=[];draft='';lastUtterance='';stopVoice()}
function ask(){
 const text=draft.trim();if(!text||pending)return;
 const provider=selectedService('calendar'),model=db.aiChoices.calendar?.model;
 if(!provider?.models.includes(model)){toast('请先选择服务商和模型。');return}
 if(!native){toast('请在 Mac App 中使用模型服务。');return}
 stopVoice();chat.push({role:'user',text});conversation.push({role:'user',text});lastUtterance=text;calendarRequestProject=db.current;draft='';pending=true;render();
 const now=new Date();
 send('ask',{provider:provider.id,model,context:JSON.stringify({localDate:localDay(now),localTime:now.toTimeString().slice(0,5),weekday:now.getDay(),current:db.current,nodes:{main:proj().mainNodes,other:proj().otherNodes},projects:db.projects.map(p=>({id:p.id,name:p.name,systems:p.systems.map(s=>({id:s.id,name:s.name,number:s.number}))})),tasks:db.tasks.filter(t=>!t.done).map(t=>({id:t.id,title:t.title,project:t.project,system:t.system,date:t.date,time:t.time})),conversation})});
}
window.receiveNative=(type,data)=>{
 if(type==='publisherSession'){const p=publishers().find(p=>p.id===data.vendor);if(p){p.sessionStatus=data.state;p.sessionTime=Date.now();save(view==='publishers')}return}
 if(type==='codexLocated'){fetchCatalog(data);return}
 if(type==='modelUsage'){recordModelUsage(data);return}
 if(type==='backupDrives'){backupDrives=data;if(!data.some(d=>d.id===backupDrive))backupDrive=data[0]?.id||'';if(view==='backup')render();return}
 if(type==='backupFinished'){backupBusy=false;backupStatus=data;if(view==='backup')render();else toast(data);return}
 if(quickVoiceEvent(type,data))return;
 if(reagentEvent(type,data))return;
 if(typeof accessEvent==='function'&&accessEvent(type,data))return;
 if(type==='areaClosed'){area='';section='';render();return}
 if(typeof researchEvent==='function'&&researchEvent(type,data))return;
 if(type==='designError'||type==='designReply'){receiveDesign(type,data);return}
 if(type==='reference'){
  const s=db.projects.find(p=>p.id===data.project)?.systems.find(s=>s.id===data.system);
  if(s){(s.references||=[]).push(data.ref);save()}return;
 }
 if(type.startsWith('test')){receiveSmoke(type,data);return}
 if(type==='projectReply'||type==='projectError'){receiveProject(type,data);return}
 if(type==='modelList'||type==='modelListError'){receiveCatalog(type,data);return}
 if(type==='holidayYear'){onHolidayYear(data);return}
 if(type==='load'){if(data&&!([1,2,3,4,5].includes(data.version)&&Array.isArray(data.projects)&&(data.projects.some(p=>p.id===data.current)||(!data.projects.length&&data.current===''))&&Array.isArray(data.tasks)&&Array.isArray(data.personal))){app.textContent='无法读取此版本的工作区。';return}const changed=data?.version!==5||!!data?.mainNodes||data?.projects.some(p=>!p.mainNodes||!p.otherNodes);db=upgradeWorkspace(data||{version:1,current:'',projects:[],tasks:[],personal:[]});if(db.uiLanguage)send('interfaceLanguage',{code:db.uiLanguage,labels:db.languagePacks?.[db.uiLanguage]||{}});changed?save():render();refreshHolidays();if(native)for(const p of db.providers)if(p.format==='codexCLI')fetchCatalog(p.id);return}
 if(type==='loadError'){app.textContent='打开本地工作区失败：'+data;return}
 if(type==='saved'){for(const name of data?.removedReagentFiles||[])removedReagentFiles.delete(name);saveStatus='已保存到本机';const s=document.querySelector('#status');if(s)s.textContent=saveStatus;return}
 if(type==='error'){saveStatus='保存失败';render();toast(data);return}
 if(type==='providerNotice'){toast(data);return}
 if(type==='voice'){if(!listening)return;if(data.text){const words=voicePrefix+data.text;if(voiceArea==='project')pc.draft=words;else draft=words;const input=document.querySelector(voiceArea==='project'?'#projectDraft':'#draft');if(input)input.value=words;}if(data.final){listening=false;render()}if(data.error)toast(data.error);return}
 if(type==='ai'||type==='aiError'){
 pending=false;
 if(calendarRequestProject&&calendarRequestProject!==db.current){calendarRequestProject='';toast('课题已切换，原日历指令未写入。');return}
 calendarRequestProject='';
 try{
 if(type==='aiError')throw Error(data);
 const reply=JSON.parse(data.trim().replace(/^\x60{3}(?:json)?\s*|\s*\x60{3}$/g,''));
 if(reply.question){chat.push({role:'assistant',text:String(reply.question)});conversation.push(chat.at(-1));render();return}
 const items=reply.items??[],nodes=reply.nodes??[];
 const next=applyPlan(db,items,nodes);
 if(nodes.length){const p=next.projects.find(x=>x.id===db.current);proj().mainNodes=p.mainNodes;proj().otherNodes=p.otherNodes;refreshHolidays()}
 for(const t of next.tasks){const existing=db.tasks.find(x=>x.id===t.id);if(existing)Object.assign(existing,t);else db.tasks.push(t)}
 db.personal.push(...next.personal.slice(db.personal.length));
 const summary=items.map(i=>{const p=db.projects.find(p=>p.id===i.project);return [i.date+(i.time?' '+i.time:''),i.personal?'个人事项':p.name+' / '+p.systems.find(s=>s.id===i.system).name,i.title].join(' · ')}).concat(nodes.map(n=>'关键节点 · '+(n.title||scheduleNodes().find(x=>x.id===n.id)?.title)+' '+(n.when??'')+' '+(n.time||''))).join('；');
 chat.push({role:'assistant',text:'已安排：'+summary});conversation=[];
 const visible=items.find(i=>i.personal||i.project===db.current);if(visible)month=monthOf(visible.date);else if(nodes.find(n=>n.when))month=monthOf(nodes.find(n=>n.when).when);save();
 }catch(err){draft=lastUtterance;chat.push({role:'assistant',text:type==='aiError'?err.message:'未写入日程。请补充安排后重试。'});if(conversation.at(-1)?.role==='user')conversation.pop();render()}
 }
};
app.addEventListener('input',e=>{if(e.target.id==='backgroundBody')draftFor(proj()).body=e.target.value;if(e.target.id==='backgroundFeedback')draftFor(proj()).feedback=e.target.value;if(e.target.id==='revisionText')revisionDrafts.set(e.target.dataset.plan,e.target.value);if(e.target.id==='draft')draft=e.target.value;if(e.target.id==='projectDraft')pc.draft=e.target.value});
app.addEventListener('change',e=>{
 if(e.target.id==='interfaceLanguage'&&Object.hasOwn(interfaceLanguages,e.target.value)){void switchInterface(e.target.value).catch(e=>toast(e.message));return}
 if(e.target.id==='backupDrive'){backupDrive=e.target.value;return}
 if(labChange(e.target))return;
 if(typeof readingChange==='function'&&readingChange(e.target))return;
 if(typeof batchSetting==='function'&&batchSetting(e))return;
 if(e.target.id==='litProvider'){system(filter).paperPreference=e.target.value;save();return}
 if(e.target.dataset?.picker)changeModelPicker(e.target);
});
dialog.addEventListener('click',e=>{if(e.target.closest('[data-a="nav"][data-id="models"]')){e.preventDefault();dialog.close();view='models';render()}});
dialog.addEventListener('change',e=>{if(e.target.dataset?.picker)changeModelPicker(e.target)});
function changeModelPicker(target){
 const {picker,use}=target.dataset;
 const choice=db.aiChoices[use]||{provider:'',model:''};
 if(picker==='provider'){choice.provider=target.value;choice.model=''}
 else choice.model=target.value;
 db.aiChoices[use]=choice;refreshChoices();save(false);
 for(const el of document.querySelectorAll('.modelPick')){
  if(el.querySelector('select')?.dataset.use===use)el.outerHTML=modelSelectors(use);
 }
}
app.addEventListener('keydown',e=>{
 if(e.key!=='Enter'||e.isComposing||e.keyCode===229)return;
 if(e.target.id==='projectDraft')askProject();else if(e.target.id==='draft')ask();
});
app.addEventListener('click',e=>{
 const b=e.target.closest('[data-a]');if(!b)return;const a=b.dataset.a,id=b.dataset.id;
 if(quickVoice&&['nav','openSystem','switchProject','project'].includes(a))endQuickVoice();
 try{if(mailAction(a,id)||writingAction(a,id)||quickAction(a,id)||view==='tasks'&&area==='paper'&&manuscriptClick(a,id))return}catch(err){toast(err.message);return}
 if(a==='deleteRecord'){const action=b.closest('#projectMenu')?.dataset.recordAction;document.querySelector('#projectMenu')?.remove();if(action)deletePrompt(action,id);return}
 if(a==='projectExport'){const inArea=view==='tasks';exportProject(inArea?area:view==='overview'?'':view,inArea?filter:'',area==='lab'?labSession(system(filter)).open:'');return}
 if(a==='composeFeedback')return feedbackForm();
 if(view==='tasks'&&area==='lab'&&labClick(a,id))return;
 if(typeof readingAction==='function'&&readingAction(a,id))return;
 if(a==='refreshBalance'){refreshBalance(id);return}
 if(typeof accessClick==='function'){try{if(accessClick(a,id))return}catch(err){toast(err.message);return}}
 if(typeof deskClick==='function'){try{if(deskClick(a,id))return}catch(err){toast(err.message);return}}
 switch(a){
 case 'connectCodex':if(!db.providers.some(p=>p.format==='codexCLI')){
  const p={...servicePresets.codex,models:[...servicePresets.codex.models],id:uid()};
  db.providers.push(p);save();fetchCatalog(p.id);
 }return;
 case 'locateCodex':return send('locateCodex',{provider:id});
 case 'importNodes':return importNodesForm();
 case 'switchProject':
  if(id===db.current){
   const shared=!projectViews.includes(view)&&view!=='tasks';
   collapsedProject=!shared&&collapsedProject!==id?id:'';
   if(shared)view='overview';
   return animateProjectChange(render);
  }
  if(pending){toast('请等待当前助手返回。');return}
  db.current=id;collapsedProject='';view='overview';filter='';month=monthOf(localDay());resetChat();refreshHolidays();return animateProjectChange(()=>save());
 case 'ref':return referenceForm(id);
 case 'importRef':return send('importReference',{project:db.current,system:filter});
 case 'openRef':{const r=references(system(filter)).find(x=>x.id===id);if(r?.file)send('openReference',{file:r.file});return}
 case 'manualDesign':return designForm('');
 case 'design':return designForm(id);
 case 'aiDesign':return aiDesignForm();
 case 'batch':return batchForm(id);
 case 'journal':{const s=system(filter);return form('目标投稿期刊',field('journal','期刊全称',s.journal,'text',true),d=>{if(!d.journal)throw Error('请填写期刊名称。');s.journal=d.journal})}
 case 'newResult':case 'result':return measurementForm(id,a==='newResult');
 case 'newReport':return reportForm();
 case 'linkReport':return reportForm('',id);
 case 'editReport':return reportForm(id);
 case 'projectAsk':return askProject();
 case 'testAssistants':return startSmoke(id);
 case 'fetchModels':return fetchCatalog(id);

 case 'refreshDrives':return send('backupDrives');
 case 'backupDesktop':case 'backupExternal':return startBackup(a==='backupExternal');
 case 'generateBackground':return generateBackground();
 case 'saveBackground':{const value=draftFor(proj()).body.trim();if(!value)return toast('请先填写或生成研究背景。');proj().researchBackground=value;save();return toast('已保存研究背景。')}
 case 'removeProject':{const target=db.projects.find(p=>p.id===id);if(!target)return;if((id===db.current&&(pending||pc.busy))||activeDownload?.c.project===id)return toast('请先结束该课题的任务。');return warnDeleteProject(target)}
 case 'toggleAssistant':db.assistantClosed=!db.assistantClosed;return save();
 case 'toggleGroup':return toggleSidebarGroup(id,b);
 case 'tocEdit':return editTOC(id);
 case 'tocNew':return tocForm();
 case 'tocRevise':return tocForm(id);
 case 'tocShow':activeTOC=id;return render();
 case 'tocDrawio':case 'tocSVG':{const d=db.tocFigures?.find(x=>x.id===id);if(d)send('exportFigure',{format:a==='tocSVG'?'svg':'drawio',title:d.title,body:a==='tocSVG'?tocSVG(d):tocDrawio(d)});return}
 case 'diagramNew':return diagramForm();
 case 'diagramShow':activeDiagram=id;return render();
 case 'diagramExport':{const d=db.drawings?.find(v=>v.id===id);if(d)send('exportDiagram',{svg:diagramSVG(d)});return}
 case 'stopImport':return confirmStopImport();
 case 'nav':if(id==='backup')send('backupDrives');if(id==='vpn')send('vpnServices');app.querySelector('.main').scrollTop=0;stopVoice();view=id;filter='';break;
 case 'openSystem':if(area){area='';section='';send('closeArea')}app.querySelector('.main').scrollTop=0;view='tasks';filter=id;break;
 case 'work':return workForm();
 case 'newNode':return editNode('',id);
 case 'node':return editNode(id);
 case 'sync':refreshHolidays(true);toast('正在刷新年度安排');return;
 case 'project':if(pending||pc.busy){toast('请等待当前助手返回。');return}return projectEntry();
 case 'editProject':return projectForm(true,id);
 case 'system':return systemForm('');
 case 'editSystem':return systemForm(id);
 case 'task':return taskForm();
 case 'event':return taskForm(null,false,month===monthOf(localDay())?localDay():month+'-01');
 case 'day':return taskForm(null,false,id);
 case 'editTask':return taskForm(db.tasks.find(t=>t.id===id));
 case 'editPersonal':return taskForm(db.personal.find(t=>t.id===id),true);
 case 'donePersonal':
 case 'done':{const t=(a==='donePersonal'?db.personal:db.tasks).find(t=>t.id===id);t.done=!t.done;return save()}
 case 'prev':month=offsetMonth(month,-1);refreshHolidays();break;
 case 'next':month=offsetMonth(month,1);refreshHolidays();break;
 case 'today':month=monthOf(localDay());break;
 case 'provider':return editProvider(id);
 case 'removeProvider':return removeProvider(id);
 case 'credential':return native?send('credential',{provider:id}):toast('请在 Mac App 中设置密钥。');
 case 'projectVoice':case 'voice':if(!native)return toast('请在 Mac App 中使用语音。');if(listening)stopVoice();else{voiceArea=a==='projectVoice'?'project':'calendar';voicePrefix=voiceArea==='project'?pc.draft:draft;listening=true;send('voice')}break;
 case 'ask':return ask();
 }
 render();
});
bindLabBoard();
bindSorting();
bindProjectMenus();if(typeof bindInterface==='function')bindInterface();
if(native)send('load');else{const stored=localStorage.getItem('xiangxi-beta-preview');window.receiveNative('load',stored?JSON.parse(stored):null)}


let lastMinute='';
function updateClock(){
 const now=new Date(),stamp=localDay(now)+now.toTimeString().slice(0,5);
 if(stamp===lastMinute||!db)return;
 lastMinute=stamp;refreshHolidays();
 if(!dialog.open&&!['draft','projectDraft','revisionText','backgroundBody','backgroundFeedback'].includes(document.activeElement?.id)&&!listening)render();
}
setInterval(updateClock,60000);setInterval(mailTick,30000);
window.addEventListener('focus',updateClock);
