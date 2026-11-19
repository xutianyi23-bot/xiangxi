const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'..','web');
const page={style:{},innerHTML:'',querySelector:()=>({scrollTop:0}),addEventListener(){}};
const nativeMessages=[];
const context=vm.createContext({assert,crypto,console,setInterval(){},setTimeout,clearTimeout,
 document:{querySelector:()=>page},window:{addEventListener(){},webkit:{messageHandlers:{workspace:{postMessage:m=>nativeMessages.push(m)}}}}});
for(const f of ['model.js','planning.js','calendar.js','providers.js','research.js','project-assistant.js','workspace-tools.js','citations.js','lab.js','reagents.js','meeting-notes.js','measurement.js','manuscript.js','deck-studio.js','mail-inbox.js','writing-tools.js','background.js','app.js']){
 vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),context,{filename:f});
}
vm.runInContext(`
const state=seed(),oldTasks=JSON.stringify(state.tasks);
window.receiveNative('load',state);
assert.equal(db.version,5);
assert.equal(JSON.stringify(db.tasks),oldTasks);
assert.equal(db.projects[0].mainNodes.length,3);
assert.equal(db.projects[0].otherNodes.length,3);
assert.ok(!app.innerHTML.includes('待推进任务'));
assert.ok(!app.innerHTML.includes('体系与任务'));
const w=db.work;
w.sync=true;
assert.deepEqual(dayCounts('2027-02-04','2027-02-14',w),{total:10,working:1});
w.rest=['2027-02-14'];
assert.equal(dayCounts('2027-02-04','2027-02-14',w).working,0);
w.sync=false;w.weekdays=[1,2,3,4,5,6];
assert.equal(dayCounts('2027-02-04','2027-02-14',w).working,8);
for(const n of [0,1,6,7,8,28,365,850]){
 const start='2026-01-03',end=shift(start,n); w.sync=true;
 let actual=0;
 for(let i=1;i<=n;i++)if(dayRule(shift(start,i),w).working)actual++;
 assert.equal(dayCounts(start,end,w).working,actual);
}
assert.equal(monthDays('2026-11').length,42);
assert.ok(monthDays('2028-02').includes('2028-02-29'));
assert.equal(offsetMonth('2026-12',1),'2027-01');
assert.equal(nodeBounds({when:'2028-02'})[1],'2028-02-29');
const now=new Date('2026-11-18T10:30:00');
assert.equal(nextNode([{when:'2026-11-18',time:'09:00'},{when:'2026-11-18',time:'11:00'}],now).time,'11:00');
assert.equal(nextNode([{when:'2026-10'},{when:'2026-11'}],now).when,'2026-11');
month='2026-11';view='calendar';const t=db.tasks[0];t.date='2026-11-18';t.done=true;render();
assert.ok(app.innerHTML.includes('monthEvent finished'));
t.done=false;render();assert.ok(!app.innerHTML.includes('monthEvent finished'));
const milestone=db.projects[0].mainNodes[0];milestone.when='2026-11-20';render();
assert.ok(app.innerHTML.includes('◆ 开题报告'));
milestone.when='2026-11';render();assert.ok(app.innerHTML.includes('约本月 · 开题报告'));
db.personal.push({id:'personal',title:'个人安排',date:'2026-11-19',done:true,time:''});
db.projects.push({id:'p2',name:'课题二',systems:[],mainNodes:initialNodes(mainTitles),otherNodes:initialNodes(otherTitles)});db.current='p2';render();
assert.ok(app.innerHTML.includes('个人安排'));
assert.ok(!app.innerHTML.includes(t.title));assert.ok(!app.innerHTML.includes('约本月 · 开题报告'));
console.log('已验证数据升级、导航、月历、事项归属、完成态、精确及月份节点、工作周与节假日叠加。');
`,context);

