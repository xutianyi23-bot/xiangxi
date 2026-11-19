'use strict';

let deletionToSave='';
let backupDrives=[],backupDrive='',backupBusy=false,backupStatus='';
function backupPage(){
 const disabled=backupBusy?'disabled':'';
 return `<section class="box"><h2>打包备份</h2><p>将所有课题、实验、日程、参考文献和交流录音打包到桌面。</p><button class="primary" data-a="backupDesktop" ${disabled}>打包到桌面</button></section>
 <section class="box"><div class="sect"><h2>外部存储备份</h2>${btn('刷新设备','refreshDrives')}</div>
 <label>外部存储<select id="backupDrive">${backupDrives.length?backupDrives.map(d=>option(d.id,d.name,d.id===backupDrive)).join(''):'<option>未检测到可写的外部存储</option>'}</select></label>
 <button class="primary" data-a="backupExternal" ${backupBusy||!backupDrive?'disabled':''}>开始备份</button></section><p role="status">${esc(backupStatus)}</p>`;
}
function startBackup(external){
 if(backupBusy)return;
 if(!native)return toast('请在 Mac App 中使用备份。');
 backupBusy=true;backupStatus='正在打包全部课题…';render();
 send('workspaceBackup',{state:db,mode:external?'external':'desktop',drive:external?backupDrive:''});
}

function eraseProject(state,id){
 if(!state.projects.some(p=>p.id===id))return;
 state.projects=state.projects.filter(p=>p.id!==id);
 state.tasks=state.tasks.filter(t=>t.project!==id);
 if(state.current===id)state.current=state.projects[0]?.id||'';
}
function warnDeleteProject(p,final=false){
 if((p.id===db.current&&(pending||pc.busy))||activeDownload?.c.project===p.id)return toast('请先结束该课题的任务。');
 const warning=final?'最终确认。此操作无法撤销，删除后只能从事先制作的备份找回资料。':'该课题的所有体系、研究记录、参考文献和日程将从工作站移除。删除后无法撤销。';
 form(final?'最后确认删除课题':'删除课题前请确认',noteBlock('《'+p.name+'》')+noteBlock(warning),()=>{
  if(!final){queueMicrotask(()=>warnDeleteProject(p,true));return}
  const current=db.current===p.id;deletionToSave=p.id;eraseProject(db,p.id);backgroundDrafts.delete(p.id);if(current){filter='';view='overview';collapsedProject='';resetChat()}
 },f=>{
  const button=f.querySelector('.primary');button.textContent=final?'永久删除课题':'继续删除';button.classList.add('deleteConfirm');
  f.querySelector('#cancel').focus();
 });
}

const backgroundDrafts=new Map();
function draftFor(p){
 if(!backgroundDrafts.has(p.id))backgroundDrafts.set(p.id,{body:p.researchBackground||'',feedback:'',busy:false,error:''});
 return backgroundDrafts.get(p.id);
}
function projectBackgroundPanel(){
 const p=proj(),d=draftFor(p);
 return `<section class="box"><div class="sect"><h2>课题研究背景</h2><small>需要根据实际情况确定</small></div>
 ${p.researchBackground?`<details><summary>查看已保存的研究背景</summary>${noteBlock(p.researchBackground)}</details>`:''}
 ${modelSelectors('background')}
 <label>背景草稿<textarea id="backgroundBody" rows="7" ${d.busy?'disabled':''} placeholder="可直接撰写，也可由 AI 生成">${esc(d.body)}</textarea></label>
 <label>给 AI 的修改意见<textarea id="backgroundFeedback" rows="2" placeholder="例如：把第二段聚焦到课题的核心问题">${esc(d.feedback)}</textarea></label>
 <div class="actions"><button class="btn" data-a="generateBackground" ${d.busy?'disabled':''}>${d.busy?'正在生成…':d.body?'请 AI 修改草稿':'用 AI 生成背景'}</button><button class="primary" data-a="saveBackground" ${d.busy?'disabled':''}>保存研究背景</button></div>
 ${d.error?noteBlock(d.error):''}</section>`;
}
async function generateBackground(){
 const p=proj(),d=draftFor(p);if(d.busy)return;
 const feedback=d.feedback.trim(),previous=d.body;
 const materials=p.systems.map(s=>({system:s.name,meetings:(s.meetings||[]).map(m=>[m.title,m.summary||m.text].filter(Boolean).join('：')),ideas:(s.ideas||[]).map(i=>[i.title,i.text].filter(Boolean).join('：'))})).filter(s=>s.meetings.length||s.ideas.length);
 try{
  const ai=selectedAI('background');d.busy=true;d.error='';render();
  const reply=readReply(await askBatch('backgroundAI',{...ai,context:JSON.stringify({project:p.name,question:p.goal,materials,previous,feedback})}));
  if(typeof reply.body!=='string'||!reply.body.trim())throw Error('模型没有返回背景正文。');
  d.body=reply.body.trim();if(d.feedback.trim()===feedback)d.feedback='';
 }catch(e){d.error=e.message}finally{d.busy=false;render()}
}

