const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'..','web'),messages=[];
const element={addEventListener(){},querySelector(){return {scrollTop:0}},style:{},innerHTML:''};
const context=vm.createContext({assert,console,crypto,TextEncoder,queueMicrotask,setTimeout,clearTimeout,setInterval(){},document:{querySelector:()=>element},
 window:{addEventListener(){},webkit:{messageHandlers:{workspace:{postMessage:m=>messages.push(m)}}}}});
for(const [,file] of fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/<script src="([^"]+)"/g))vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
vm.runInContext(`(async()=>{
 window.receiveNative('load',seed());view='overview';let p=proj(),s=p.systems[0];filter=s.id;
 const c={project:p.id,system:s.id};
 assert.ok(app.innerHTML.indexOf('我的课题')<app.innerHTML.indexOf('效率工具')&&app.innerHTML.indexOf('效率工具')<app.innerHTML.indexOf('系统设置'));
 assert.ok(!eligiblePaper({title:'Retraction: An example'}));assert.ok(!eligiblePaper({title:'An article',notice:'yes'}));assert.ok(!eligiblePaper({title:'Author Correction to: Example'}));assert.ok(eligiblePaper({title:'Correction factors for spectroscopic measurements'}));
 const m={id:'meeting',title:'组会',date:localDay(),transcript:'前期工作',minutes:'',advice:[]};p.quickMeetings=[m];
 quickVoice={project:p.id,id:m.id,token:'mine',parts:new Map(),prefix:m.transcript};
 quickVoiceEvent('meetingSpeech',{token:'other',segment:1,text:'错误课题'});
 for(const [segment,text] of [[1,'第一'],[2,'第二段'],[1,'第一段']])quickVoiceEvent('meetingSpeech',{token:'mine',segment,text});
 assert.equal(m.transcript,'前期工作\\n第一段\\n第二段');endQuickVoice();
 db.providers=[{id:'fake',name:'测试模型',models:['mock']}];
 for(const use of ['minutes','advice','potDesign','measurement','corpus','manuscript'])db.aiChoices[use]={provider:'fake',model:'mock'};
 const ast=flowAI,rpc=askBatch;let lastContext=null,fetches=0;
 const sample={sections:['Introduction','Results'],guide:'按期刊结构、所有谱线标出单位。',marker:'footnote',referenceTemplate:'{authors}. {title}. {journal}, {year}, {volume}: {pages}.',font:'serif',columns:2};
 const paperEvidence='Evidence from the verified experimental observations.';
 flowAI=async(kind,ai,data)=>{
  if(kind==='minutes'){assert.equal(data.transcript,m.transcript);return {minutes:'导师确认了研究目标。'}}
  if(kind==='advice'){assert.equal(data.minutes,m.minutes);return {items:[{title:'复核表征',text:'校对单位',system:s.id,stage:'lab',target:'b'}]}}
  if(kind==='potDesign'){assert.equal(data.plan.title,'总体');return {category:'对照',question:'结构是否一致',purpose:'核对重复性',materials:'样品',procedure:'比较表征'}}
  if(kind==='measurement'){lastContext=data.context;return {body:'仅根据实测样品的观测范围形成解释。'}}
  if(kind==='journalStyle')return sample;
  if(kind==='paperQuery')return {queries:['test materials']};
  if(kind==='paperOutline'){assert.equal(data.research.experiments.length,2);return {title:'测试稿',abstract:'研究摘要',keywords:['材料'],sections:['背景','结果']}}
  if(kind==='paperSection')return {paragraphs:[[{text:'带证据的句子。',refs:[{id:data.sources[0].id,quote:paperEvidence}]}]]};
  throw Error('Unexpected model operation '+kind);
 };
 askBatch=async(op,args)=>{
  if(op==='journalCatalog')return Array.from({length:14},(_,i)=>({title:args.query+' '+i,journal:args.query,verifiedJournal:args.query,doi:'10.0000/test-'+i,pmc:'PMC'+(i+1)}));
  if(op==='journalFullText'){fetches++;return {file:'test-'+fetches+'.txt'}}
  if(op==='readAttachment')return [paperEvidence.repeat(20)];
  if(op==='paperEvidence')return [{title:'已核验文献',doi:'10.0000/evidence',journal:'测试刊',year:'2025',authors:'A',note:paperEvidence}];
  throw Error('Unexpected fetch '+op);
 };
 await quickGenerate(p,m,false);await quickGenerate(p,m,true);const a=m.advice[0],count=db.tasks.length;
 assert.equal(db.tasks.length,count);assert.ok(!a.applied);
 s.designs=[{id:'plan',title:'总体',question:'核心',batchOutline:['A：参照','B：实验'],submitted:true}];
 outlineBatches(s,s.designs[0]);outlineBatches(s,s.designs[0]);assert.equal(s.experiments.length,2);
 const b=s.experiments[0],values={title:'审核后的任务',text:'审核后的工作',project:p.id,system:s.id,stage:'lab',target:b.id};
 assert.throws(()=>applyQuickAdvice(m,a.id,{...values,target:'foreign'}));applyQuickAdvice(m,a.id,values);assert.throws(()=>applyQuickAdvice(m,a.id,values));
 assert.equal(db.tasks.length,count+1);assert.equal(reviewedWork(c,'lab',b.id)[0].title,values.title);
 await generatePot(c,b.id);assert.equal(b.preparation.category,'对照');Object.assign(b,b.preparation);
 const signal=parseSeries('ppm,intensity\\n8.2,1\\n8.1,12\\n8.0,0');
 assert.equal(signal.stats.peakAt,8.1);assert.equal(measurementMethod('data','chemical shift (ppm)'),'核磁共振（NMR）');
 assert.equal(measurementMethod('未知','0,1'),'');assert.equal(measurementMethod('IR','FTIR and NMR'),'');
 const jcamp=parseSeries('##XUNITS=ppm\\n##YFACTOR=2\\n##DELTAX=-1\\n##XYDATA=(X++(Y..Y))\\n10 1 3 5\\n##END=');
 assert.deepEqual(jcamp.points,[[10,2],[9,6],[8,10]]);
 const dense=buildSeries(Array.from({length:20000},(_,i)=>[i,i===14003?999:1]),'x','y');
 assert.ok(dense.points.length<=1000&&dense.points.some(p=>p[1]===999));
 assert.equal(batchState(s,b,p),'实验已安排');b.finished=true;assert.equal(batchState(s,b,p),'实验已完成');
 b.results=[{id:'spectrum',method:'NMR',series:signal,text:'实测谱',modified:'original'}];await analyzeBatch(c,b.id);
 assert.equal(batchState(s,b,p),'检测完成，数据报告已生成');assert.equal(lastContext.systemResearch,s.goal);assert.equal(lastContext.purpose,b.purpose);assert.equal(lastContext.question,b.question);
 b.results[0].modified='changed';assert.equal(batchState(s,b,p),'实验已完成');await analyzeBatch(c,b.id);
 assert.ok(spectrumFigure(b.results[0]).includes('3 个实测点'));
 db.authors=[{id:'author',name:'测试作者',english:'Test Author',affiliation:'测试单位',email:'test@example.org'}];
 s.paperTargets=[];for(const [i,name] of ['期刊甲','期刊乙'].entries()){
  const t=newPaperTarget(name);t.authors=['author'];t.lang=i?'英文':'中文';s.paperTargets.push(t);
  await learnJournal(c,t.id);assert.equal(t.corpus.length,12);assert.equal(t.profile.n,12);
  await learnJournal(c,t.id);assert.equal(fetches,12*(i+1));
  await writeManuscript(c,t);const d=t.drafts[0];assert.equal(d.journal,name);assert.equal(d.authors.length,1);assert.equal(d.refs.length,1);assert.equal(d.figures.length,1);
  assert.ok(renderManuscript(d).includes('note-1'));assert.ok(evidenceNotes(d).includes(paperEvidence));
 }
 assert.equal(s.paperTargets[0].drafts[0].lang,'中文');assert.equal(s.paperTargets[1].drafts[0].lang,'英文');
 assert.throws(()=>verifyParagraphs([[{text:'无法核对',refs:[{id:'R1',quote:'not in the text'}]}]],[{id:'R1',evidence:paperEvidence}]));
 assert.throws(()=>verifyParagraphs([[{text:'未绑定[2]',refs:[]}]],[]));
 b.log=[{id:'entry',date:localDay(),observation:'样品颜色变深',issue:'暂时中断',deviation:'延后检测'}];b.start='2026-12-05T09:00';b.end='2026-12-06T18:30';
 assert.equal(researchDates(p).filter(e=>e.id===b.id).length,2);
 assert.equal(reportInput(s,b,p).experimentLog[0].deviation,'延后检测');
 const picked=chosenResearch([b.id],[p]);assert.equal(picked[0].experiments.length,1);assert.equal(picked[0].experiments[0].experimentLog[0].issue,'暂时中断');
 const r={id:'report1',category:'组会',selection:[b.id],title:'周例会',date:'2026-12-07',time:'10:00'};p.reports=[r];
 assert.equal(events().find(x=>x.id===r.id).openAction,'editReport');
 for(const use of ['deck','thesis'])db.aiChoices[use]={provider:'fake',model:'mock'};
 const baseAI=flowAI;let seen=[];
 flowAI=async(kind,ai,data)=>{seen.push(data);if(kind==='deck')return {slides:[{role:'观察',title:'观察结果',points:['样品颜色变深']}]};if(kind==='thesisPart')return {body:'样品颜色变深'};return baseAI(kind,ai,data)};
 await makeDeck(r);await makeDeck(r,'每页突出一项观察');assert.equal(r.revisions.length,1);const beforeForm=form;form=(title,body,commit)=>commit({name:'每周风格',notes:''});deckAction('deckRecord',r.currentDeck,p);form=beforeForm;await makeDeck(r);assert.equal(seen.at(-1).template.instructions[0],'每页突出一项观察');
 p.thesis={title:'项目论文',degree:'硕士',parts:'实验观察 | 2500',selection:[b.id],authors:['author']};await makeThesis(p);assert.equal(seen.at(-1).totalParts,2);await makeThesis(p,'加入偏差说明');assert.ok(seen.at(-1).feedback);assert.equal(p.thesis.chapters.length,1);assert.ok(p.thesis.byline[0].includes('测试作者'));
 const plan=s.designs[0];const nTasks=db.tasks.length;
 scheduleDesign(db,p.id,s.id,plan,'','');const taskId=plan.taskId;
 updatePlan(plan,{...planValue(plan),title:'更新的概要',batchOutline:['B：实验','A：参照','C：补充']},'修订');
 assert.equal(submittedPlans(s)[0].title,'总体');scheduleDesign(db,p.id,s.id,plan,'','');
 assert.equal(plan.taskId,taskId);assert.equal(db.tasks.length,nTasks);assert.equal(submittedPlans(s)[0].title,'更新的概要');
 outlineBatches(s,submittedPlans(s)[0]);assert.equal(b.slot,1);assert.equal(b.results.length,1);
 const calendarTask={id:uid(),project:p.id,system:s.id,title:'讨论',date:localDay(),time:'10:00',reportTask:true};
 db.tasks.push(calendarTask);p.reports.push({id:'linked',source:calendarTask.id});
 eraseRecord(p,s,'editReport','linked');assert.ok(!db.tasks.includes(calendarTask));assert.ok(!p.reports.some(r=>r.id==='linked'));
 db.tasks.push(calendarTask);p.reports.push({id:'linked2',source:calendarTask.id});eraseRecord(p,s,'editTask',calendarTask.id);assert.ok(!p.reports.some(r=>r.id==='linked2'));
 eraseRecord(p,s,'openScheduledBatch',b.id);assert.equal(b.start,undefined);assert.ok(b.results.length);
 const s2=p.systems[1];p.thesis={title:'论文',authors:[],selection:[s.id,s2.id],chapterPlan:[{system:s.id,title:s.name,sections:[{title:'结果',words:500},{title:'小结',words:200}]},{system:s2.id,title:s2.name,sections:[{title:'结果',words:300}]}]};
 seen=[];await makeThesis(p);assert.equal(p.thesis.chapters.length,2);assert.equal(p.thesis.chapters[0].sections.length,2);assert.ok(seen.every(call=>call.research.length===1&&call.research[0].system===call.chapter));
 askBatch=rpc;flowAI=ast;
 console.log('通过：组会分段与人工审核、分锅设计、数据识别与报告状态、真实点位绘图、每刊 12 篇语料去重与恢复、双期刊稿件独立及引文核验。');
})()`,context).catch(e=>{console.error(e);process.exitCode=1});