vm.runInContext(`
db.current='p1';
const systems=proj().systems;
assert.deepEqual(systems.map(s=>s.number),[1,2,3]);
assignSystemNumber(systems,systems[2],1);
assert.deepEqual(systems.map(s=>s.id),['s3','s2','s1']);
assert.equal(db.tasks.find(t=>t.id==='t1').system,'s1');
assignSystemNumber(systems,{id:'new',name:'体系测试'},2);
assert.deepEqual(systems.map(s=>s.number),[1,2,3,4]);
assert.throws(()=>assignSystemNumber(systems,systems[0],-1));
let blurred=false;
const input={value:'',setSelectionRange(){},blur(){blurred=true}};
bindClock(input);input.value='223';input.oninput();assert.ok(!blurred);
input.value='2460';input.oninput();assert.ok(!blurred);
input.value='2230';input.oninput();assert.equal(input.value,'22:30');assert.ok(blurred);
assert.equal(clockText('0000'),'00:00');
db.providers=[{id:'service',name:'测试服务',models:['a','b']}];
db.aiChoices={calendar:{provider:'service',model:'a'},another:{provider:'service',model:'b'}};
assert.ok(modelSelectors('calendar').includes('value="a" selected'));
db.providers[0].models=['b','c'];refreshChoices();
assert.equal(db.aiChoices.calendar.model,'');assert.equal(db.aiChoices.another.model,'b');
assert.ok(modelSelectors('calendar').includes('value="c"'));
db.providers=[];refreshChoices();assert.equal(db.aiChoices.another.provider,'');
assert.ok(modelSelectors('calendar').includes('去模型页'));
console.log('已验证编号迁移、互换、排序、时间输入和跨入口模型选择刷新。');
`,context);

vm.runInContext(`
const fixture=upgradeWorkspace(seed()), project=fixture.projects[0];
assert.deepEqual(fixture.navOrder,['overview','calendar','reports','thesis','models','vpn','publishers','backup','language','feedback']);
assert.ok(moveItem(fixture.navOrder,'reports','overview'));
assert.equal(fixture.navOrder[0],'reports');
const before=project.systems[1].id;
assert.ok(moveItem(project.systems,before,project.systems[0].id,true));
assert.equal(project.systems[0].id,before);assert.deepEqual(project.systems.map(s=>s.number),[1,2,3]);
let edited=applyProjectReply(fixture,'p1',{answer:'已记录',actions:[
 {op:'batch',system:before,title:'对照样品',note:'批次记录'},
 {op:'journal',system:before,journal:'目标期刊'}
]});
const exp=edited.projects[0].systems[0].experiments[0];
edited=applyProjectReply(edited,'p1',{answer:'已记录',actions:[
 {op:'result',system:before,batch:exp.id,method:'光谱',text:'样品 A 有一个峰'}
]});
db=edited;
assert.ok(labPanel(proj().systems[0]).includes('对照样品'));
assert.ok(batchDetail(proj().systems[0],proj().systems[0].experiments[0]).includes('样品 A 有一个峰'));
assert.ok(paperPanel(proj().systems[0]).includes('样品 A 有一个峰'));
assert.ok(paperPanel(proj().systems[0]).includes('目标期刊'));
assert.throws(()=>applyProjectReply(db,'p1',{answer:'',actions:[{op:'journal',system:'missing',journal:'X'}]}));
assert.equal(fixture.projects[0].systems[0].journal,undefined);
db.tasks.push({project:'p1',system:before,id:'meeting',title:'给导师汇报进展',date:'2030-06-12',time:'14:30'});
db.tasks.push({project:'p2',system:'other',id:'foreign',title:'组会',date:'2030-06-12',time:''});
assert.ok(reportSources().some(s=>s.id==='meeting'));
assert.ok(!reportSources().some(s=>s.id==='foreign'));
proj().reports=[{id:'linked',source:'meeting',title:'给导师汇报进展'}];
assert.ok(!reportsPage().includes('data-a="linkReport" data-id="meeting"'));
db.tasks.find(t=>t.id==='meeting').date='2030-07-01';
assert.ok(reportsPage().includes('2030-07-01'));
console.log('拖动排序、体系归属、实验与论文数据共享、课题编辑和汇报识别同步通过。');
`,context);


vm.runInContext(`
const trialState=upgradeWorkspace(seed()), target=trialState.projects[0].systems[0];
target.references=[{id:'ref1',title:'样本文献',note:'背景摘录'}];
const fields={batchOutline:['空白对照','测试组'],title:'测试计划',question:'研究问题',controls:'两组对照',steps:'记录并比较',readout:'比较离散度'};
assert.throws(()=>validateDesign({...fields,refs:['foreign']},['ref1']));
assert.throws(()=>validateDesign({...fields,steps:'',refs:['ref1']},['ref1']));
const proposal={...validateDesign({...fields,refs:['ref1']},['ref1']),id:'design'};
target.designs=[proposal];
const count=trialState.tasks.length;
delete proposal.batchOutline;
scheduleDesign(trialState,'p1','s1',proposal);scheduleDesign(trialState,'p1','s1',proposal);
assert.equal(trialState.tasks.length,count);assert.equal(proposal.submitted,true);assert.equal(batches(target).length,0);
console.log('背景引用校验、草案采纳、排期与重复写入保护通过。');
`,context);

