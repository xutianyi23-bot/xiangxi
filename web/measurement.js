'use strict';

const batchStates=['实验已安排','实验已完成','检测完成，数据报告已生成'];
function sharedMeasurements(s){
 return s.sharedMeasurements??={id:'shared:'+s.id,title:'其他检测结果与分析报告',results:[]};
}
function measurementGroups(s){
 return s.sharedMeasurements?[...batches(s),s.sharedMeasurements]:batches(s);
}
function labInventory(s){
 return (s.reagents||[]).map(({name,cas,amount,note})=>({name,cas,amount,note}));
}
function purposeContext(s,b,p){
 if(b===s.sharedMeasurements)return {project:p.name,background:p.researchBackground||p.goal,system:s.name,systemResearch:s.researchQuestion||s.goal,scope:'体系级检测',plans:submittedPlans(s).map(planValue)};
 const plan=submittedPlans(s).find(x=>x.id===b.designId);
 return {project:p.name,background:p.researchBackground||p.goal,system:s.name,systemResearch:s.researchQuestion||s.goal,
  plan:plan?planValue(plan):null,experiment:b.title,category:b.category,question:b.question,purpose:b.purpose,outline:b.outline||plan?.batchOutline?.[b.slot]||'',
  approvedWork:reviewedWork({project:p.id,system:s.id},'lab',b.id).map(t=>t.detail)};
}
function reportInput(s,b,p){
 return {...purposeContext(s,b,p),materials:b.materials,procedure:b.procedure,note:b.note,experimentLog:b.log||[],
  results:b.results.map(r=>({id:r.id,kind:r.kind,remark:r.remark,method:r.method,requirement:r.requirement,observation:r.text,source:r.sourceName,
   excerpt:r.excerpt,statistics:r.series?.stats,axes:r.series?[r.series.xLabel,r.series.yLabel]:null,points:r.series?.points,unconfirmed:!!r.pendingReview}))};
}
function reportStamp(s,b,p){
 const payload=reportInput(s,b,p);
 return JSON.stringify({...payload,results:b.results.map(r=>[r.id,r.modified,r.method,r.text,r.requirement])});
}
function batchState(s,b,p){
 if(b.report&&b.report.stamp===reportStamp(s,b,p))return batchStates[2];
 return b.finished||b.results.some(r=>!r.pendingReview)?batchStates[1]:batchStates[0];
}
function outlineBatches(s,plan){
 if(!plan?.submitted||!plan.batchOutline?.length)return;
 const rows=s.experiments||=[];
 const original=rows.filter(b=>b.designId===plan.id&&Number.isInteger(b.slot)),available=new Set(original);
 const assigned=plan.batchOutline.map(outline=>{
  const card=original.find(b=>available.has(b)&&b.outline===outline);
  if(card)available.delete(card);return card;
 });
 plan.batchOutline.forEach((outline,i)=>{
  let card=assigned[i]||original.find(b=>available.has(b)&&b.slot===i&&!b.finished&&!b.results?.length&&!b.log?.length);
  if(card){
   available.delete(card);
   if(card.outline!==outline){
    if(!card.purpose||card.purpose===card.outline)card.purpose=outline;
    if(card.title===card.outline?.split(/[：:]/)[0].slice(0,70))card.title=outline.split(/[：:]/)[0].slice(0,70);
    delete card.preparation;
   }
   Object.assign(card,{outline,slot:i});return;
  }
  rows.push({id:uid(),title:outline.split(/[：:]/)[0].slice(0,70),outline,category:'',unit:'锅',designId:plan.id,slot:i,
   question:plan.question,purpose:outline,note:'',materials:'',procedure:'',results:[],position:nextPosition(s)});
 });
 for(const historical of available)delete historical.slot;
 save();
}
function measurementMethod(name,text=''){
 const meta=(name+'\n'+text.slice(0,1800)).toLowerCase();
 const matches=[['核磁共振（NMR）',/\bnmr\b|核磁|chemical shift|化学位移|\bppm\b/],['红外光谱（FTIR）',/ftir|ft[-_ ]?ir|infrared|红外|wavenumber|波数/],
  ['X 射线衍射（XRD）',/\bxrd\b|衍射|2[- ]?theta|2θ/],['质谱（MS）',/质谱|mass spectrum|m\/z/],
  ['紫外可见光谱',/uv[-_ ]?vis|紫外可见/],['拉曼光谱',/拉曼|raman/],['热重分析',/热重|thermogravimetric|\btga\b/]];
 const found=matches.filter(([,reg])=>reg.test(meta.replace(/_/g,' ')));return found.length===1?found[0][0]:'';
}
function buildSeries(points,xLabel,yLabel){
 if(points.length<2)return null;
 let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,peakAt=0,troughAt=0;
 for(const [x,y] of points){minX=Math.min(minX,x);maxX=Math.max(maxX,x);if(y<minY){minY=y;troughAt=x}if(y>maxY){maxY=y;peakAt=x}}
 const reduced=[];
 if(points.length<=1000)reduced.push(...points);
 else{
  reduced.push(points[0]);const width=Math.ceil((points.length-2)/480);
  for(let i=1;i<points.length-1;i+=width){
   let low=i,high=i;for(let j=i+1;j<Math.min(points.length-1,i+width);j++){if(points[j][1]<points[low][1])low=j;if(points[j][1]>points[high][1])high=j}
   for(const j of new Set([Math.min(low,high),Math.max(low,high)]))reduced.push(points[j]);
  }reduced.push(points.at(-1));
 }
 return {xLabel:xLabel||'X',yLabel:yLabel||'Y',stats:{count:points.length,minX,maxX,minY,maxY,peakAt,troughAt},points:reduced};
}
function parseSeries(raw,xColumn=1,yColumn=2){
 const lines=raw.trim().split(/\r?\n/),points=[];
 if(/^##/m.test(raw)&&/##(?:XYDATA|PEAK TABLE|XYPOINTS)/i.test(raw)){
  const metadata={};let mode='';
  for(const line of lines){
   if(line.startsWith('##')){const i=line.indexOf('=');const key=line.slice(2,i).trim().toUpperCase();
    metadata[key]=line.slice(i+1).trim();mode=['XYDATA','PEAK TABLE','XYPOINTS'].includes(key)?key:'';continue}
   if(!mode||!line.trim())continue;
   const vals=line.split('$$')[0].trim().split(/[\s,;]+/).map(Number);
   if(vals.length<2||vals.some(n=>!Number.isFinite(n)))throw Error('此 JCAMP 数据采用压缩编码，请由仪器软件导出 XY 表格。');
   const fx=Number(metadata.XFACTOR||1),fy=Number(metadata.YFACTOR||1);
   if(mode==='XYDATA'){
    const dx=Number(metadata.DELTAX||((Number(metadata.LASTX)-Number(metadata.FIRSTX))/(Number(metadata.NPOINTS)-1)));
    if(!Number.isFinite(dx))throw Error('JCAMP 文件缺少横轴步长。');
    vals.slice(1).forEach((v,j)=>points.push([vals[0]*fx+j*dx,v*fy]));
   }else{if(vals.length%2)throw Error('JCAMP 的 XY 对不完整。');for(let j=0;j<vals.length;j+=2)points.push([vals[j]*fx,vals[j+1]*fy])}
  }
  if(points.some(p=>p.some(v=>!Number.isFinite(v))))throw Error('坐标比例因子无效。');
  return buildSeries(points,metadata.XUNITS,metadata.YUNITS);
 }
 const x=xColumn-1,y=yColumn-1;let header=[],labels=[];
 for(const line of lines){
  const t=line.trim();if(!t||t.startsWith('#'))continue;
  const separator=t.includes('\t')?'\t':t.includes(';')?';':t.includes(',')?',':/\s+/;
  const cells=t.split(separator).map(v=>v.trim().replace(/^"|"$/g,''));
  if(!cells[x]||!cells[y])continue;
  const asNumber=v=>Number(separator===';'?v.replace(',','.'):v);
  const a=asNumber(cells[x]),b=asNumber(cells[y]);
  if(Number.isFinite(a)&&Number.isFinite(b)){if(!points.length)labels=header;points.push([a,b])}
  else if(!points.length)header=cells;
 }
 return buildSeries(points,labels[x],labels[y]);
}
function spectrumFigure(r,style={}){
 const color=/^#[a-f0-9]{6}$/i.test(style.color)?style.color:"#58477e",width=Math.min(3,Math.max(1,Number(style.width)||1.6));
 const v=r.series;if(!v)return /^data:image\/jpeg;base64,[a-zA-Z0-9+/=]+$/.test(r.preview||'')?`<figure class="spectrum"><img src="${r.preview}" alt="原始检测图"><figcaption>${esc(r.sourceName)} · 原图预览</figcaption></figure>`:'';
 const {minX,maxX,minY,maxY,count}=v.stats,rev=/ppm|cm\s*[-⁻^]|波数|chemical shift/i.test(v.xLabel);
 const xx=x=>64+510*(rev?maxX-x:x-minX)/(maxX-minX||1),yy=y=>184-160*(y-minY)/(maxY-minY||1);
 const fmt=n=>String(Number(n.toPrecision(4))),path=v.points.map(([x,y],i)=>(i?'L':'M')+xx(x).toFixed(2)+' '+yy(y).toFixed(2)).join(' ');
 let ticks='';for(let i=0;i<=4;i++){
  const x=minX+(maxX-minX)*i/4,y=minY+(maxY-minY)*i/4;
  ticks+=`<text x="${xx(x)}" y="201" text-anchor="middle">${fmt(x)}</text><text x="56" y="${yy(y)+3}" text-anchor="end">${fmt(y)}</text>`;
 }
 return `<figure class="spectrum"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 610 236" role="img" aria-label="${esc(r.method)}"><rect width="610" height="236" fill="white"/><g fill="#39344a" font-size="11" font-family="${style.font==='serif'?'serif':'sans-serif'}">${ticks}<text x="325" y="226" text-anchor="middle">${esc(v.xLabel)}</text><text x="12" y="105" transform="rotate(-90 12 105)" text-anchor="middle">${esc(v.yLabel)}</text></g><path d="M64 22V184H576" stroke="#685f76" fill="none"/><path d="${path}" stroke="${color}" stroke-width="${width}" fill="none"/></svg><figcaption>${esc(r.method)} · ${count} 个实测点${v.points.length<count?'，显示抽稀曲线':''}</figcaption></figure>`;
}
function measurementPanel(s,b){
 const shared=b===s.sharedMeasurements;
 const planned=(b.plannedTests||[]).map(x=>'<article class="deskItem"><b>待补检测 · '+esc(x.title)+'</b>'+noteBlock(x.requirement)+noteBlock([x.date,x.source].filter(Boolean).join(' · '))+'</article>').join('');
 const p=proj(),key=b.id,busy=flowJobs.get(key),state=batchState(s,b,p);
 const rows=b.results.map(r=>`<article class="deskItem"><small>${esc(r.sourceName||'手动录入')}${r.pendingReview?' · 待确认检测类型与要求':''}</small><h3>${esc(r.method||'待识别检测')}</h3>${noteBlock(r.text||r.requirement)}${r.remark?noteBlock("备注　"+r.remark):''}${spectrumFigure(r)}<div class="actions">${btn(r.kind==='report'?'编辑已有报告':'编辑检测结果','result','link',r.id)}${btn('备注','resultRemark','link',r.id)}${r.file?btn('打开原始文件','rawMeasurement','link',r.id):''}</div></article>`).join('');
 return `<section class="box"><div class="sect"><h2>${shared?'其他检测结果与分析报告':'检测结果与分析报告'}</h2>${shared?"":`<span class="tag">${state}</span>`}</div>
 ${shared?'<p class="small">在这里保存跨锅对比、共用样品或整个体系的检测资料。</p>':''}<div class="actions">${btn('导入检测文件','importMeasurement','primary',key)}${btn('录入检测结果','newResult','btn',key)}${btn('导入已有分析报告','importReport','btn',key)}${btn('粘贴已有报告','pasteAnalysis','btn',key)}${!shared&&state===batchStates[0]?btn('标记实验已完成','finishBatch','link',key):''}</div>
 ${planned}${modelSelectors('measurement')}${rows||'<p class="empty">可导入 CSV、TSV、TXT、JCAMP、谱图图片或 PDF。</p>'}
 ${b.results.length?btn('分析检测数据并生成报告','analyzeBatch','primary',key):''} ${esc(busy||b.analysisError||'')}
 ${b.report?`<article class="deskItem"><h3>数据分析报告${state===batchStates[2]?'':' · 数据已变更，需重新分析'}</h3><small>${esc(b.report.model)} · ${esc(b.report.date)}</small>${noteBlock(b.report.body)}${b.report.remark?noteBlock('备注　'+b.report.remark):''}${btn('与 AI 修改报告','reviseAnalysis','btn',key)}${btn('报告备注','reportRemark','btn',key)}${btn('导出图文报告','exportAnalysis','btn',key)}</article>`:''}</section>`;
}
function measurementForm(id,adding,kind='result'){
 const s=system(filter),b=measurementGroups(s).find(x=>adding?x.id===id:x.results.some(r=>r.id===id));if(!b)return;
 const r=adding?null:b.results.find(x=>x.id===id),c=scope();
 if(kind==='report'||r?.kind==='report'){
  form(adding?'粘贴已有报告':'编辑已有报告',field('method','报告名称',r?.method||'已有分析报告','text',true)+longField('text','报告正文',r?.text||r?.excerpt)+longField('remark','备注',r?.remark),d=>{
   const text=requireText(d.text,'报告正文'),record=r||{id:uid(),kind:'report'};
   Object.assign(record,{method:d.method,text,remark:d.remark,modified:uid(),pendingReview:false});
   if(!r)b.results.push(record);
   b.analysisError='';
  });return;
 }
 const fields=(r?.importIssue?noteBlock(r.importIssue):'')+field('method','检测方法',r?.method)+longField('requirement','检测要求或需要回答的问题',r?.requirement)+longField('text','实测观察、峰位或仪器输出说明',r?.text)+longField('raw','两列或多列数值（可粘贴表格）',r?.raw)+
  field('xCol','横轴所在列（从 1 开始）',r?.xCol||1,'number')+field('yCol','纵轴所在列',r?.yCol||2,'number')+field('xLabel','横轴名称和单位',r?.series?.xLabel)+field('yLabel','纵轴名称和单位',r?.series?.yLabel)+longField('remark','备注',r?.remark);
 form(adding?'录入检测结果':'核对检测结果',fields,d=>{
  const method=d.method||measurementMethod(r?.sourceName||'',d.raw+'\n'+d.text);
  if(!method&&!d.requirement)throw Error('未识别检测方法，请填写检测类型或检测要求。');
  if(!d.raw&&!d.text&&!r?.excerpt)throw Error('请添加实测数值或观察。');
  const xCol=Number(d.xCol),yCol=Number(d.yCol);if(!Number.isInteger(xCol)||!Number.isInteger(yCol)||xCol<1||yCol<1||xCol===yCol)throw Error('请选择不同的有效横纵坐标列。');
  const series=d.raw?parseSeries(d.raw,xCol,yCol):null;
  if(d.raw&&!series)throw Error('所选两列未找到有效数值，请调整列号或将定性记录填入观察栏。');
  if(series){series.xLabel=d.xLabel||series.xLabel;series.yLabel=d.yLabel||series.yLabel}
  const result=r||{id:uid()};Object.assign(result,{remark:d.remark,method:method||'自定义检测',requirement:d.requirement,text:d.text,raw:d.raw,xCol,yCol,series,modified:uid(),pendingReview:false});
  if(!r)b.results.push(result);if(b!==s.sharedMeasurements)b.finished=true;b.analysisError='';
  if(db.aiChoices.measurement?.model&&b.question&&b.purpose)queueMicrotask(()=>analyzeBatch(c,b.id).catch(e=>toast(e.message)));
 },f=>{f.querySelector('.primary').textContent='确认检测结果'});
}
async function importMeasurement(c,id,kind='result'){
 const data=await askBatch('importMeasurement',{});if(!data||data.cancelled)return;
 const s=locate(c),b=s&&measurementGroups(s).find(x=>x.id===id);if(!b)return;
 const content=data.text||'',table=kind==='result'&&data.table,method=kind==='report'?'已有分析报告':measurementMethod(data.name,content);
 let series=null,issue=data.error||'';
 if(table){try{series=parseSeries(content)}catch(e){issue=e.message}}
 const r={id:uid(),kind,sourceName:data.name,file:data.file,preview:data.preview,method,raw:table?content:'',excerpt:table?'':content.slice(0,20000),text:table?'':content.slice(0,kind==='report'?40000:4000),series,pendingReview:!method||(!series&&(!content||table)),modified:uid()};
 if(issue){r.importIssue=issue;r.pendingReview=true}
 b.results.push(r);save();
 if(r.pendingReview){
  toast(issue||'请核对检测类型和要求。');
  if(view==='tasks'&&area==='lab'&&scope().project===c.project&&filter===c.system&&!dialog.open)measurementForm(r.id,false);
 }else if(db.aiChoices.measurement?.model&&b.question&&b.purpose){await analyzeBatch(c,id)}
}
async function analyzeBatch(c,id){
 const s=locate(c),b=s&&measurementGroups(s).find(x=>x.id===id),p=db.projects.find(x=>x.id===c.project);
 if(!b||!b.results.length)throw Error('请先添加检测结果。');
 if(b.results.some(r=>r.pendingReview))throw Error('请先核对待确认的检测结果。');
 if(b!==s.sharedMeasurements&&(!b.question||!b.purpose))throw Error('请在「编辑实验」中填写本锅要解决的问题和实验目的。');
 const ai=selectedAI('measurement'),stamp=reportStamp(s,b,p);
 await flowJob(id,async progress=>{
  try{
   const input=reportInput(s,b,p),reports=[];
   for(const r of input.results){
    const {results,...context}=input;const out=await flowAI('measurement',ai,{context,result:r});
    reports.push(r.method+'\n'+requireText(out.body,'检测报告'));
   }
   let body=reports.join('\n\n');
   if(b===s.sharedMeasurements&&reports.length>1){
    const material=await digestMaterial(body,ai,{},progress,15000);
    const synthesis=await flowAI('measurementRevision',ai,{previous:material,evidence:input.systemResearch,feedback:'综合各项体系级检测，注明来源、可比条件和局限，保留相互矛盾的观测。'});
    body=requireText(synthesis.body,'体系综合报告');
   }
   const current=locate(c),target=current&&measurementGroups(current).find(x=>x.id===id);
   if(!target||reportStamp(current,target,db.projects.find(x=>x.id===c.project))!==stamp)throw Error('实验或检测数据已修改，请重新分析。');
   if(target!==current.sharedMeasurements)target.finished=true;target.analysisError='';target.report={remark:target.report?.remark,body,stamp,date:localDay(),model:ai.model};save();
  }catch(e){b.analysisError=e.message;save();throw e}
 });
}
async function generatePot(c,id,choice,bulk=false,feedback=''){
 const s=locate(c),b=batches(s).find(x=>x.id===id),p=db.projects.find(x=>x.id===c.project);
 if(!b||(!feedback&&(!b.designId||!submittedPlans(s).some(d=>d.id===b.designId))))throw Error('请在「编辑实验」中选择已提交的总体方案。');
 const ai=choice||selectedAI('potDesign');
 const input=()=>({...purposeContext(s,b,p),inventory:labInventory(s),feedback,existing:{category:b.category,question:b.question,purpose:b.purpose,materials:b.materials,procedure:b.procedure,note:b.note},pendingDraft:b.preparation,experimentLog:b.log||[],otherBatches:batches(s).filter(x=>x.id!==id).map(x=>({title:x.title,purpose:x.purpose,materials:x.preparation?.materials||x.materials}))});
 const context=input(),stamp=JSON.stringify(context);
 const work=async()=>{
  const out=await flowAI('potDesign',ai,context);
  const target=batches(locate(c)||{}).find(x=>x.id===id);
  if(target!==b||JSON.stringify(input())!==stamp)throw Error('总体方案或实验目标已修改。');
  target.preparation=Object.fromEntries(['category','question','purpose','materials','procedure'].map(k=>[k,requireText(out[k],'单锅设计内容')]));
  if(feedback)(target.designFeedback??=[]).push(feedback);
  save();
 };
 if(bulk){if(flowJobs.has(id))throw Error('这锅实验正在单独生成，请稍后重试。');await work()}else await flowJob(id,work);
}
function measurementClick(a,id,s){
 const b=measurementGroups(s).find(x=>x.id===id);
 if(a==='resultRemark'||a==='reportRemark'){
  const r=a==='reportRemark'?b?.report:measurementGroups(s).flatMap(g=>g.results).find(x=>x.id===id);
  if(r)form('编辑备注',longField('remark','备注',r.remark),d=>{if(r.remark!==d.remark){r.remark=d.remark;if(a==='resultRemark')r.modified=uid()}});
  return true;
 }
 if(a==='pasteAnalysis'){measurementForm(id,true,'report');return true}
 if(a==='importReport'){if(!native)toast('请在 Mac App 中导入文件。');else void importMeasurement(scope(),id,'report').catch(e=>toast(e.message));return true}
 if(a==='revisePot'||a==='reviseAnalysis'){
  const pot=a==='revisePot',c=scope(),use=pot?'potDesign':'measurement',report=b?.report;
  if(!b||(!pot&&!report))return true;
  const previous=pot?(b.preparation||b):null,history=pot?b.designFeedback:report.feedback;
  form(pot?'与 AI 修改本锅方案':'与 AI 修改分析报告',noteBlock(pot?[previous.purpose,previous.materials,previous.procedure].filter(Boolean).join('\n\n'):report.body)+
   (history?.length?'<details><summary>历次修改要求</summary>'+noteBlock(history.join('\n'))+'</details>':'')+
   modelSelectors(use)+longField('feedback','这次希望怎么改？',''),d=>{
    const feedback=requireText(d.feedback,'修改要求'),ai=selectedAI(use);
    if(flowJobs.has(id))throw Error('正在处理，请完成后再修改。');
    if(pot){void generatePot(c,id,ai,false,feedback).catch(e=>toast(e.message));return}
    if(b.results.some(r=>r.pendingReview))throw Error('请先核对待确认的检测结果。');
    const p=db.projects.find(x=>x.id===c.project),stamp=reportStamp(s,b,p);
    void flowJob(id,async progress=>{
     const evidence=await digestMaterial(JSON.stringify(reportInput(s,b,p)),ai,{},progress,16000);
     const out=await flowAI('measurementRevision',ai,{previous:report.body,remark:report.remark,evidence,feedback});
     if(locate(c)!==s||!measurementGroups(s).includes(b)||b.report!==report||reportStamp(s,b,p)!==stamp)throw Error('检测记录或报告已变化，请重新修改。');
     b.report={...report,body:requireText(out.body,'修订报告'),feedback:[...(report.feedback||[]),feedback],date:localDay(),model:ai.model,stamp};save();
    });
   });return true;
 }
 if(a==='generateFromOverview'){
  const plans=submittedPlans(s);
  if(!plans.length){toast('请先提交实验设计概要。');return true}
  form('根据设计概要及药品自动生成','<label>实验设计概要<select name="plan">'+plans.map(p=>option(p.id,p.title,false)).join('')+'</select></label>'+noteBlock(labInventory(s).length?'将结合本体系已归档的试剂和余量生成各锅方案。':'尚未归档试剂。可以直接根据设计概要生成方案。')+modelSelectors('potDesign'),d=>{
   selectedAI('potDesign');queueMicrotask(()=>measurementClick('allPotDesigns',d.plan,s));
  },f=>f.querySelector('.primary').textContent='生成各锅方案与关系');return true;
 }
 if(a==='allPotDesigns'){
  const c=scope(),plan=submittedPlans(s).find(x=>x.id===id);if(!plan)return true;
  let ai;try{ai=selectedAI('potDesign')}catch(e){toast(e.message);return true}
  void flowJob(id,async progress=>{
   const source=designs(s).find(d=>d.id===id),version=plan.version||1;
   const inventory=labInventory(s),inventoryKey=JSON.stringify(inventory);
   let outline=source.labOutline?.inventoryKey===inventoryKey&&source.labOutline.version===version?source.labOutline.items:null;
   if(!outline){
    progress('正在根据实验设计概要安排分锅…');
    const out=await flowAI('splitOverview',ai,{overview:planValue(plan),system:s.name,goal:s.goal,inventory});
    if(!Array.isArray(out.batches)||!out.batches.length||out.batches.length>80)throw Error('未生成有效的实验安排，请重试。');
    outline=out.batches.map(x=>requireText(x,'实验安排'));
    if(JSON.stringify(labInventory(s))!==inventoryKey||locate(c)!==s||!designs(s).includes(source)||(submittedPlans(s).find(d=>d.id===id)?.version||1)!==version)throw Error('方案已变更，请重新生成。');
    source.labOutline={version,inventoryKey,items:outline};
   }
   plan.batchOutline=outline;
   outlineBatches(s,plan);
   const cards=batches(s).filter(b=>b.designId===id&&Number.isInteger(b.slot)&&b.slot<plan.batchOutline.length);
   let complete=0;
   for(const [i,card] of cards.entries()){
    if(JSON.stringify(labInventory(s))!==inventoryKey||!locate(c)||submittedPlans(locate(c)).find(x=>x.id===id)?.version!==plan.version)throw Error('已提交的方案发生变化，请按新版本重新生成。');
    progress('正在设计第 '+(i+1)+' / '+cards.length+' 锅');
    const prior=card.preparation;await generatePot(c,card.id,ai,true);
    if(card.preparation&&card.preparation!==prior)complete++;
   }
   if(cards.length>1&&complete===cards.length){
    progress('正在整理实验关系…');
    const snapshot=JSON.stringify(cards.map(b=>[b.id,b.preparation]));
    const out=await flowAI('batchRelations',ai,{plan:planValue(plan),batches:cards.map(b=>({id:b.id,title:b.title,design:b.preparation}))});
    const current=locate(c);if(!current||submittedPlans(current).find(x=>x.id===id)?.version!==plan.version||JSON.stringify(cards.map(b=>[b.id,batches(current).find(x=>x.id===b.id)?.preparation]))!==snapshot)throw Error('实验已变化，请重新生成关系。');
    if(!Array.isArray(out.relations))throw Error('单锅草案已保存，未取得有效关系。');
    const allowed=new Set(cards.map(b=>b.id));
    const next=out.relations.map(r=>{
     const members=[...new Set(r.members||[])];if(members.length<2||members.some(k=>!allowed.has(k)))throw Error('实验关系包含无效成员。');
     return {id:uid(),label:requireText(r.label,'关系名称'),members,generatedFor:id};
    });
    current.relations=[...(current.relations||[]).filter(r=>r.generatedFor!==id),...next];save();
   }
   toast('已生成 '+complete+' / '+cards.length+' 份草案，点开实验卡核对。');
  });return true;
 }
 if(a==='fromOutline'){outlineBatches(s,submittedPlans(s).find(x=>x.id===id));return true}
 if(a==='potDesign'||a==='analyzeBatch'||a==='importMeasurement'){
  if(a==='importMeasurement'&&!native){toast('请在 Mac App 中导入文件。');return true}
  const action=a==='potDesign'?generatePot:a==='analyzeBatch'?analyzeBatch:importMeasurement;
  void action(scope(),id).catch(e=>toast(e.message));return true;
 }
 if(a==='acceptPot'&&b?.preparation){batchForm(id,true);return true}
 if(a==='finishBatch'&&b){b.finished=true;save();return true}
 if(a==='rawMeasurement'){const r=measurementGroups(s).flatMap(b=>b.results).find(x=>x.id===id);if(r?.file)send('openMeasurement',{file:r.file});return true}
 if(a==='exportAnalysis'&&b?.report){
  const html='<h1>'+esc(b.title)+'</h1><p>'+esc(b===s.sharedMeasurements?'体系级检测':batchState(s,b,proj()))+'</p>'+noteBlock(b.report.body)+noteBlock(b.report.remark||'')+b.results.map(r=>spectrumFigure(r)+noteBlock(r.remark||'')).join('');
  exportArticle(b.title+'-检测报告',html);return true;
 }return false;
}
