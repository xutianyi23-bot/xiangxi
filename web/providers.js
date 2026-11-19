'use strict';

const servicePresets={
 openai:{name:'OpenAI',base:'https://api.openai.com/v1',format:'chat'},
 codex:{name:'本机 Codex',base:'codex://local',format:'codexCLI',models:['默认模型']},
 deepseek:{name:'DeepSeek',base:'https://api.deepseek.com',format:'chat'},
 anthropic:{name:'Anthropic',base:'https://api.anthropic.com/v1',format:'anthropic'},
 gemini:{name:'Google Gemini',base:'https://generativelanguage.googleapis.com/v1beta/openai',format:'chat'},
 ollama:{name:'Ollama',base:'http://localhost:11434/v1',format:'chat'},
 custom:{name:'',base:'',format:'chat'}
};
const formats={codexCLI:'Codex CLI · 本机登录',chat:'OpenAI Chat Completions',responses:'OpenAI Responses',anthropic:'Anthropic Messages'};

function normalizeEndpoint(raw){
 let url;
 try{url=new URL(raw)}catch{throw Error('请填写完整的 API 基础地址。')}
 if(url.username||url.password||url.search||url.hash)throw Error('基础地址中不能包含密钥、查询参数或片段。');
 const local=['127.0.0.1','localhost','[::1]'].includes(url.hostname);
 if(url.protocol!=='https:'&&!(local&&url.protocol==='http:'))throw Error('远程服务请使用 HTTPS，本机服务可使用 HTTP。');
 if(/\/(chat\/completions|messages|responses)\/?$/.test(url.pathname))throw Error('请填写基础地址，移除末尾的调用路径。');
 return url.href.replace(/\/+$/,'');
}
function selectedService(use){
 const selected=db.aiChoices[use]||{};
 return db.providers.find(p=>p.id===selected.provider);
}
function modelSelectors(use){
 const p=selectedService(use),selected=db.aiChoices[use]||{};
 if(!db.providers.length)return btn('去模型页接入服务商','nav','btn','models');
 return `<div class="modelPick"><label>服务商<select data-picker="provider" data-use="${use}">${option('','选择服务商',!p)}${db.providers.map(x=>option(x.id,x.name,x===p)).join('')}</select></label><label>模型<select data-picker="model" data-use="${use}" ${p?.models.length?'':'disabled'}>${option('','选择模型',!selected.model)}${(p?.models||[]).map(m=>option(m,m,m===selected.model)).join('')}</select></label></div>`;
}
function refreshChoices(){
 for(const choice of Object.values(db.aiChoices)){
  const provider=db.providers.find(x=>x.id===choice.provider);
  if(!provider)choice.provider='';
  if(!provider?.models.includes(choice.model))choice.model='';
 }
}
function modelsPage(){
 const connect=db.providers.some(p=>p.format==='codexCLI')?'':btn('接入本机 Codex','connectCodex','btn');
 if(!db.providers.length)return `<section class="providerEmpty"><div class="socketIcon">⌘</div><h2>接入第一个服务商</h2><p>选择接口协议，填写服务商地址和模型 ID。接入后即可在研究背景、文献阅读等 AI 功能中选择。</p>${btn('添加服务商','provider','primary')}${connect}</section>`;
 return connect+db.providers.map(p=>`<section class="box providerCard"><div class="sect"><div><h2>${esc(p.name)}</h2><p class="small">${esc(formats[p.format])}</p></div><div class="actions">${btn('获取模型','fetchModels','btn',p.id)+(p.format==='codexCLI'?btn('定位 Codex','locateCodex','btn',p.id):btn('设置密钥','credential','btn',p.id))}${btn('编辑','provider','btn',p.id)}${btn('移除','removeProvider','link',p.id)}</div></div><code>${esc(p.base)}</code>${p.format==='codexCLI'?'<p class="small">在每台电脑上安装 Codex，用自己的账号运行 codex login。模型来自这台电脑的 CLI 目录，实际使用权限由账号决定。</p>':''}<div class="modelIds">${p.models.map(id=>`<span>${esc(id)}</span>`).join('')||'<small>尚未添加模型 ID</small>'}</div>${meterPanel(p)}${testPanel(p)}</section>`).join('');
}
function editProvider(id){
 const old=db.providers.find(p=>p.id===id);
 const p=old||servicePresets.openai;
 const preset=Object.keys(servicePresets).find(k=>servicePresets[k].base===p.base&&servicePresets[k].format===p.format)||'custom';
 const body=`<label>服务商模板<select name="template">${Object.entries(servicePresets).map(([k,v])=>option(k,v.name||'自定义服务商',k===preset)).join('')}</select></label>`+
 field('name','服务商名称',p.name,'text',true)+field('base','API 基础地址（可含端口）',p.base,'url',true)+
 `<label>接口协议<select name="format">${Object.entries(formats).map(([k,v])=>option(k,v,k===p.format)).join('')}</select></label><label>模型 ID（每行一个）<textarea name="list" rows="4" placeholder="填写服务商提供的模型 ID">${esc((p.models||[]).join('\n'))}</textarea></label><p class="small">本机 Codex 使用当前电脑的登录，自动获取模型目录，也可以在此补充模型 ID。API 服务保存后可设置密钥。</p>`;
 form(old?'编辑服务商':'添加服务商',body,d=>{
  named(d.name,db.providers,id);
  const base=d.format==='codexCLI'?'codex://local':normalizeEndpoint(d.base);
  const models=[...new Set(d.list.split(/\r?\n/).map(m=>m.trim()).filter(Boolean))];
  const next={id:old?.id||uid(),name:d.name,base,format:d.format,models};
  if(old?.catalogModels&&d.format==='codexCLI')next.catalogModels=old.catalogModels.filter(m=>models.includes(m));
  if(d.format==='codexCLI'&&!models.includes('默认模型'))models.unshift('默认模型');
  if(old){db.providers[db.providers.indexOf(old)]=next}else db.providers.push(next);
  refreshChoices();
  if(d.format==='codexCLI'&&old?.format!=='codexCLI')queueMicrotask(()=>fetchCatalog(next.id));
  if(old&&old.base!==base)toast('地址已更改，请为新地址设置密钥。');
 },f=>{f.elements.template.onchange=()=>{
  const preset=servicePresets[f.elements.template.value];
  f.elements.name.value=preset.name;
  f.elements.base.value=preset.base;f.elements.format.value=preset.format;f.elements.list.value=(preset.models||[]).join('\n');
 }});
}
function removeProvider(id){
 const p=db.providers.find(x=>x.id===id);if(!p)return;
 form('移除服务商',`<p>移除「${esc(p.name)}」及其模型？使用它的模型选择栏会清空。</p>`,()=>{
  db.providers=db.providers.filter(x=>x.id!==id);refreshChoices();
 },f=>{f.querySelector('.primary').textContent='移除'});
}