const projectViews=['overview','calendar','reports','thesis'];
let collapsedProject='';
function navigationItems(projectGroup){
 return db.navOrder.filter(k=>projectViews.includes(k)===projectGroup).map(k=>{
  const active=view===k||(view==='tasks'&&k==='overview');
  return `<button ${dragAttributes('nav',k)} class="nav ${active?'active':''}" data-a="nav" data-id="${k}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">${icons[k]}</svg>${names[k]}</button>`;
 }).join('');
}
function toggleSidebarGroup(id,button){
 const closed=(db.collapsedGroups??={})[id]=!db.collapsedGroups?.[id],rows=document.querySelector('#group-'+id);
 if(!rows?.animate||window.matchMedia('(prefers-reduced-motion: reduce)').matches){save();return}
 save(false);button.setAttribute('aria-expanded',String(!closed));rows.hidden=false;
 rows.getAnimations().forEach(a=>a.cancel());
 const full={height:rows.scrollHeight+'px',opacity:1},empty={height:'0px',opacity:0};
 rows.style.overflow='hidden';
 const animation=rows.animate(closed?[full,empty]:[empty,full],{duration:180,easing:'ease-out'});
 animation.onfinish=()=>{rows.hidden=closed;rows.style.overflow=''};
}
function sidebarGroups(){
 const sections=[['projects','我的课题',projectNavigation()],['tools','效率工具',['quick','mechanism','toc','mail'].map(k=>`<button class="nav ${view===k?'active':''}" data-a="nav" data-id="${k}"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6">${icons[k]}</svg>${names[k]}</button>`).join('')],['settings','系统设置',navigationItems(false)]];
 return sections.map(([id,title,rows])=>{
  const open=!db.collapsedGroups?.[id];
  return `<div class="navGroup"><div class="groupHead"><button class="groupToggle" data-a="toggleGroup" data-id="${id}" aria-expanded="${open}" aria-controls="group-${id}"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="m4 2 4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>${title}</button>${id==='projects'?btn('＋ 添加','project','link'):''}</div>${id==='projects'&&typeof importMeter==='function'?importMeter():''}<div id="group-${id}" class="groupRows" ${open?'':'hidden'}>${rows}</div></div>`;
 }).join('');
}
function animateProjectChange(update){
 const list=app.querySelector('.projectList');
 if(!list?.querySelectorAll||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){update();return}
 const old=list.querySelector('.projectNav:not([inert])'),oldId=old?.previousElementSibling?.dataset.id;
 update();
 const rows=app.querySelector('.projectList')?.querySelectorAll('.projectRow')||[];
 for(const row of rows){
  const nav=row.nextElementSibling,closing=row.dataset.id===oldId&&!nav;
  if(!closing&&(!nav||row.dataset.id===oldId))continue;
  const el=closing?old:nav;if(!el?.animate)continue;
  if(closing){row.after(el);el.inert=true;el.style.pointerEvents='none'}
  const full={height:el.scrollHeight+'px',opacity:1},empty={height:'0px',opacity:0};
  el.style.overflow='hidden';
  const motion=el.animate(closing?[full,empty]:[empty,full],{duration:180,easing:'ease-out'});
  motion.onfinish=()=>{if(closing)el.remove();else el.style.overflow=''};
 }
}
function projectNavigation(){
 return '<div class="projectList">'+db.projects.map(p=>{
  const active=p.id===db.current,open=active&&collapsedProject!==p.id;
  return `<div><button ${dragAttributes('projects',p.id)} aria-expanded="${open}" aria-label="${esc(p.name)}" class="projectRow ${active?'chosen':''}" data-a="switchProject" data-id="${esc(p.id)}"><span aria-hidden="true">${open?'▾':'▸'}</span>${esc(p.name)}</button>${open?'<div class="projectNav">'+navigationItems(true)+'</div>':''}</div>`;
 }).join('')+'</div>';
}
const deleteKinds={
 editTask:'课题任务',done:'课题任务',editPersonal:'个人日程',donePersonal:'个人日程',node:'日历节点',editReport:'汇报任务',linkReport:'汇报日程',openScheduledBatch:'实验排期',
 batchOpen:'实验卡',editBatchLog:'实验记录',result:'检测记录',editRelation:'实验关系',selectPlan:'总体方案',design:'总体方案',quickSelect:'组会速记',meeting:'导师交流',idea:'研究想法',reagentEdit:'试剂',reviewReagents:'待核对的试剂记录',removeReagentImport:'导入的试剂附件',ref:'参考文献',paperVersion:'期刊稿件',paperSelect:'目标期刊',openSystem:'研究体系'
};
function removeLinkedDate(p,id){
 if(!id)return;
 const shared=db.personal.some(x=>x.id===id);
 db.personal=db.personal.filter(x=>x.id!==id);
 db.tasks=db.tasks.filter(x=>x.id!==id||x.project!==p.id);
 for(const project of shared?db.projects:[p]){
  project.reports=(project.reports||[]).filter(x=>x.source!==id);
  for(const s of project.systems)for(const plan of designs(s))if(plan.taskId===id)delete plan.taskId;
 }
 for(const key of ['mainNodes','otherNodes'])p[key]=(p[key]||[]).filter(n=>n.id!==id);
}
function removeSelection(id){
 for(const project of db.projects)for(const record of [...(project.reports||[]),project.thesis].filter(Boolean)){
  if(record.selection)record.selection=record.selection.filter(v=>v!==id);
  if(record.chapterPlan)record.chapterPlan=record.chapterPlan.filter(ch=>ch.system!==id);
 }
}
function eraseRecord(p,s,action,id){
 const remove=(obj,key)=>{if(obj?.[key])obj[key]=obj[key].filter(x=>x.id!==id)};
 if(action==='editReport'){const r=p.reports?.find(r=>r.id===id);if(r)removeLinkedDate(p,r.source);remove(p,'reports');return}
 if(['editTask','done','editPersonal','donePersonal','node','linkReport'].includes(action)){removeLinkedDate(p,id);return}
 if(action==='openScheduledBatch'){const b=p.systems.flatMap(batches).find(b=>b.id===id);if(b){delete b.start;delete b.end}return}
 if(action==='quickSelect'){remove(p,'quickMeetings');return}
 if(action==='openSystem'){
  const target=p.systems.find(x=>x.id===id);if(!target)return;
  for(const t of db.tasks.filter(t=>t.system===id&&t.project===p.id))removeLinkedDate(p,t.id);
  for(const b of batches(target))removeSelection(b.id);
  removeSelection(id);remove(p,'systems');return;
 }
 if(!s)return;
 if(action==='ref'){removeReference(s,id);return}
 if(action==='batchOpen'){
  const b=batches(s).find(b=>b.id===id);if(!b)return;
  removeLinkedDate(p,b.taskId);remove(s,'experiments');removeSelection(id);
  s.relations=(s.relations||[]).map(r=>({...r,members:r.members.filter(m=>m!==id)})).filter(r=>r.members.length>1);
  const ui=labSession(s);ui.selection.delete(id);if(ui.open===id)ui.open='';return;
 }
 if(['design','selectPlan'].includes(action)){
  removeLinkedDate(p,designs(s).find(x=>x.id===id)?.taskId);remove(s,'designs');
  for(const b of batches(s))if(b.designId===id){delete b.designId;delete b.preparation}
  return;
 }
 if(action==='result'||action==='editBatchLog'){for(const b of measurementGroups(s))remove(b,action==='result'?'results':'log');return}
 if(action==='paperVersion'){remove(currentTarget(s),'drafts');return}
 if(action==='paperSelect'){const t=paperTargets(s).find(x=>x.id===id);remove(s,'paperTargets');if(t&&s.journal===t.name)s.journal=s.paperTargets[0]?.name||'';return}
 if(action==='reviewReagents'||action==='removeReagentImport'){removeImports(s,(s.reagentImports||[]).filter(x=>x.id===id));return}
 if(action==='reagentEdit'){
  const row=s.reagents?.find(x=>x.id===id);remove(s,'reagents');
  if(row?.sourceId&&!s.reagents.some(x=>x.sourceId===row.sourceId))removeImports(s,(s.reagentImports||[]).filter(x=>x.id===row.sourceId&&x.archived));
  return;
 }
 const keys={editRelation:['relations'],idea:['ideas','designIdeas'],meeting:['meetings','designMeetings']};
 for(const key of keys[action]||[])remove(s,key);
}
function deletePrompt(action,id){
 const p=proj(),s=p?.systems.find(x=>x.id===filter);if(!p||!id)return;
 const reagent=action==='reagentEdit'?s?.reagents?.find(row=>row.id===id):null;
 if(action==='reagentEdit'&&!reagent)return;
 const detail=reagent?'将从本体系的试剂归档中删除「'+reagent.name+'」。原始文件会保留。':
 action==='openScheduledBatch'?'将同时清除这锅实验的开始和结束时间，保留实验记录。':
 action==='openSystem'?'将移除这个体系的研究资料、实验和关联日程。':
 ['editReport','editTask','done','editPersonal','donePersonal','linkReport','node'].includes(action)?'关联的日历事项、近期安排和汇报任务将一并移除。':'将从当前工作区移除这条记录。';
 form('删除'+deleteKinds[action]+'？',noteBlock(detail),()=>eraseRecord(p,s,action,id),f=>{f.querySelector('.primary').textContent='确认删除'});
}

