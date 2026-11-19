'use strict';

const batchCalls=new Map();
let activeDownload=null;
function askBatch(op,args,signal){
 const requestID=uid();
 return new Promise((resolve,reject)=>{
  const timer=['pickDeckTemplate','mailCredential','diagramImage','chooseWorkspace','thesisTemplate'].includes(op)?null:setTimeout(()=>{batchCalls.delete(requestID);signal?.removeEventListener('abort',stop);if(op==='reagentAI'||op==='readReagentPhoto')send('cancelModel',{requestID});reject(Error('请求超时，请稍后重试。'))},120000);
  function stop(){clearTimeout(timer);batchCalls.delete(requestID);if(op==='chooseWorkspace')send('cancelWorkspaceScan',{requestID});if(['workflowAI','reagentAI','readReagentPhoto'].includes(op))send('cancelModel',{requestID});reject(Error('已终止导入。'))}
  if(signal?.aborted){stop();return}
  signal?.addEventListener('abort',stop,{once:true});
  batchCalls.set(requestID,{resolve,reject,timer,cleanup:()=>signal?.removeEventListener('abort',stop)});send(op,{...args,requestID});
 });
}
function batchResponse(d){
 const wait=batchCalls.get(d.requestID);if(!wait)return;
 wait.cleanup?.();clearTimeout(wait.timer);batchCalls.delete(d.requestID);
 if(d.error)wait.reject(Error(d.error));else wait.resolve(d.value);
}
function batchPlatforms(){return [{id:'pmc',name:'Europe PMC 开放全文',network:'',prefix:''},...publishers()]}
function batchSupported(p){return p.id==='cnki'||p.id==='elsevier'||p.id==='pmc'||splitRules(p.prefix).length>0}
function batchSelection(s,id){return s.downloadSettings?.[id]||{on:id==='pmc',count:1}}
function batchPanel(s){
 const run=s.literatureRun,busy=!!activeDownload,same=run&&activeDownload?.report.id===run.id;
 const options=batchPlatforms().map(p=>{
  const choice=batchSelection(s,p.id),allowed=batchSupported(p),disabled=busy||!allowed?'disabled':'';
  return `<div class="batchOption"><label><input type="checkbox" data-batch-on="${esc(p.id)}" ${allowed&&choice.on?'checked':''} ${disabled}>${esc(p.name)}</label>${allowed?`<label><input type="number" min="1" max="20" step="1" data-batch-count="${esc(p.id)}" aria-label="${esc(p.name)} 下载篇数" value="${esc(choice.count)}" ${disabled}> 篇</label>`:'<small>请在提供商设置中填写 DOI 前缀</small>'}</div>`;
 }).join('');
 const state=run?(run.running&&!same?'上次任务已中断，已归档的 PDF 已保留。':run.status):'';
 const items=(run?.results||[]).map((item,i)=>{
  const ref=references(s).find(r=>r.id===item.referenceId);
  return ref?`<article class="deskItem"><small>${esc(item.platform)}</small><h3>${esc(citationLine(ref,i))}</h3>${btn('打开 PDF','openRef','btn',ref.id)}</article>`:'';
 }).join('');
 const empty=run?.results?.length?'本轮下载的条目已从本体系移除。':run&&!run.results&&run.groups.some(g=>g.saved)?'旧版只保存了篇数，可在本体系参考文献中查看已归档的论文。':'本轮暂无已归档的论文。';
 return `<section class="box">${modelSelectors('batch')}<p class="small">AI 根据课题背景、导师交流和个人想法筛选候选文献。篇数按已归档的 PDF 统计。</p><label>本次检索词<input data-batch-query maxlength="200" placeholder="留空由 AI 按研究背景生成" value="${esc(s.downloadQuery||'')}" ${busy?'disabled':''}></label><div class="batchOptions">${options}</div><div class="actions">${busy?(same?btn('停止后续下载','batchStop','btn'):'另一个体系正在下载'):btn('下载文献','batchStart','primary')}</div></section><section class="box"><h2>本轮下载结果</h2>${run?`<div role="status"><p>${esc(state)}</p>${run.terms?noteBlock('英文库 · '+run.terms.query+'\n中文库 · '+run.terms.cn):''}${same&&paperJob?.status?noteBlock(paperJob.status):''}${run.groups.map(g=>`<p class="small">${esc(g.name)}　${g.saved} / ${g.count} 篇　${Number.isInteger(g.found)?'检索到 '+g.found+' 篇新候选　':''}${esc(g.note||'')}</p>`).join('')}</div>`:''}${items||noteBlock(empty)}</section>`;
}
function batchSetting(e){
 const t=e.target;if(t.hasAttribute?.('data-batch-query')&&!activeDownload){system(filter).downloadQuery=t.value.trim();save(false);return true}const id=t.dataset.batchOn||t.dataset.batchCount;if(!id||activeDownload)return false;
 const s=system(filter),v={...batchSelection(s,id)};
 if(t.dataset.batchOn)v.on=t.checked;else{
  const n=Number(t.value);if(!Number.isInteger(n)||n<1||n>20){toast('每个平台可选 1 至 20 篇。');render();return true}v.count=n;
 }
 (s.downloadSettings||={})[id]=v;save(false);return true;
}
function candidatePool(result,p,known){
 const rows=[],prefixes=splitRules(p.prefix);
 for(const row of result.rows||[]){
  if(typeof row.title!=='string'||!row.title.trim())continue;
  if(p.id!=='pmc'&&!prefixes.includes((row.doi||'').toLowerCase().split('/')[0]))continue;
  if(known.some(r=>r.file?.toLowerCase().endsWith('.pdf')&&samePaper(r,row)))continue;
  const old=rows.find(r=>samePaper(r,row));
  if(old){old.pmc||=row.pmc;old.pdfURL||=row.pdfURL;old.note||=row.note}else rows.push({...row});
 }
 return rows.filter(r=>r.pmc||r.pdfURL||(p.id==='elsevier'&&result.api&&r.doi)).sort((a,b)=>Number(!!b.pmc)-Number(!!a.pmc));
}
function saveBatch(job,status){
 const s=locate(job.c);if(!s)throw Error('原研究体系已移除。');
 job.report.status=status;s.literatureRun=job.report;save();
}
function sessionPlatform(p){return p.id==='cnki'||p.id==='elsevier'}
function batchPaper(job,p,r,searchURL,catalogURL){
 return new Promise((resolve,reject)=>{
  try{
   const target=searchURL||r?.sessionPDF||r?.articleURL||(r.doi?'https://doi.org/'+r.doi.split('/').map(encodeURIComponent).join('/'):(r.pdfURL||'https://europepmc.org/articles/'+r.pmc));
   paperLaunch(job.c,p,target,searchURL?'sessionCatalog':sessionPlatform(p)?'sessionPDF':'batch',r,catalogURL);paperJob.onBatch=resolve;
  }catch(err){reject(err)}
 });
}
async function runBatch(job,ai,topic){
 try{
  const terms=job.query?{query:job.query,cn:job.query}:await generateSearchTerms(ai,topic);
  const q=terms.query;job.report.terms=terms;
  for(const g of job.report.groups){
   if(job.stop)break;
   const p=job.platforms.find(x=>x.id===g.id);
   try{
    const query=p.id==='cnki'?(terms.cn||q):q;
    const route=networkArgs(p);saveBatch(job,'正在检索 '+g.name+' · '+query);
    let candidates,catalogURL;
    if(sessionPlatform(p)){
     const url=p.search.replace('{query}',encodeURIComponent([query,job.journal].filter(Boolean).join(' ')));
     if(p.id==='cnki')catalogURL=url;
     const result=await batchPaper(job,p,null,url);
     if(!result.rowsJSON)throw Error(result.message||'未取得平台检索结果。');
     candidates=JSON.parse(result.rowsJSON).filter(row=>!references(locate(job.c)).some(r=>r.file?.endsWith('.pdf')&&samePaper(r,row)));
    }else{
     const result=await askBatch('batchCatalog',{...route,vendor:p.id,prefixes:splitRules(p.prefix),query,count:g.count,journal:job.journal});
     candidates=candidatePool(result,p,references(locate(job.c)));
     if(!candidates.length&&result.failed?.length)throw Error('检索源连接失败：'+result.failed.join('、'));
    }
    g.found=candidates.length;
    if(!candidates.length){g.note='没有可供筛选的新论文。';continue}
    let tried=0;
    for(let base=0;base<candidates.length&&!job.stop&&g.saved<g.count;base+=24){
     const pool=candidates.slice(base,base+24);
     saveBatch(job,'AI 正在筛选 '+g.name+' 的候选论文…');
     const reply=readReply(await askBatch('batchAI',{...ai,context:JSON.stringify({phase:'rank',...topic,searchFocus:query,candidates:pool.map((r,i)=>({index:i,title:r.title,abstract:(r.note||'').slice(0,650)}))})}));
     if(!Array.isArray(reply.indices)||reply.indices.some(i=>!Number.isInteger(i)||i<0||i>=pool.length))throw Error('模型返回了无效的候选编号。');
     let limited=false;
     for(const i of new Set(reply.indices)){
      if(job.stop||g.saved>=g.count)break;
      const r=pool[i];if(references(locate(job.c)).some(x=>x.file?.toLowerCase().endsWith('.pdf')&&samePaper(x,r)))continue;
      saveBatch(job,'正在下载 · '+r.title);tried++;
      const out=await batchPaper(job,p,r,null,catalogURL);
      if(out.file&&out.referenceId){job.report.results.push({referenceId:out.referenceId,platform:g.name});g.saved++;g.note='最近来源：'+(out.downloadSource||g.name);saveBatch(job,'已归档 · '+r.title)}
      else{g.note=out.message||'此条目没有返回 PDF。';if(out.limited||out.paused){limited=true;break}}
     }
     if(limited)break;
    }
    if(!job.stop&&g.saved<g.count){g.note=(g.note?g.note+' ':'')+(tried?'可下载的相关论文不足。':'未筛选到相关论文。')}
   }catch(err){g.note=err.message}
  }
  const total=job.report.groups.reduce((n,g)=>n+g.saved,0);
  job.report.running=false;saveBatch(job,(job.stop?'已停止':'任务结束')+'，本次已归档 '+total+' 篇 PDF。');
 }catch(err){job.report.running=false;saveBatch(job,err.message)}
 finally{activeDownload=null;render()}
}
function beginBatch(){
 if(activeDownload||paperJob)throw Error('请先完成当前文献访问。');
 const s=system(filter),ai=selectedAI('batch'),ps=batchPlatforms().filter(p=>batchSupported(p)&&batchSelection(s,p.id).on);
 if(!ps.length)throw Error('请至少勾选一个下载平台。');
 const topic=literatureTopic(s);
 if(!s.downloadQuery&&!topic.question&&!topic.background&&!topic.project)throw Error('请填写研究背景或检索词。');
 const report={id:uid(),running:true,results:[],groups:ps.map(p=>({id:p.id,name:p.name,count:batchSelection(s,p.id).count,saved:0,note:''}))};
 if(s.downloadQuery)topic.searchFocus=s.downloadQuery;
 const job={query:s.downloadQuery||'',c:scope(),platforms:ps.map(p=>({...p})),report,journal:s.searchJournal||'',stop:false};activeDownload=job;saveBatch(job,job.query?'正在检索 '+job.query:'AI 正在生成检索词…');void runBatch(job,ai,topic);
}