vm.runInContext(`
db=upgradeWorkspace(seed());view='tasks';filter='s1';area='';section='';
render();assert.ok(app.innerHTML.includes('data-id="background"'));assert.ok(!app.innerHTML.includes('导师交流</h2>'));
const homeSys=system(filter);homeSys.references=[{id:'r',title:'Fixture',note:'Fixture note'}];
homeSys.meetings=[{id:'meeting',title:'导师意见',text:'原始转写标记',summary:'统一样品尺寸'}];
homeSys.ideas=[{id:'idea',title:'研究设想',text:'考虑对照组'}];
assert.ok(contextForDesign(homeSys).meetings[0].note.includes('统一样品尺寸'));
assert.ok(!JSON.stringify(projectSnapshot(db,db.current)).includes('原始转写标记'));
const revised={...fields,refs:['r'],id:'d',version:1};homeSys.designs=[revised];
const scopeBefore=scope();designRequest={...scopeBefore,id:'d',version:1,refs:['r'],feedback:'增加对照'};
filter='s2';receiveDesign('designReply',JSON.stringify({...fields,title:'修订稿',refs:['r']}));
assert.equal(revised.version,2);assert.equal(revised.history[0].plan.title,fields.title);
assert.equal(designs(system(filter)).length,0);assert.equal(homeSys.experiments?.length||0,0);
designRequest={...scopeBefore,id:'d',version:1,refs:['r'],feedback:'过时建议'};
receiveDesign('designReply',JSON.stringify({...fields,title:'过时回复',refs:['r']}));assert.equal(revised.title,'修订稿');
assert.ok(samePaper({doi:'10.123/ABC',title:'旧题名'},{doi:'10.123/abc',title:'New'}));
console.log('三个工作区入口、背景材料归属、跨窗口修订和过期回复保护通过。');
`,context);