function menuTarget(el){
 const direct=el.closest('[data-a][data-id]');if(direct?.dataset.id&&(direct.classList.contains('projectRow')||Object.hasOwn(deleteKinds,direct.dataset.a)))return direct;
 const row=el.closest('.line,.monthEvent,.labTile,.deskItem,tr,.importItem');
 return row&&[...row.querySelectorAll('[data-a][data-id]')].find(x=>x.dataset.id&&Object.hasOwn(deleteKinds,x.dataset.a));
}
function showProjectMenu(event,row){
 event.preventDefault();
 document.querySelector('#projectMenu')?.remove();
 const menu=document.createElement('div');
 menu.id='projectMenu';menu.setAttribute('role','menu');menu.setAttribute('aria-label','课题操作');
 const id=row.dataset.id;
 menu.innerHTML=row.classList.contains('projectRow')?btn('编辑课题','editProject','menuItem',id)+btn('删除课题','removeProject','menuItem removeProject',id):btn('删除'+deleteKinds[row.dataset.a],'deleteRecord','menuItem removeProject',id);
 if(!row.classList.contains('projectRow'))menu.dataset.recordAction=row.dataset.a;
 document.body.appendChild(menu);
 const rect=row.getBoundingClientRect(),keyboard=event.type==='keydown';
 menu.style.left=Math.max(0,Math.min(keyboard?rect.left:event.clientX,innerWidth-menu.offsetWidth))+'px';
 menu.style.top=Math.max(0,Math.min(keyboard?rect.bottom:event.clientY,innerHeight-menu.offsetHeight))+'px';
 for(const button of menu.children)button.setAttribute('role','menuitem');
 menu.firstElementChild.focus();
 menu.addEventListener('keydown',e=>{
  if(e.key==='Escape'){menu.remove();row.focus();e.preventDefault()}
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){(document.activeElement===menu.firstElementChild?menu.lastElementChild:menu.firstElementChild).focus();e.preventDefault()}
 });
 menu.addEventListener('pointerdown',e=>{if(e.button===0)e.preventDefault()});
 menu.addEventListener('click',e=>{
  const button=e.target.closest('[data-a]');if(!button)return;
  e.preventDefault();e.stopPropagation();menu.remove();
  if(button.dataset.a==='editProject')projectForm(true,id);
  else if(button.dataset.a==='removeProject'){const p=db.projects.find(v=>v.id===id);if(p)warnDeleteProject(p)}
  else if(menu.dataset.recordAction)deletePrompt(menu.dataset.recordAction,id);
 });
}
function bindProjectMenus(){
 app.addEventListener('contextmenu',e=>{const row=menuTarget(e.target);if(row)showProjectMenu(e,row)});
 app.addEventListener('keydown',e=>{const row=menuTarget(e.target);if(row&&(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')))showProjectMenu(e,row)});
 document.addEventListener?.('pointerdown',e=>{if(!e.target.closest('#projectMenu'))document.querySelector('#projectMenu')?.remove()});
}

const feedbackAddress='xutianyi23@mails.ucas.ac.cn';
function feedbackPage(){
 const guide=[
  ['开始使用','相析的靛紫双曲线图标用于程序坞和工作区左上角。进入课题后，侧栏珊瑚色标记表示当前页面。在「我的课题」旁点「＋ 添加」，进入课题总览后添加研究体系。在「系统设置 → 模型」配置服务商，并在要使用的功能旁选择模型。'],
  ['背景、文献与总体方案','在体系内记录导师意见和自己的想法，保存课题背景后检索或导入文献。进入「课题设计」生成草案，可手动编辑或让 AI 修改。提交后仍可修订，点「重新提交到实验区」更新实验区的概要。'],
  ['分锅与检测','在实验区点「根据设计概要及药品自动生成」，AI 结合概要与本体系已归档的试剂余量拟定各锅操作与用量。库存留空也可生成。提交概要无需分锅或排期。打开实验卡核对草案、安排起止时间，记录实际投料、现象、问题与方案偏差。单锅方案可在实验卡中对话修改，核对后采用。跨锅或体系共用的检测请放在下方「其他检测结果与分析报告」。可导入已有报告、分别写备注，或打开「与 AI 修改报告」继续修订。'],
  ['试剂归档','可多选照片、选择文件夹，或输入文字和语音。可选择识图模型逐张读瓶签；没有选择模型时使用本机识字。识别中的照片可以取消，待核对记录可单张删除或按导入批次撤回。归档后，点击试剂行的「删除试剂」或右键选择删除，确认后生效。只想移除照片时，可点击「移除照片」保留试剂条目。在待核对列表逐张确认名称、CAS 号、余量和备注后归档。'],
  ['组会、日历与汇报','组会速记可用麦克风转写，生成纪要后逐条审核工作建议。创建汇报时勾选体系或实验，可在 App 内预览真实 PPT，按历史版本修改或导出。导入 PPTX / POTX 模板时，至少需要一张有标题和正文文本框的示例页。可命名、查看、导出一套 PPT 相关风格。右键任务、日程或汇报选择删除，各入口同步更新。'],
  ['论文写作','期刊论文在体系的论文工作区生成。选择目标期刊和作者，补齐全文语料，生成后可核查引用并按建议改稿。大论文在课题侧栏中设置，每个选中体系对应一章，按节填写字数，模板与署名选填。'],
  ['分锅与关系','在实验工作区的「分锅与分组实验」点「根据设计概要及药品自动生成」，选择已提交的概要和模型。打开各锅核对操作与材料，关系线可点图例编辑。'],
  ['机理绘制','在效率工具选择「机理绘制」。输入底物和产物、选择手稿图片，或跨课题勾选实验。可生成机理图和流程图，并导出可编辑的 SVG。机理为待核对的解释，请检查电子箭头和立体化学。'],
  ['超级助手','右侧助手可按课题名称跨课题修改目标、任务和实验，也可创建组会、生成纪要和绘图。可随时收起或展开。'],
  ['TOC 图绘制','在效率工具中输入论文的核心发现，也可以选实验记录或添加一张参考图。可在「编辑图元」调整文字、位置、大小和颜色，也可按意见改稿并切换历史稿。导出 draw.io 后可逐个移动图形、修改文字和连接线，也可导出 SVG。'],
  ['提供商核验','在论文提供商卡片点击「核验登录状态」。程序沿用该提供商的网络和登录会话。网站没有显示明确状态时，可打开登录窗口核对，再次核验。'],
  ['Clash 接入','在 VPN 中点「接入 Clash 客户端」，按客户端设置填写代理类型和端口。可打开已安装的客户端、测试本机端口。保存后在论文提供商的访问网络中选用。'],
  ['侧栏导航','点击「我的课题」「效率工具」「系统设置」可折叠或展开各栏。工作站会记住选择。'],
  ['导入进度','左侧进度条显示已整理文件数与总数。点「终止」并确认可停止导入。'],
  ['语言与登录状态','新增法语、葡萄牙语、意大利语和俄语。首次选择时用模型准备界面语言包，此后可离线切换。提供商页面的登录状态来自最近的站内验证，无法确认时显示待核验。'],
  ['已有课题与导出','在「添加课题」选择已有课题，可多选文件夹或 ZIP。核对 AI 整理的记录后创建课题。在课题总览或各工作区点击导出，勾选内容，选择 PDF 或 Word 和保存位置。'],
  ['长篇写作','大论文按研究体系分章，各节按目标字数分段写作并保存。中断后点「继续生成学位论文」，完成后各章自动合并。'],
  ['科研邮件','在收件箱展开「如何接入邮箱」可查看字段说明及国科大填写示例。保存设置和客户端授权码后先点「立即读取」。首次取近七天，随后增量读取，App 需保持运行。可选将疑似科研邮件交给所选模型分析。核对归属后，补实验、检测和截止日期分别进入实验区与日历。'],
  ['论文修改','在科研邮件中归入目标稿件后，进入「论文工作区 → 论文修改」，保留审稿原文、拆分要求、选择原段落并逐项审核。确认后新增一稿。'],
  ['备份与反馈','在系统设置的「备份」中保存课题数据与附件。遇到问题，可在下方发送操作步骤、App 版本和现象。']
 ];
 return `<section class="box"><div class="sect"><h2>使用说明</h2><small>v1.0.0 内测版</small></div>${guide.map(([title,body])=>'<details><summary>'+title+'</summary>'+noteBlock(body)+'</details>').join('')}</section><section class="box"><h2>版权与使用</h2><p>© 2026 徐天翼（笔名：鸡腿堡）。相析使用 GPT-6.2 Astra 辅助开发。</p><p>相析源代码按 GNU 通用公共许可证第 3 版（GPL-3.0-only）发布。可按许可证条款使用、修改和分发；分发修改版时，须按同一许可证向接收者提供相应源码。</p></section><section class="box"><h2>意见反馈</h2><p>徐天翼（笔名：鸡腿堡） · ${feedbackAddress}</p>${btn('写反馈','composeFeedback','primary')}</section>`;
}
function feedbackForm(){
 form('意见反馈',noteBlock('收件人　'+feedbackAddress)+field('subject','主题','相析反馈','text',true)+longField('body','问题、建议或复现步骤'),d=>{
  if(!d.body)throw Error('请填写反馈内容。');
  if(native)send('composeFeedback',d);
  else window.location.href='mailto:'+feedbackAddress+'?subject='+encodeURIComponent(d.subject)+'&body='+encodeURIComponent(d.body);
 },f=>f.querySelector('.primary').textContent='在邮件应用中打开');
}