const catalogBusy=new Set(),catalogMessages=new Map();
let smoke=null;
const smokeStatus={};
function fetchCatalog(id){
 if(catalogBusy.has(id))return;
 if(!native){toast('请在 Mac App 中获取模型。');return}
 catalogBusy.add(id);catalogMessages.set(id,'正在获取模型…');if(view==='models')render();send('modelList',{provider:id});
}
function receiveCatalog(type,data){
 const id=data.id;
 if(!id){catalogBusy.clear();toast(String(data));return}
 catalogBusy.delete(id);
 if(type==='modelListError'){catalogMessages.set(id,data.message);if(view==='models')render();return}
 const p=db.providers.find(p=>p.id===data.id&&p.base===data.base);
 if(!p)return;
 if(p.format==='codexCLI'){
  const manual=p.models.filter(m=>!p.catalogModels?.includes(m));
  p.catalogModels=data.models.filter(m=>!manual.includes(m));
  p.models=[...new Set(['默认模型',...manual,...data.models])];
 }else p.models=[...new Set([...p.models,...data.models])];
 catalogMessages.set(id,'已获取 '+data.models.length+' 个模型。');
 refreshChoices();save(view==='models');
 if(view!=='models')for(const el of app.querySelectorAll('.modelPick')){
  const use=el.querySelector('select').dataset.use;
  if(selectedService(use)?.id===id)el.outerHTML=modelSelectors(use);
 }
}
function testPanel(p){
 return `<div class="testArea">${p.models.length?`<label>联调模型<select id="test-${esc(p.id)}">${p.models.map(m=>option(m,m,false)).join('')}</select></label>${btn('测试两个助手','testAssistants','btn',p.id)}`:''}<span role="status">${esc([catalogMessages.get(p.id),smokeStatus[p.id]].filter(Boolean).join('　'))}</span></div>`;
}
function startSmoke(id){
 if(smoke){toast('已有测试进行中。');return}
 const model=document.getElementById('test-'+id)?.value;
 if(!model||!native)return;
 const state=upgradeWorkspace(seed());
 smoke={id,model,state};smokeStatus[id]='正在测试超级助手…';render();
 send('testProject',{provider:id,model,context:JSON.stringify({project:projectSnapshot(state,'p1'),conversation:[{role:'user',text:'把体系1的目标改为「验证共享记录」，不修改其他项目。'}]})});
}
function receiveSmoke(type,data){
 if(!smoke)return;
 const {id,model,state}=smoke;
 try{
  if(type==='testError')throw Error(data);
  const reply=readReply(data);
  if(type==='testProjectReply'){
   const next=applyProjectReply(state,'p1',reply);
   if(next.projects[0].systems[0].goal!=='验证共享记录')throw Error('体系目标未按指令写入。');
   smokeStatus[id]='课题编辑通过，正在测试日历…';render();
   send('testCalendar',{provider:id,model,context:JSON.stringify({current:'p1',projects:state.projects,tasks:state.tasks,localDate:localDay(),conversation:[{role:'user',text:'请在2030年6月12日14:30，为当前课题的体系1新建任务「日历联调」。'}]})});return;
  }
  const next=applyPlan(state,reply.items);
  if(!next.tasks.some(t=>t.title==='日历联调'&&t.system==='s1'&&t.date==='2030-06-12'&&t.time==='14:30'))throw Error('日程写入与指令不符。');
  smokeStatus[id]=model+' · 课题编辑、日历排程均通过';
 }catch(e){smokeStatus[id]='测试未通过：'+e.message}
 smoke=null;render();
}