for(const file of ['reading.js','access.js','literature-batch.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
vm.runInContext(`
db=upgradeWorkspace(seed());filter='s1';area='background';section='library';view='tasks';
const oldOrder={...db,navOrder:['reports','calendar','models','overview']};
assert.deepEqual(upgradeWorkspace(oldOrder).navOrder,['reports','calendar','models','overview','thesis','vpn','publishers','backup','language','feedback']);
const settings=publishers(),cnki=settings.find(x=>x.id==='cnki'),elsevier=settings.find(x=>x.id==='elsevier');
assert.equal(matchPublisher(settings,{doi:'10.1016/a'}).id,'elsevier');
assert.equal(matchPublisher(settings,{doi:'10.10160/a'}),undefined);
cnki.journals=' Polymer Test ';cnki.network='campus';networks().push({id:'campus',name:'校园',type:'system',service:'test-service'});
assert.equal(matchPublisher(settings,{doi:'10.1016/a',journal:'polymer test'}).id,'cnki');
assert.equal(matchPublisher(settings,{journal:'Polymer Test'},elsevier.id),elsevier);
const source=scope();system(filter).searchJournal='Polymer Test';assert.ok(publisherSearch(source,'硅橡胶'));
assert.ok(paperJob&&paperJob.c.system==='s1');accessEvent('paperFinished',{token:paperJob.token});
const ref={title:'读者选择的论文',doi:'10.1016/a'};getPaper(ref);const token=paperJob.token;
filter='s2';accessEvent('paperFinished',{token:'stale',file:'other.pdf'});assert.equal(paperJob.token,token);
accessEvent('paperFinished',{token,file:'correct.pdf',note:'摘录'});assert.equal(locate(source).references[0].file,'correct.pdf');assert.equal(references(system(filter)).length,0);
cnki.network='missing';assert.throws(()=>publisherSearch(source,'关键词'));assert.equal(paperJob,null);
console.log('期刊和 DOI 路由、手选覆盖、缺失网络拦截、异步 PDF 归属和旧版导航升级通过。');
`,context);

vm.runInContext(`
assert.ok(batchSupported(cnki));assert.ok(batchSupported(elsevier));
assert.ok(sessionPlatform(cnki));assert.ok(sessionPlatform(elsevier));assert.ok(!sessionPlatform({id:'pmc'}));
assert.equal(networkArgs({...cnki,mode:'ip',network:''}).proxyKind,'campus');
assert.equal(networkArgs({...cnki,mode:'ip',network:'local'}).proxyKind,'');
assert.equal(batchSelection({},'cnki').on,false);
assert.equal(batchSelection({downloadSettings:{cnki:{on:true,count:4}}},'cnki').count,4);
console.log('知网及 ScienceDirect 会话下载入口、平台篇数与校园直连选择通过。');
`,context);

vm.runInContext(`
db=upgradeWorkspace(seed());filter='s1';area='background';view='tasks';
const librarySystem=system(filter);
librarySystem.references=[{id:'old',title:'旧条目',file:'old.pdf',remark:'对照用'},{id:'new',title:'本轮论文',file:'new.pdf'}];
librarySystem.literatureRun={id:'run',groups:[],results:[{referenceId:'new',platform:'中国知网'}]};
for(const id of workflowStages){
 assert.ok(deskClick('area',id));
 assert.ok(app.innerHTML.includes('data-id="'+id+'" aria-current="step"'));
}
deskClick('area','library');assert.equal(section,'referenceShelf');
for(const tab of librarySections){
 assert.ok(deskClick('section',tab));assert.equal(section,tab);
 if(tab==='autoDownload'){assert.ok(app.innerHTML.includes('本轮下载结果')&&app.innerHTML.includes('本轮论文'));assert.ok(!app.innerHTML.includes('旧条目'))}
 if(tab==='manualDownload')assert.ok(app.innerHTML.includes('输入检索词')&&!app.innerHTML.includes('本轮下载结果'));
 if(tab==='referenceShelf')assert.ok(!app.innerHTML.includes('对照用')&&app.innerHTML.includes('旧条目')&&app.innerHTML.includes('导入文献'));
}
deskClick('section','referenceShelf');
console.log('文献区三个独立入口、返回路径、本轮归档范围与历史备注通过。');
`,context);

vm.runInContext(`
const shelfMarkup=referenceShelf(librarySystem);
assert.ok(shelfMarkup.includes('class="readingDot red"')&&!shelfMarkup.includes('对照用'));
readingAction('refDetails','old');
assert.ok(app.innerHTML.includes('data-a="removeRef" data-id="old"')&&app.innerHTML.includes('对照用'));
assert.equal(paperTitleText('CO&amp;lt;sub&amp;gt;2&amp;lt;/sub&amp;gt; &amp; Fe<sup>3+</sup> <i>via</i> x < 3'),'CO₂ & Fe³⁺ via x < 3');
assert.ok(shortPaperTitle('研究'.repeat(80)).length<=31);
assert.ok(shortPaperTitle('Long title '.repeat(20)).endsWith('…'));
readingAction('refDetails','old');assert.ok(!app.innerHTML.includes('对照用'));
librarySystem.designs=[{refs:['old']}];
removeReference(librarySystem,'old');removeReference(librarySystem,'old');
assert.deepEqual(references(librarySystem).map(r=>r.id),['new']);
assert.equal(sourceList(librarySystem,librarySystem.designs[0]),'[1] 旧条目[J].');
removeReference(librarySystem,'new');
assert.ok(batchPanel(librarySystem).includes('条目已从本体系移除'));
console.log('文献折叠、按条目删除及既有方案引用通过。');
`,context);

vm.runInContext(`
db=upgradeWorkspace(seed());const removed=db.current;
db.projects.push({id:'second',name:'另一个课题',systems:[]});
db.tasks.push({id:'kept',project:'second'});db.personal=[{id:'personal'}];
eraseProject(db,removed);assert.equal(db.current,'second');assert.deepEqual(db.tasks.map(x=>x.id),['kept']);
eraseProject(db,'second');area='';section='';view='overview';render();
assert.ok(app.innerHTML.includes('还没有课题'));assert.equal(db.personal.length,1);
window.receiveNative('load',JSON.parse(JSON.stringify(db)));assert.equal(db.projects.length,0);
view='backup';render();assert.ok(app.innerHTML.includes('开始备份')&&app.innerHTML.includes('打包到桌面'));
console.log('删除课题后的日程归属、最后一个课题的空工作区及备份入口通过。');
`,context);

vm.runInContext(`
db=upgradeWorkspace(seed());filter='s1';view='overview';area='';section='';
const navProject=proj();navProject.researchBackground='已保存研究背景标记';
const navSystem=system(filter);navSystem.designs=[{question:'不应进入检索的实验方案'}];
const sourceTopic=literatureTopic(navSystem);
assert.equal(sourceTopic.background,navProject.researchBackground);
assert.ok(!JSON.stringify(sourceTopic).includes('不应进入检索'));
assert.equal(contextForDesign(navSystem).background,sourceTopic.background);
assert.ok(!navigationItems(true).includes('备份'));assert.ok(!navigationItems(false).includes('课题日历'));
collapsedProject=db.current;assert.ok(!projectNavigation().includes('class="projectNav"'));
db.projects.push({id:'another',name:'其他课题',systems:[]});assert.ok(!projectNavigation().includes('class="projectNav"'));
collapsedProject='';render();assert.ok(!app.innerHTML.includes('data-a="removeProject"'));assert.ok(app.innerHTML.includes('系统设置'));
console.log('单课题自动展开、多课题折叠、设置分组与背景驱动检索通过。');
`,context);

vm.runInContext(`
{
 const v4=upgradeWorkspace(seed());v4.projects.push({id:'p-test',systems:[]});
 const original=[{id:'legacy',title:'开题报告',when:'2030-03',time:''}];
 v4.mainNodes=original;delete v4.projects[0].mainNodes;upgradeWorkspace(v4);
 assert.notEqual(v4.projects[0].mainNodes[0],v4.projects[1].mainNodes[0]);
 const updated=applyPlan(v4,[],[{category:'main',id:'legacy',when:'2030-03-10',time:'14:30'}]);
 assert.equal(updated.projects[0].mainNodes[0].time,'14:30');
 assert.equal(updated.projects[1].mainNodes[0].when,'2030-03');
 assert.throws(()=>applyPlan(v4,[],[{category:'main',id:'legacy',when:'2030-02-30'}]));
 assert.throws(()=>applyPlan(v4,[],[{category:'main',id:'legacy',project:'p-test',when:'2030-02'}]));
 assert.deepEqual(searchTerms('{"keywords":{"en":["cellulose","hydrogel"],"zh":["纤维素","水凝胶"]}}'),{query:'cellulose hydrogel',cn:'纤维素 水凝胶'});
 assert.equal(searchTerms('{"indices":[1]}'),null);
 assert.deepEqual(searchTerms('{"query":{"en":"porosity","zh":"孔隙率"}}'),{query:'porosity',cn:'孔隙率'});
 const blocks=readingChunks(['Alpha','', 'Z'.repeat(35000)],true);
 assert.deepEqual(blocks.missing,[2]);assert.ok(blocks.chunks.every(x=>x.length<=18000));
 assert.equal(blocks.chunks.join('').match(/Z/g).length,35000);
 assert.deepEqual(usagePeriods({'2025-12-20':{tokens:10,unmetered:0},'2026-01-01':{tokens:20,unmetered:0},'2026-01-08':{tokens:40,unmetered:0}},'2026-01-08'),['70','40','60']);
}
console.log('双语检索词、全文分段、旧节点迁移隔离、AI 日期校验与周月用量通过。');
`,context);

vm.runInContext(`
{
 const original=upgradeWorkspace(seed());
 original.aiChoices.design={provider:'a',model:'design-model'};
 upgradeWorkspace(original);
 for(const use of ['summary','background','reading','batch','keywords']){
  assert.deepEqual(original.aiChoices[use],original.aiChoices.design);
  assert.notEqual(original.aiChoices[use],original.aiChoices.design);
 }
 db=original;filter='s1';db.providers=[{id:'a',name:'A',models:['design-model']},{id:'b',name:'B',models:['reading-model']}];
 db.aiChoices.background=db.aiChoices.reading={provider:'b',model:'reading-model'};
 assert.deepEqual(selectedAI('background'),{provider:'b',model:'reading-model'});
 assert.deepEqual(selectedAI('summary'),{provider:'a',model:'design-model'});
 assert.ok(projectBackgroundPanel().includes('data-use="background"'));
 readingSettingsOpen=true;assert.ok(readingToolbar(system(filter)).includes('data-use="reading"'));readingSettingsOpen=false;
 assert.ok(batchPanel(system(filter)).includes('data-use="batch"'));
 assert.ok(manualDownloadPanel(system(filter)).includes('data-use="keywords"'));
 const p=publishers().find(x=>x.id==='cnki');
 for(const network of ['','campus','local']){
  const sso={...p,network,mode:'sso'};
  assert.equal(networkArgs(sso).proxyKind,'');
  assert.equal(loginURL(sso),'https://www.cnki.net/');
  assert.equal(loginURL({...sso,login:'https://fsso.cnki.net/'}),p.home);
 }
 assert.equal(loginURL({...p,mode:'sso',login:'https://portal.example.edu/'}),'https://portal.example.edu/');
 p.mode='ip';p.network='campus';
 paperJob={token:'this-visit',vendor:'cnki'};activeDownload={platforms:[{...p}]};
 accessEvent('paperSchoolLogin',{token:'stale'});assert.equal(p.mode,'ip');
 accessEvent('paperSchoolLogin',{token:'this-visit'});
 assert.equal(p.mode,'sso');assert.equal(activeDownload.platforms[0].mode,'sso');
 assert.equal(networkArgs(p).proxyKind,'');assert.equal(networkArgs(activeDownload.platforms[0]).proxyKind,'');
 paperJob=null;activeDownload=null;
}
`,context);

const observer=fs.readFileSync(path.join(root,'provider-page.js'),'utf8');
{
 let clicks=0;
 const button={innerText:'机构 IP 登录',dataset:{},getClientRects:()=>[1],click:()=>clicks++};
 const page={location:{hostname:'kns.cnki.net',pathname:'/article'},document:{body:{innerText:''},querySelectorAll:()=>[button]},getComputedStyle:()=>({visibility:'visible'})};
 const inspect=vm.runInNewContext(observer,page);
 assert.equal(inspect('cnki','ipLogin','sso').state,'waiting');
 assert.equal(inspect('cnki','ipLogin','ip').state,'ipClicked');assert.equal(clicks,1);
 assert.equal(inspect('cnki','ipLogin','ip').state,'waiting');
 for(const host of ['fsso.cnki.net','idp.university.example']){
  page.location.hostname=host;assert.equal(inspect('cnki','sessionCatalog','sso').state,'login');
 }
 page.location={hostname:'www.cnki.net',pathname:'/'};assert.equal(inspect('cnki','sessionCatalog','sso').state,'home');
}
{
 const js=fs.readFileSync(path.join(root,'cnki-login-status.js'),'utf8');
 function loginNotice(hostname,initial,later){
  const messages=[];let callback;
  const document={documentElement:{},body:{innerText:initial}};
  vm.runInNewContext(js,{location:{hostname},document,setTimeout:cb=>cb(),
   MutationObserver:class{constructor(cb){callback=cb}observe(){}disconnect(){}},
   window:{webkit:{messageHandlers:{cnkiLoginStatus:{postMessage:v=>messages.push(v)}}}}});
  if(later){document.body.innerText=later;callback?.()}
  return messages;
 }
 assert.deepEqual(loginNotice('login.cnki.net','来源应用不正确(01)'),['sourceRejected']);
 assert.deepEqual(loginNotice('kns.cnki.net','','来源应用不正确 （01）'),['sourceRejected']);
 assert.deepEqual(loginNotice('cnki.net.example','来源应用不正确(01)'),[]);
 assert.deepEqual(loginNotice('fsso.cnki.net','选择学校'),[]);
 const articleURL='https://kns.cnki.net/kcms2/article/abstract?filename=abc';
 const catalog='https://kns.cnki.net/kns8s/defaultresult/index?kw=test';
 let clicks=0;
 function link(innerText,href){return {innerText,href,dataset:{},click:()=>clicks++,matches:()=>true,getAttribute:key=>key==='href'?href:null,getClientRects:()=>[1]}}
 let links=[link('研究样本文献',articleURL),link('另一个标题','https://kns.cnki.net/kcms2/article/abstract?filename=other')];
 const page={URL,location:new URL(catalog),document:{body:{innerText:''},querySelectorAll:()=>links},getComputedStyle:()=>({visibility:'visible'})};
 const inspect=vm.runInNewContext(observer,page),wanted={title:'研究样本文献',url:articleURL};
 assert.equal(inspect('cnki','selectArticle','sso',false,wanted).state,'clicked');
 assert.equal(inspect('cnki','selectArticle','sso',false,wanted).state,'waiting');
 assert.equal(inspect('cnki','selectArticle','sso',false,{url:'none',title:'不存在'}).state,'waiting');
 page.location=new URL(articleURL);links=[link('PDF下载','https://kns.cnki.net/download')];
 assert.equal(inspect('cnki','sessionPDF','sso').state,'clicked');assert.equal(clicks,2);
 console.log('知网来源错误提示、结果页到文章及 PDF 的站内点击通过。');
}
vm.runInContext(`
{
 const previousDB=db,previousFilter=filter;
 const old=upgradeWorkspace(seed());old.version=4;
 const s=old.projects[0].systems[0];
 s.designs=[{id:'d1',title:'定稿',batchId:'empty'},{id:'d2',title:'旧计划',batchId:'written'}];
 s.experiments=[{id:'empty',designId:'d1',taskId:'schedule',planned:true,title:'定稿',note:'',results:[]},
  {id:'written',designId:'d2',planned:true,title:'旧计划',note:'已称量',results:[{id:'test',text:'已测量'}]}];
 upgradeWorkspace(old);upgradeWorkspace(old);
 assert.deepEqual(s.experiments.map(b=>b.id),['written']);assert.equal(s.experiments[0].results[0].text,'已测量');
 assert.equal(s.designs[0].taskId,'schedule');assert.equal(submittedPlans(s).length,2);
 s.meetings=[{title:'背景讨论',text:'背景意见'}];s.designMeetings=[{title:'新组会',text:'设计意见'}];
 s.ideas=[{title:'假设',text:'个人想法'}];db=old;filter=s.id;proj().researchBackground='课题背景';
 assert.equal(literatureTopic(s).ideas[0].note,'个人想法');assert.equal(literatureTopic(s).meetings[0].note,'背景意见');
 assert.equal(contextForDesign(s).designMeetings[0].note,'设计意见');assert.equal(contextForDesign(s).background,'课题背景');
 const formatted=citationLine({title:'Title',authors:'Li A',journal:'Journal',year:'2024',volume:'2',issue:'3',pages:'14–19',doi:'10.1234/test'},0);
 assert.equal(formatted,'[1] Li A. Title[J]. Journal, 2024, 2(3): 14–19. DOI: 10.1234/test.');
 s.experiments.push({id:'b2',title:'A',results:[]},{id:'b3',title:'B',results:[]});
 s.relations=[{id:'link',members:['written','b2','b3'],label:'对比'}];
 const before=wireMarkup(s,s.experiments.map(positionOf));assert.equal((before.match(/ L/g)||[]).length,2);
 s.experiments[2].position={x:150,y:250};assert.notEqual(wireMarkup(s,s.experiments.map(positionOf)),before);
 assert.ok(boardMarkup(s).includes('关系图例'));
 assert.deepEqual(reagentCandidates('乙醇，CAS 64-17-5，剩余 120 mL，备注 已开封。氯化钠，余量 20 g'),[
  {name:'乙醇',cas:'64-17-5',amount:'120 mL',note:'已开封'},{name:'氯化钠',cas:'',amount:'20 g',note:''}]);
 assert.deepEqual(reagentCandidates('Ethanol\\nCAS No. 64-17-5\\nNet: 500 mL\\nRemaining: 130 mL'),[{name:'Ethanol',cas:'64-17-5',amount:'130 mL',note:'Net: 500 mL'}]);
 assert.equal(reagentCandidates('甘油，CAS 56-81-9')[0].cas,'');assert.ok(!validCAS('56-81-9'));
 db=previousDB;filter=previousFilter;
}
console.log('总体方案和旧批次迁移、两阶段导师意见、正式引文、三锅连线与试剂解析通过。');
`,context);

vm.runInContext(`(async()=>{
 const pages=['a'.repeat(23000),'','b'.repeat(23000),'最后一页的对照数据'];
 const calls=[],realAsk=askBatch,ai={provider:'b',model:'reading-model'};
 const ref={file:'book.pdf',title:'测试长文'},progress=()=>{};
 try{
  const topic={background:'背景',meetings:[{note:'导师意见'}],ideas:[{note:'自己的想法'}],question:'核心问题'};
  const sRank=system(filter),oldRun=sRank.literatureRun;
  const platform={id:'pmc',name:'Europe PMC',network:'',prefix:''};
  const ranking={c:scope(),query:'',platforms:[platform],report:{id:'qaRank',groups:[{...platform,count:1,saved:0}],results:[]}};
  const checked=[];
  askBatch=async(op,args)=>{
   if(op==='batchCatalog')return {rows:[{title:'待筛文献',pmc:'PMC1'}]};
   const sent=JSON.parse(args.context);assert.deepEqual(sent.meetings,topic.meetings);
   assert.deepEqual(sent.ideas,topic.ideas);assert.equal(sent.background,topic.background);
   checked.push(op);return op==='searchTermsAI'?'{"query":"paper","cn":"文献"}':'{"indices":[]}';
  };
  await runBatch(ranking,ai,topic);
  assert.deepEqual(checked,['searchTermsAI','batchAI']);assert.equal(ranking.report.groups[0].saved,0);
  sRank.literatureRun=oldRun;
  for(const verbose of ['once','always']){
   calls.length=0;
   askBatch=async(op,args)=>{
    if(op==='readAttachment')return pages;
    assert.equal(args.provider,ai.provider);assert.equal(args.model,ai.model);
    const q=JSON.parse(args.context);calls.push(q);assert.ok(q.material.length<=readingLimit);
    if(q.phase==='extract')return '摘'.repeat(9500);
    if(q.phase==='condense')return verbose==='always'?'摘'.repeat(12001):'已精简';
    return '生成报告';
   };
   const result=await readPaper(ref,ai,progress);
   assert.deepEqual(result.missing,[2]);assert.equal(result.pages,4);assert.equal(result.provider,'b');
   if(verbose==='always'){
    const sections=calls.filter(x=>x.phase==='sectionReport');
    assert.equal(sections.length,readingChunks(pages,true).chunks.length);
    assert.ok(sections.at(-1).material.includes('最后一页的对照数据'));
    assert.ok(result.body.includes('PDF 第'));
   }else assert.equal(calls.at(-1).phase,'report');
  }
  calls.length=0;
  askBatch=async(op,args)=>{
   if(op==='readAttachment')return Array.from({length:64},(_,i)=>'['+i+']'+'a'.repeat(9000));
   const q=JSON.parse(args.context);calls.push(q.phase);assert.ok(q.material.length<=readingLimit);return '据'.repeat(1900);
  };
  await readPaper(ref,ai,progress);
  assert.ok(calls.filter(phase=>phase==='merge').length>=2);assert.equal(calls.at(-1),'report');
  const c=scope(),s=locate(c);
  s.references=[{id:'one',title:'长论文',file:'long.pdf'},{id:'bad',title:'损坏文件',file:'broken.pdf'},{id:'two',title:'第二篇',file:'short.pdf'}];
  askBatch=async(op,args)=>{
   if(op==='readAttachment'){
    if(args.file==='broken.pdf')throw Error('文件损坏');
    return args.file==='short.pdf'?['第二篇论文正文']:pages;
   }
   const q=JSON.parse(args.context);
   return ['extract','condense'].includes(q.phase)?'长'.repeat(9000):'报告 · '+q.title;
  };
  const batch=readSelection(c,['one','bad','two']);
  assert.equal(readingState(c,s.references[0]).color,'yellow');
  assert.equal(readingState(c,s.references[2]).color,'red');
  await batch;
  assert.equal(readingState(c,s.references[0]).color,'green');
  assert.equal(readingState(c,s.references[1]).color,'red');
  assert.equal(readingState(c,s.references[1]).error,'文件损坏');
  assert.equal(readingState(c,JSON.parse(JSON.stringify(s.references[2]))).color,'green');
  assert.equal(readingState(c,{...s.references[2],file:'replaced.pdf'}).color,'red');
  assert.ok(s.references[0].readingReport.body.includes('按原文顺序整理'));
  assert.equal(s.references[1].readingReport,undefined);
  assert.equal(s.references[2].readingReport.body,'报告 · 第二篇');
  assert.equal(readingJob,null);
  console.log('独立 AI 设置迁移、知网 IP 与学校登录分流、超长摘录重试、多层及批量报告保存通过。');
 }finally{askBatch=realAsk}
})()`,context).catch(e=>{console.error(e);process.exitCode=1});
