'use strict';

const inventoryFields=[['name','试剂名称'],['cas','CAS 号'],['amount','剩余用量'],['note','备注信息']];
const recognizingReagents=new Set();
let inventoryVoice=null;
function reagentPanel(s){
 const rows=s.reagents||[],imports=s.reagentImports||[];
 const pending=imports.filter(x=>!x.archived).map(item=>{
  const job=reagentJobs.get(item.id),busy=!!job||recognizingReagents.has(item.id);
  return `<div class="importItem"><b>${esc(item.title)}</b><small>${esc(job?.status||(busy?'正在转写…':item.error||(item.paused?'已取消识别':item.recognizer?item.recognizer+' · 待核对':'待核对')))}</small>
  ${busy?(job?btn('取消识别','stopReagent','link',item.id):''):btn('核对并归档','reviewReagents','btn',item.id)+btn('重新识别','retryReagents','link',item.id)}${btn('删除','removeReagentImport','link',item.id)}</div>`;
 }).join('');
 const groups=[...new Set(imports.filter(x=>x.batch&&x.group&&!x.archived).map(x=>x.group))];
 const batchControls=groups.map(id=>{
  const items=imports.filter(x=>x.group===id&&!x.archived);
  return '<div class="actions"><small>'+esc(items[0].title)+' 等 '+items.length+' 张待核对</small>'+btn('撤回这批照片','removeReagentGroup','link',id)+'</div>';
 }).join('');
 return `<section class="box inventory"><div class="sect"><h2>试剂归档 <span class="num">${rows.length}</span></h2></div>${modelSelectors('reagent')}<p class="small">选择支持识图的模型后，照片会交给该服务商逐张读标签。未选模型时使用本机识字。包装规格记入备注，实际余量以明确记录为准。</p><div class="actions">${btn('识别图片或文件夹','reagentImage')}${btn('语音添加','reagentVoice')}${btn('文字添加','reagentText')}${btn('手动添加','reagentEdit','link')}</div>${batchControls}${pending}
 <div class="tableScroll"><table><thead><tr>${inventoryFields.map(([,label])=>'<th>'+label+'</th>').join('')}<th></th></tr></thead><tbody>${rows.map(r=>`<tr>${inventoryFields.map(([k])=>`<td>${esc(r[k]||'—')}</td>`).join('')}<td>${btn('编辑','reagentEdit','link',r.id)}${btn('删除试剂','deleteReagent','link',r.id)}${imports.some(x=>x.id===r.sourceId&&photoRecord(x))?btn('移除照片','removeReagentImport','link',r.sourceId):''}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">暂无试剂</td></tr>'}</tbody></table></div></section>`;
}
function validCAS(value){
 if(!/^\d{2,7}-\d{2}-\d$/.test(value))return false;
 const digits=value.replace(/-/g,'').split('').map(Number),check=digits.pop();
 return digits.reverse().reduce((sum,n,i)=>sum+n*(i+1),0)%10===check;
}
function reagentCandidates(raw){
 // Tab-separated rows can be pasted directly from a spreadsheet. Keep empty cells in place.
 const remaining=/^(?:剩余(?:用量|量)?|余量|还剩(?:下)?|剩下|剩|remaining(?: amount)?|balance)\s*[:：]?\s*/i;
 const label=/^(?:试剂名称|名称|品名|试剂|reagent(?: name)?|product name|name)\s*[:：]\s*/i;
 const metadata=/^(?:备注|说明|规格|容量|净含量|批号|货号|纯度|浓度|包装|lot\b|batch\b|net\b|purity\b|volume\b|notes?\b|\d+(?:\.\d+)?\s*(?:%|mg\b|kg\b|g\b|ml\b|l\b|毫升|克))/i;
 const casRE=/\d{2,7}\s*[-－–]\s*\d{2}\s*[-－–]\s*\d(?!\d)/;
 const rows=[];
 function newRow(name=''){
  const row={name,cas:'',amount:'',note:''};rows.push(row);return row;
 }
 function addNote(row,text){if(text)row.note=[row.note,text].filter(Boolean).join('；')}
 for(const block of raw.replace(/\r/g,'').split(/\n|[;；。]/)){
  const line=block.trim();if(!line)continue;
  if(block.includes('\t')){
   const [name,cas='',amount='',...notes]=block.split('\t').map(v=>v.trim());
   if(name==='试剂名称'&&/CAS/i.test(cas))continue;
   rows.push({name,cas,amount,note:notes.join(' ')});continue;
  }
  // Keep numeric locants such as 1,2- in chemical names together.
  const parts=line.replace(/\s*(CAS\s*(?:号|No\.?)?\s*[:：]?|剩余|余量|还剩|剩下|备注|\bremaining\b)/gi,'，$1')
   .split(/，|,(?!\d)/).map(x=>x.trim()).filter(Boolean);
  let row=rows.at(-1);
  for(const [i,part] of parts.entries()){
   const match=part.match(casRE),leading=match?part.slice(0,match.index).trim():'';
   if(remaining.test(part)){
    row||=newRow();row.amount=part.replace(remaining,'').trim();
   }else if(match||/^CAS\b/i.test(part)){
    if(leading&&!/^CAS/i.test(leading))row=newRow(leading.replace(label,''));
    row||=newRow();
    const cas=match?.[0].replace(/\s/g,'').replace(/[－–]/g,'-')||'';
    if(validCAS(cas)){row.cas=cas;addNote(row,part.slice(match.index+match[0].length).trim())}
    else addNote(row,'待核对 '+part);
   }else if(metadata.test(part)){
    row||=newRow();addNote(row,part.replace(/^(?:备注|notes?)\s*[:：]?\s*/i,''));
   }else if(i===0||label.test(part)||!row){
    row=newRow(part.replace(label,''));
   }else addNote(row,part);
  }
 }
 return rows.length?rows:[{name:'',cas:'',amount:'',note:''}];
}
function reagentEdit(s,id){
 const row=(s.reagents||[]).find(x=>x.id===id);
 const source=row&&(s.reagentImports||[]).find(x=>x.id===row.sourceId);
 form(row?'编辑试剂':'添加试剂',inventoryFields.map(([key,label])=>key==='note'?longField(key,label,row?.[key]):field(key,label,row?.[key],'text',key==='name')).join('')+
  (source?`<details><summary>归档来源 · ${esc(source.title)}</summary>${noteBlock(source.text)}${source.file?'<button type="button" class="btn" data-original>打开原件</button><button type="button" class="link" data-remove-source>移除来源附件</button>':''}</details>`:''),d=>{
   if(!d.name)throw Error('请填写试剂名称。');
   if(d.cas&&!validCAS(d.cas))throw Error('CAS 号位数或校验码无效，请核对或留空。');
   if(row)Object.assign(row,d);else (s.reagents||=[]).push({...d,id:uid()});
  },f=>{const btn=f.querySelector('[data-original]');if(btn)btn.onclick=()=>send('openReagentFile',{file:source.file});const remove=f.querySelector('[data-remove-source]');if(remove)remove.onclick=()=>confirmRemoveImports(s,[source])});
}
function beginInventoryVoice(f){
 if(!native)return toast('请在 Mac App 中使用语音识别。');
 if(inventoryVoice){endInventoryVoice();return}
 stopVoice();const input=f.elements.raw,button=f.querySelector('[data-dictate]');
 const token=uid();inventoryVoice={input,button,token,prefix:input.value+(input.value?'\n':'')};button.textContent='停止口述';
 send('voice',{token});
}
function endInventoryVoice(){
 if(!inventoryVoice)return;
 send('stopVoice');inventoryVoice.button.textContent='开始口述';inventoryVoice=null;
}
function reagentTextForm(s,voice){
 const c=scope();
 const actions=voice?'<div class="actions"><button type="button" class="btn" data-dictate>开始口述</button><button type="button" class="btn" data-audio>导入录音文件</button></div>':'';
 form(voice?'语音添加试剂':'文字添加试剂',actions+'<label>试剂记录<textarea name="raw" rows="7" placeholder="例如：乙醇，CAS 64-17-5，剩余 120 mL，备注 已开封。每种试剂可单独一行。"></textarea></label>',d=>{
  if(!d.raw)throw Error('请先输入或口述试剂信息。');
  endInventoryVoice();const item={id:uid(),title:voice?'试剂口述':'试剂文字记录',text:d.raw};
  (s.reagentImports||=[]).push(item);queueMicrotask(()=>scheduleReagent(c,s,item));
 },f=>{
  f.querySelector('.primary').textContent='核对识别结果';
  if(voice){
   f.querySelector('[data-dictate]').onclick=()=>beginInventoryVoice(f);
   f.querySelector('[data-audio]').onclick=()=>{
    if(!native)return toast('请在 Mac App 中导入录音。');
    endInventoryVoice();send('importReagent',{...c,kind:'audio',id:uid()});
   };
   dialog.addEventListener('close',endInventoryVoice,{once:true});
  }
 });
}
function reviewReagents(s,item){
 if(!item||item.archived)return;
 const renderRow=(row,i)=>`<tr>${inventoryFields.map(([k,label])=>`<td><input name="${k}_${i}" aria-label="${label}" value="${esc(row[k]||'')}"></td>`).join('')}<td><button type="button" class="link" data-remove>移除</button></td></tr>`;
 let rowIndex=0;
 const controls=(item.file?'<button type="button" class="btn" data-original>打开原件</button><button type="button" class="link" data-remove-source>删除导入记录</button>':'')+'<div class="actions"><button type="button" class="btn" data-parse>按原文重新提取</button><button type="button" class="btn" data-ai '+(db.providers.length?'':'hidden')+' >'+(photoRecord(item)?'AI 重新读图':'AI 整理原文')+'</button></div>';
 form('核对试剂归档',`<label>识别原文<textarea rows="4" name="raw">${esc(item.text)}</textarea></label>${controls}${db.providers.length?modelSelectors('reagent'):''}
 <div class="tableScroll"><table><thead><tr>${inventoryFields.map(([,v])=>'<th>'+v+'</th>').join('')}<th></th></tr></thead><tbody>${(item.rows?.length?item.rows:item.rows? [{}]:reagentCandidates(item.text||'')).map(r=>renderRow(r,rowIndex++)).join('')}</tbody></table></div><button type="button" class="link" data-add>＋ 添加一行</button>`,d=>{
  const records=[];
  for(let i=0;i<rowIndex;i++){
   if(d['name_'+i]===undefined)continue;
   const row=Object.fromEntries(inventoryFields.map(([k])=>[k,d[k+'_'+i]]));
   if(!row.name)throw Error('请填写每一行的试剂名称，或移除空行。');
   if(row.cas&&!validCAS(row.cas))throw Error(row.name+' 的 CAS 号未通过校验，请核对原文或留空。');
   records.push({...row,id:uid(),sourceId:item.id});
  }
  if(!records.length)throw Error('请保留至少一种试剂。');
  if(item.archived||!s.reagentImports?.includes(item))throw Error('记录已发生变化，请重新打开。');
  (s.reagents||=[]).push(...records);item.text=d.raw;item.archived=true;
 },f=>{
  f.classList.add('inventoryReview');
  if(item.error)f.querySelector('.formerror').textContent=item.error;
  const remove=f.querySelector('[data-remove-source]');if(remove)remove.onclick=()=>confirmRemoveImports(s,[item]);
  const original=f.querySelector('[data-original]');if(original)original.onclick=()=>send('openReagentFile',{file:item.file});
  const tbody=f.querySelector('tbody'),input=f.elements.raw,ai=f.querySelector('[data-ai]'),error=f.querySelector('.formerror');
  const fill=rows=>{tbody.innerHTML=rows.map(r=>renderRow(r,rowIndex++)).join('')};
  tbody.onclick=e=>{if(e.target.closest('[data-remove]'))e.target.closest('tr').remove()};
  f.querySelector('[data-add]').onclick=()=>tbody.insertAdjacentHTML('beforeend',renderRow({},rowIndex++));
  f.querySelector('[data-parse]').onclick=()=>fill(reagentCandidates(input.value));
  ai.onclick=async()=>{
   try{
    const raw=input.value.trim();if(!raw&&!photoRecord(item))throw Error('请先填写识别原文。');
    const choice=selectedAI('reagent');ai.disabled=true;ai.textContent='整理中…';error.textContent='';
    const before=JSON.stringify([...new FormData(f)]);
    const controller=new AbortController();dialog.addEventListener('close',()=>controller.abort(),{once:true});
    const image=photoRecord(item)?await askBatch('readReagentPhoto',{file:item.file,vision:true},controller.signal):undefined;
    if(!dialog.open||!f.isConnected||!currentReagent(s,item))return;
    const result=readReply(await askBatch('reagentAI',{...choice,image,context:JSON.stringify({text:raw})},controller.signal));
    if(!dialog.open||!f.isConnected||!currentReagent(s,item))return;
    if(before!==JSON.stringify([...new FormData(f)]))throw Error('表格或原文已修改，已保留手动编辑。');
    const rows=reagentRows(result,image?result.transcript:raw);if(!rows.length)throw Error('未取得有效的试剂清单，请核对原件。');
    fill(rows);item.rows=rows;item.recognizer=choice.model;item.error='';
    if(image&&typeof result.transcript==='string')input.value=result.transcript;
    item.text=input.value;save(false);
   }catch(e){error.textContent=e.message}finally{ai.disabled=false;ai.textContent=photoRecord(item)?'AI 重新读图':'AI 整理原文'}
  };
  f.querySelector('.primary').textContent='确认归档';
 });
}
const reagentJobs=new Map(),reagentQueue=[],removedReagentFiles=new Set();
let activeReagentJobs=0;
const photoRecord=item=>/\.(?:heic|heif|jpe?g|png|tiff?|bmp)$/i.test(item.file||'');
function currentReagent(s,item){return !item.archived&&s.reagentImports?.includes(item)}
function reagentRows(result,source){
 const normalize=text=>String(text||'').normalize('NFKC').toLowerCase().replace(/[－–—]/g,'-').replace(/\s+/g,'');
 const evidence=normalize(source);
 if(!Array.isArray(result?.rows))throw Error('模型没有返回试剂表格。');
 const rows=result.rows.filter(r=>typeof r?.name==='string'&&r.name.trim()).map(r=>{
  const row=Object.fromEntries(inventoryFields.map(([k])=>[k,typeof r[k]==='string'?r[k].trim():'']));
  row.cas=row.cas.replace(/[－–—]/g,'-').replace(/\s/g,'');
  if(row.cas&&(!validCAS(row.cas)||!evidence.includes(row.cas))){row.note=[row.note,'CAS 待核对：'+row.cas].filter(Boolean).join('；');row.cas=''}
  if(row.amount){
   const quote=String(r.amountSource||'').trim(),amount=normalize(row.amount);
   if(!quote||!evidence.includes(normalize(quote))||!normalize(quote).includes(amount)||!/(?:剩|余量|餘量|结余|结存|结存量|残量|remaining|remain|left|balance)/i.test(quote)){
    row.note=[row.note,'数量待核对：'+row.amount].filter(Boolean).join('；');row.amount='';
   }
  }
  return row;
 });
 return rows;
}
function stopReagent(s,item){
 const job=reagentJobs.get(item.id);if(job){reagentJobs.delete(item.id);job.controller.abort()}
 const i=reagentQueue.indexOf(job);if(i>=0)reagentQueue.splice(i,1);
 item.paused=true;item.error='';
}
function removeImports(s,items){
 for(const item of items){
  if(!s.reagentImports?.includes(item))continue;
  stopReagent(s,item);
  for(const r of s.reagents||[])if(r.sourceId===item.id)delete r.sourceId;
  if(item.file)removedReagentFiles.add(item.file);
  s.reagentImports=s.reagentImports.filter(x=>x!==item);
 }
}
function confirmRemoveImports(s,items){
 if(!items.length)return;
 form(items.length===1?'删除导入记录？':'撤回这批照片？',noteBlock((items.length===1?items[0].title:'将移除 '+items.length+' 张待核对的照片')+'。同时清理工作站内的副本，桌面原件和已归档的试剂行会保留。'),()=>removeImports(s,items),f=>f.querySelector('.primary').textContent='确认删除');
}
function scheduleReagent(c,s,item){
 if(!currentReagent(s,item)||reagentJobs.has(item.id))return;
 let ai;try{ai=selectedAI('reagent')}catch{}
 const job={s,item,c,ai,controller:new AbortController(),status:'等待识别'};
 item.paused=false;item.error='';reagentJobs.set(item.id,job);reagentQueue.push(job);drainReagentQueue();
}
function drainReagentQueue(){
 while(activeReagentJobs<2&&reagentQueue.length){
  const job=reagentQueue.shift();activeReagentJobs++;
  void processReagent(job).finally(()=>{activeReagentJobs--;drainReagentQueue()});
 }
}
async function processReagent(job){
 const {c,s,item,ai,controller}=job,signal=controller.signal;
 const live=()=>!signal.aborted&&locate(c)===s&&currentReagent(s,item)&&reagentJobs.get(item.id)===job;
 try{
  if(!live())return;
  const photo=photoRecord(item);
  job.status=photo?(ai?'AI 正在读标签':'正在本机识字'):'正在整理试剂记录';render();
  let image;
  if(photo){
   const data=await askBatch('readReagentPhoto',{file:item.file,vision:!!ai},signal);
   if(!live())return;
   if(ai)image=data;
   else{item.text=data;item.rows=reagentCandidates(data);item.recognizer='本机识字';return}
  }
  if(ai){
   const result=readReply(await askBatch('reagentAI',{...ai,image,context:JSON.stringify({text:item.text||'',source:photo?'试剂标签照片':'试剂记录'})},signal));
   if(!live())return;
   item.rows=reagentRows(result,photo?result.transcript:item.text);item.recognizer=ai.model;
   if(photo&&typeof result.transcript==='string')item.text=result.transcript;
   if(!item.rows.length)item.error='未能读出试剂名称。请打开原件核对或更换照片。';
  }else{item.rows=reagentCandidates(item.text||'');item.recognizer='本机提取'}
 }catch(e){if(live())item.error=(ai?'AI 识别未完成：':'识别未完成：')+e.message}
 finally{
  if(reagentJobs.get(item.id)===job){
   reagentJobs.delete(item.id);
   if(locate(c)===s&&currentReagent(s,item)){
    save();if(!item.batch&&!item.error&&view==='tasks'&&area==='lab'&&scopedKey(scope())===scopedKey(c)&&!dialog.open)reviewReagents(s,item);
   }
  }
 }
}
function recognizeReagents(c,s,item){
 if(photoRecord(item)||!item.file){scheduleReagent(c,s,item);return}
 if(recognizingReagents.has(item.id))return;
 item.paused=false;recognizingReagents.add(item.id);send('recognizeReagent',{...c,id:item.id,file:item.file});render();
}
function reagentEvent(type,d){
 if(type==='voice'&&d.token){
  if(inventoryVoice?.token!==d.token)return true;
  if(d.text)inventoryVoice.input.value=inventoryVoice.prefix+d.text;
  if(d.final){inventoryVoice.button.textContent='开始口述';inventoryVoice=null}
  if(d.error)toast(d.error);return true;
 }
 if(!['reagentFiles','reagentRecognized'].includes(type))return false;
 const s=locate(d);
 if(type==='reagentRecognized')recognizingReagents.delete(d.id);
 if(!s)return true;
 if(type==='reagentFiles'){
  const c={project:d.project,system:d.system},many=d.items.length>1;
  const items=d.items.map(r=>({...r,text:'',batch:many,group:d.id}));
  (s.reagentImports||=[]).push(...items);
  if(view==='tasks'&&area==='lab'&&scopedKey(scope())===scopedKey(c)&&dialog.open&&dialog.querySelector('[data-audio]'))dialog.close();
  for(const item of items)if(item.file)recognizeReagents(c,s,item);
  save();
 }else{
  const item=s.reagentImports?.find(x=>x.id===d.id);if(!item||item.archived||item.paused)return true;
  item.text=d.text||item.text;item.error=d.error||'';
  if(!item.error)scheduleReagent(d,s,item);save();
 }
 return true;
}
function reagentClick(a,id,s){
 switch(a){
 case 'reagentImage':if(native)send('importReagent',{...scope(),kind:'image',id:uid()});else toast('请在 Mac App 中导入图片。');break;
 case 'reagentText':case 'reagentVoice':reagentTextForm(s,a==='reagentVoice');break;
 case 'reagentEdit':reagentEdit(s,id);break;
 case 'deleteReagent':deletePrompt('reagentEdit',id);break;
 case 'reviewReagents':reviewReagents(s,s.reagentImports?.find(x=>x.id===id));break;
 case 'stopReagent':{const item=s.reagentImports?.find(x=>x.id===id);if(item){stopReagent(s,item);save()}break}
 case 'removeReagentImport':confirmRemoveImports(s,(s.reagentImports||[]).filter(x=>x.id===id));break;
 case 'removeReagentGroup':confirmRemoveImports(s,(s.reagentImports||[]).filter(x=>x.group===id&&!x.archived));break;
 case 'retryReagents':{const item=s.reagentImports?.find(x=>x.id===id);if(item)recognizeReagents(scope(),s,item);break}
 default:return false;
 }
 return true;
}