const providerBalances=new Map();
function recordModelUsage({provider,tokens}){
 if(!db||!provider)return;
 const ledger=db.modelUsage||={},days=ledger[provider]||={},date=localDay();
 const entry=days[date]||={tokens:0,unmetered:0};
 if(Number.isSafeInteger(tokens)&&tokens>=0)entry.tokens+=tokens;else entry.unmetered++;
 save(false);if(view==='models')render();
}
function usagePeriods(days,today=localDay()){
 const totals=[0,0,0],unknown=[0,0,0],week=weekStart(today),month=today.slice(0,7);
 for(const [day,row] of Object.entries(days)){
  [true,day>=week&&day<=today,day.startsWith(month)].forEach((yes,i)=>{
   if(yes){totals[i]+=row.tokens;unknown[i]+=row.unmetered}
  });
 }
 return totals.map((n,i)=>n.toLocaleString()+(unknown[i]?'（另有 '+unknown[i]+' 次未返回用量）':''));
}
function meterPanel(p){
 const supported=new URL(p.base).hostname==='api.deepseek.com';
 if(supported&&native&&!providerBalances.has(p.id)&&typeof askBatch==='function'){
  providerBalances.set(p.id,{text:'查询中…'});Promise.resolve().then(()=>refreshBalance(p.id));
 }
 const amounts=usagePeriods(db.modelUsage?.[p.id]||{});
 return `<div class="usageMeter"><div>账户余额　${esc(supported?(providerBalances.get(p.id)?.text||'待查询'):'此接口未提供余额')}${supported?btn('刷新余额','refreshBalance','link',p.id):''}</div><p>本工作站用量（tokens）　总计 ${amounts[0]}　·　本周 ${amounts[1]}　·　本月 ${amounts[2]}</p><small>自本版起按服务商回传用量统计，本周从周一开始。</small></div>`;
}
async function refreshBalance(id){
 const entry=providerBalances.get(id)||{};
 if(entry.busy)return;
 entry.busy=true;entry.text='查询中…';providerBalances.set(id,entry);
 if(view==='models')render();
 try{entry.text=await askBatch('balance',{provider:id})}catch(e){entry.text=e.message}
 finally{entry.busy=false;if(view==='models')render()}
}