function searchTerms(raw){
 const compact=v=>(typeof v==='string'?v:Array.isArray(v)?v.filter(x=>typeof x==='string').join(' '):'').trim().replace(/\s+/g,' ').slice(0,200);
 const clean=raw.trim().replace(/^```(?:json)?\s*|\s*```$/gi,'');
 let v;
 try{v=JSON.parse(clean)}catch{
  const object=clean.match(/\{[\s\S]*\}/);
  if(object){try{v=JSON.parse(object[0])}catch{return null}}
  else if(clean.length<=180&&!/[\n{}\[\]：:。！？]/.test(clean))v=clean;
 }
 if(!v)return null;
 const fields=v.keywords&&typeof v.keywords==='object'&&!Array.isArray(v.keywords)?v.keywords:v;
 const nested=fields.query&&typeof fields.query==='object'&&!Array.isArray(fields.query)?fields.query:fields;
 const query=compact(fields.query)||compact(nested.en)||compact(nested.english)||compact(fields.en)||compact(fields.english)||compact(fields.english_keywords)||compact(fields.keywords)||compact(v);
 const cn=compact(nested.cn)||compact(nested.zh)||compact(nested.chinese)||compact(fields.cn)||compact(fields.zh)||compact(fields.chinese)||compact(fields.chinese_keywords);
 return query||cn?{query:query||cn,cn:cn||query}:null;
}
async function generateSearchTerms(ai,topic){
 const request=extra=>askBatch('searchTermsAI',{...ai,context:JSON.stringify({...topic,...extra})});
 let terms=searchTerms(await request({}));
 if(!terms)terms=searchTerms(await request({formatReminder:'只输出字段 query 和 cn，各为一行简短检索词。'}));
 if(!terms)throw Error('两次回复均未包含可用检索词。可在“本次检索词”填写关键词后重试。');
 return terms;
}
