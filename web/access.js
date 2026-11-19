'use strict';

const paperPresets=[
 {id:'elsevier',name:'Elsevier · ScienceDirect',home:'https://www.sciencedirect.com/',search:'https://www.sciencedirect.com/search?qs={query}',prefix:'10.1016'},
 {id:'cnki',name:'中国知网',home:'https://www.cnki.net/',search:'https://kns.cnki.net/kns8s/defaultresult/index?kw={query}',prefix:''},
 {id:'springer',name:'Springer Nature · SpringerLink',home:'https://link.springer.com/',search:'https://link.springer.com/search?query={query}',prefix:'10.1007'},
 {id:'wiley',name:'Wiley Online Library',home:'https://onlinelibrary.wiley.com/',search:'https://onlinelibrary.wiley.com/action/doSearch?AllField={query}',prefix:'10.1002,10.1111'},
 {id:'acs',name:'ACS Publications',home:'https://pubs.acs.org/',search:'https://pubs.acs.org/action/doSearch?AllField={query}',prefix:'10.1021'}
];
const localNetworkHint='如果本机已开启系统代理，选择「本机网络」即可沿用，无需二次代理。';
const accessModes={ip:'机构 IP 登录',sso:'学校统一身份认证',account:'网站账号登录'};
const accessOS=globalThis.window?.chrome?.webview?'Windows':'macOS';
let vpnInventory=[],inventoryMessage='正在读取 '+accessOS+' VPN 服务…',paperJob=null;
function publishers(){return db.publishers??=(paperPresets.map(p=>({...p,mode:'ip',network:'',login:p.home,journals:''})))}
function networks(){return db.networks??=[]}
function webURL(raw,token){
 if(!raw)return '';
 const test=token?raw.replace(token,'example'):raw;
 let u;try{u=new URL(test)}catch{throw Error('请填写完整的 HTTPS 网址。')}
 if(u.protocol!=='https:'||!u.hostname||u.username||u.password||/[{}]/.test(test))throw Error('请检查 HTTPS 网址和占位符。');
 return raw;
}
const splitRules=text=>(text||'').split(/[,，;\n；]+/).map(x=>x.trim().toLowerCase()).filter(Boolean);
function matchPublisher(pubs,r,preferred){
 if(preferred){const p=pubs.find(p=>p.id===preferred);if(p)return p}
 const journal=r.journal?.trim().toLowerCase(),prefix=r.doi?.trim().toLowerCase().split('/')[0];
 return pubs.find(p=>journal&&splitRules(p.journals).includes(journal))||pubs.find(p=>prefix&&splitRules(p.prefix).includes(prefix));
}
function loginURL(p){
 if(p?.id==='cnki'&&p.mode==='sso'&&(!p.login||/^https:\/\/fsso\.cnki\.net\/?$/i.test(p.login)))return p.home;
 return p?.login||p?.home;
}
function useCampus(p){return p?.id==='cnki'&&p.mode==='ip'&&(!p.network||p.network==='campus')}
function networkName(p){if(useCampus(p))return '校园直连（跳过 FlClash 代理）';if(p.network==='local'||p.network==='campus')return '本机网络';return networks().find(n=>n.id===p.network)?.name||(p.network?'网络配置已移除':'本机网络')}
function publisherSessionLabel(p){
 if(paperJob?.action==='verify'&&paperJob.vendor===p.id)return '核验中…';
 if(!p.sessionTime||Date.now()-p.sessionTime>30*60000||!['in','out'].includes(p.sessionStatus))return '登录状态待核验';
 return p.sessionStatus==='in'?'已登录':'未登录';
}
function windowsVpnList(){
 if(accessOS!=='Windows'||!vpnInventory.length)return '';
 const status={Connected:'已连接',Disconnected:'未连接',Connecting:'正在连接',Disconnecting:'正在断开'};
 return vpnInventory.map(v=>'<article class="deskItem"><h3>'+esc(v.name)+'</h3><p class="small">'+esc(status[v.status]||v.status)+'</p>'+(v.status==='Connected'?'':btn('连接系统 VPN','windowsVPNConnect','btn',v.id))+'</article>').join('');
}
function accessPage(which){
 if(which==='vpn')return `<section class="box"><div class="sect"><h2>我的网络</h2>${accessOS==='Windows'?btn('打开 Windows VPN 设置','windowsVPNSettings'):''}${btn('刷新系统 VPN','vpnRefresh')}</div><p class="small">${localNetworkHint}</p><div class="actions">${btn('接入 Clash 客户端','clashSetup')}</div><p class="small">可使用本机 FlClash 或其他 Clash 客户端 的代理端口访问论文。端口可在客户端设置中查看。</p><details><summary>其他网络连接方式</summary><p class="small">系统 VPN 使用本机已配置的服务，连接可能影响整台电脑。学校 WebVPN 通过机构门户访问。客户端提供的 HTTP 或 SOCKS5 端口可仅用于此处的论文访问。</p></details>${noteBlock(inventoryMessage)}${windowsVpnList()}${networks().map(n=>`<article class="deskItem"><h3>${esc(n.name)}</h3><p class="small">${esc(n.type==='portal'?n.gateway:n.type==='proxy'?n.proxyKind+' · '+n.host+':'+n.port:vpnInventory.find(v=>v.id===n.service)?.name||n.service)}</p>${btn('编辑','vpnEdit','btn',n.id)} ${btn('移除','vpnRemove','link',n.id)}</article>`).join('')||'<p class="empty">需要为某个提供商指定其他网络时，可在这里添加。</p>'}</section>`;
 return publishers().map(p=>`<section class="box"><div class="sect"><h2>${esc(p.name)}</h2>${btn('编辑','pubEdit','btn',p.id)}</div><p><span class="sessionBadge" data-state="${publisherSessionLabel(p)==='已登录'?'in':publisherSessionLabel(p)==='未登录'?'out':'unknown'}">${publisherSessionLabel(p)}</span> · ${esc(accessModes[p.mode])} · ${esc(networkName(p))}</p><p class="small">${p.sessionTime?'上次核验　'+esc(new Date(p.sessionTime).toLocaleString(interfaceLocale()))+'<br>':''}登录入口　${esc(loginURL(p))}</p>${p.journals?noteBlock('期刊　'+p.journals):''}<div class="actions">${paperJob?.action==='verify'&&paperJob.vendor===p.id?'<button class="btn" disabled>核验中…</button>':btn('核验登录状态','pubVerify','btn',p.id)}${btn('打开登录窗口','pubLogin','btn',p.id)}${p.id==='cnki'&&p.mode!=='sso'?btn('切换到学校机构登录','pubSSO','btn',p.id):''}${p.id==='elsevier'?btn('设置全文 API 密钥','pubKey','link',p.id):''}${btn('移除','pubRemove','link',p.id)}</div></section>`).join('')||'<section class="box empty">添加一个论文提供商以保存登录路径。</section>';
}
function vpnForm(id){
 const n=networks().find(x=>x.id===id),choices=vpnInventory.slice();if(n?.service&&!choices.some(x=>x.id===n.service))choices.push({id:n.service,name:'之前的服务 · '+n.service});
 form(n?'编辑网络':'添加网络',field('name','网络名称',n?.name,'text',true)+`<label>类型<select name="type">${option('system',accessOS+' 系统 VPN',!n||n.type==='system')}${option('portal','学校 WebVPN / 图书馆代理',n?.type==='portal')}${option('proxy',accessOS==='Windows'?'客户端代理端口':'客户端代理端口（macOS 14+）',n?.type==='proxy')}</select></label><label>系统服务<select name="service">${option('','选择已配置的 VPN',!n?.service)}${choices.map(v=>option(v.id,v.name,v.id===n?.service)).join('')}</select></label>`+`<label>代理类型<select name="proxyKind">${option('http','HTTP CONNECT',n?.proxyKind!=='socks5')}${option('socks5','SOCKS5',n?.proxyKind==='socks5')}</select></label>`+field('host','代理主机',n?.host||'127.0.0.1')+field('port','代理端口',n?.port||'')+field('gateway','学校门户地址或代理模板（目标网址用 {url}）',n?.gateway),d=>{
  named(d.name,networks(),id);
  if(d.type==='system'&&!choices.some(v=>v.id===d.service))throw Error('请先在 '+accessOS+' 中配置 VPN，然后刷新系统服务。');
  if(d.type==='portal'&&!webURL(d.gateway,'{url}'))throw Error('请填写学校提供的入口。');
  if(d.type==='proxy'&&(!/^[a-zA-Z0-9.:-]+$/.test(d.host)||!/^\d{1,5}$/.test(d.port)||Number(d.port)<1||Number(d.port)>65535))throw Error('请填写有效的代理主机和端口。');
  const entry={proxyKind:d.type==='proxy'?d.proxyKind:'',host:d.type==='proxy'?d.host:'',port:d.type==='proxy'?d.port:'',id:n?.id||uid(),name:d.name,type:d.type,service:d.type==='system'?d.service:'',gateway:d.type==='portal'?d.gateway:''};if(n)Object.assign(n,entry);else networks().push(entry);
 },f=>{const sync=()=>{for(const [k,t] of Object.entries({gateway:'portal',service:'system',host:'proxy',port:'proxy',proxyKind:'proxy'}))f.elements[k].closest('label').hidden=f.elements.type.value!==t};f.elements.type.onchange=sync;sync()});
}
function pubForm(id){
 const old=publishers().find(x=>x.id===id),p=old||{mode:'ip'};
 form(old?'编辑论文提供商':'添加论文提供商',field('name','名称',p.name,'text',true)+field('home','提供商首页',p.home,'url',true)+field('login','机构或个人登录入口（可用 {url} 返回论文）',p.login)+field('search','检索地址（关键词用 {query}）',p.search,'text',true)+`<label>登录方式<select name="mode">${Object.entries(accessModes).map(([k,v])=>option(k,v,k===p.mode)).join('')}</select></label><label>访问网络<select name="network" aria-describedby="providerNetworkHint">${p.id==='cnki'?option('campus','校园直连（跳过 FlClash 代理）',useCampus(p)):''}${option(p.id==='cnki'?'local':'','本机网络',!useCampus(p)&&(!p.network||p.network==='local'))}${networks().map(n=>option(n.id,n.name,n.id===p.network)).join('')}</select></label><p class="small" id="providerNetworkHint">${localNetworkHint}</p>`+field('prefix','DOI 前缀（多个用逗号分隔）',p.prefix)+longField('journals','匹配期刊全称（每行一个）',p.journals),d=>{
  named(d.name,publishers(),id);webURL(d.home);webURL(d.login,'{url}');webURL(d.search,'{query}');if(!d.search.includes('{query}'))throw Error('检索地址需要包含 {query}。');
  if(splitRules(d.prefix).some(x=>!/^10\.\d{4,9}$/.test(x)))throw Error('DOI 前缀格式如 10.1016。');
  const conflict=publishers().find(other=>other.id!==id&&splitRules(d.journals).some(j=>splitRules(other.journals).includes(j)));if(conflict)throw Error('已有期刊绑定到 '+conflict.name+'。');
  if(old){
   if(['home','mode','network','login'].some(key=>d[key]!==old[key])){delete old.sessionStatus;delete old.sessionTime}
   Object.assign(old,d);
  }else publishers().push({...d,id:uid()});
 },f=>{
  if(p.id!=='cnki')return;
  const {mode,network}=f.elements,campus=network.querySelector('option[value="campus"]');
  const sync=()=>{
   campus.disabled=mode.value!=='ip';
   if(campus.disabled&&network.value==='campus')network.value='local';
  };
  mode.onchange=sync;
  if(p.network==='campus'&&p.mode!=='ip')network.value='local';
  sync();
 });
}
function libraryAccessPanel(s){
 return `<label>论文提供商<select id="litProvider">${option('','自动匹配期刊或 DOI',!s.paperPreference)}${publishers().map(p=>option(p.id,p.name,s.paperPreference===p.id)).join('')}</select></label><div class="actions">${btn(s.searchJournal?'目标期刊 · '+s.searchJournal:'设置检索期刊','litJournal','link')}</div>${paperJob?noteBlock(paperJob.status):''}`;
}
function networkArgs(p){
 const route=useCampus(p)?'campus':p?.network==='campus'?'local':p?.network;const namedRoute=route&&!['local','campus'].includes(route);
 const net=namedRoute?networks().find(n=>n.id===route):null;
 if(namedRoute&&!net)throw Error('请先在提供商设置中重新选择网络。');
 return {proxyKind:route==='campus'?'campus':net?.proxyKind||'',host:net?.host||'',port:net?.port||'',service:net?.service||'',gateway:net?.gateway||''};
}
function paperLaunch(c,p,target,action,r,catalogURL){
 if(!native)throw Error('请在 Mac App 中打开论文访问窗口。');
 if(paperJob)throw Error('已有论文访问任务。请先完成或关闭其窗口。');
 const route=networkArgs(p);if(typeof activeDownload!=='undefined'&&activeDownload&&!['batch','sessionCatalog','sessionPDF'].includes(action))throw Error('请先完成当前批量任务。');
 const token=uid();paperJob={token,c,r,action,vendor:p?.id||'',accessKey:p&&JSON.stringify([p.home,p.login,p.mode,p.network]),status:'正在准备 '+(p?.name||'全文')+' 的访问网络…'};
 send('paperAccess',{token,action,target,catalogURL:catalogURL||'',profile:p?.id||'open',...route,login:loginURL(p)||target,mode:p?.mode||'ip',vendor:p?.id||'',name:p?.name||'论文全文',title:r?.title||'',doi:r?.doi||'',canSave:!!c,pmc:r?.pmc||'',pdf:r?.pdfURL||'',preferPublisher:!!(c&&locate(c)?.paperPreference),context:c?.system||''});render();
}
function publisherSearch(c,query){
 const s=locate(c);if(!s)return false;
 const p=matchPublisher(publishers(),{journal:s.searchJournal},s.paperPreference);
 if(!p)return false;
 const terms=[query,s.searchJournal].filter(Boolean).join(' ');paperLaunch(c,p,p.search.replace('{query}',encodeURIComponent(terms)),'search',null);
 searches.set(scopedKey(c),{query,status:'正在 '+p.name+' 的访问窗口中检索。'});render();return true;
}
function getPaper(r){
 if(!r)return;const s=system(filter),existing=references(s).find(x=>x.id===r.id||samePaper(x,r));
 if(existing?.file?.toLowerCase().endsWith('.pdf')){send('openReference',{file:existing.file});return}
 const data={...r,...existing};let doi=data.doi||(data.source||'').trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'');
 data.doi=/^10\.\d{4,9}\/\S+$/i.test(doi)?doi:'';
 const p=matchPublisher(publishers(),data,s.paperPreference);
 const url=data.articleURL||(/^https:\/\//i.test(data.source||'')?data.source:'');
 let target=url||((data.doi&&p?.id!=='cnki')?'https://doi.org/'+data.doi.split('/').map(encodeURIComponent).join('/'):'');
 if(!target&&p)target=p.search.replace('{query}',encodeURIComponent(data.title));
 if(!target&&data.pmc)target='https://europepmc.org/articles/'+encodeURIComponent(data.pmc);
 if(!target)throw Error('请在文献笔记中填写 DOI 或文章网址，或选择论文提供商。');
 paperLaunch(scope(),p,target,'paper',data);
}
function accessClick(a,id){
 switch(a){
 case 'batchStart':beginBatch();break;
 case 'batchStop':if(activeDownload){activeDownload.stop=true;if(paperJob?.onBatch)send('paperCancel',{token:paperJob.token});saveBatch(activeDownload,'正在结束当前请求…')}break;
 case 'windowsVPNConnect':void askBatch('windowsVPNConnect',{service:id}).then(()=>send('vpnServices')).catch(e=>toast(e.message));break;
 case 'windowsVPNSettings':send('windowsVPNSettings');break;
 case 'vpnRefresh':send('vpnServices');break;
 case 'vpnEdit':vpnForm(id);break;
 case 'pubEdit':pubForm(id);break;
 case 'pubKey':send('paperAPIKey');break;
 case 'pubSSO':{
  const p=publishers().find(x=>x.id==='cnki');
  const next={...p,mode:'sso'};
  paperLaunch(null,next,next.home,'login',null);
  p.mode='sso';save();break;
 }
 case 'clashSetup':void clashSetup().catch(e=>toast(e.message));break;
 case 'pubVerify':{const p=publishers().find(x=>x.id===id);if(p)paperLaunch(null,p,p.home,'verify',null);break}
 case 'pubLogin':{const p=publishers().find(p=>p.id===id);paperLaunch(null,p,p.home,'login',null);break}
 case 'vpnRemove':case 'pubRemove':{
  const isVPN=a==='vpnRemove',arr=isVPN?networks():publishers(),item=arr.find(x=>x.id===id);if(!item)break;
  if(isVPN&&publishers().some(p=>p.network===id))throw Error('请先更改使用此网络的提供商。');
  form('移除 '+item.name,'',()=>{arr.splice(arr.indexOf(item),1);if(!isVPN)for(const p of db.projects)for(const s of p.systems)if(s.paperPreference===id)s.paperPreference=''});break;
 }
 case 'litJournal':{const s=system(filter);form('检索期刊',field('name','期刊全称（留空则检索全部期刊）',s.searchJournal),d=>{s.searchJournal=d.name});break}
 case 'resultDOI':case 'refDOI':{
  const r=a==='refDOI'?references(system(filter)).find(x=>x.id===id):searches.get(scopedKey(scope()))?.rows?.[Number(id)];
  if(r?.doi){const p=matchPublisher(publishers(),r,system(filter).paperPreference);paperLaunch(scope(),p,'https://doi.org/'+r.doi.split('/').map(encodeURIComponent).join('/'),'read',r)}break;
 }
 case 'paperResult':getPaper(searches.get(scopedKey(scope()))?.rows?.[Number(id)]);break;
 case 'openPreviousRef':{const r=references(system(filter)).find(x=>x.id===id);if(r?.previousFile)send('openReference',{file:r.previousFile});break}
 case 'paperRef':getPaper(references(system(filter)).find(x=>x.id===id));break;
 default:return false;
 }return true;
}
function accessEvent(type,d){
 if(type==='batchRPC'){batchResponse(d);return true}
 if(type==='vpnServices'){vpnInventory=d.items;inventoryMessage=d.error||(vpnInventory.length?'已识别 '+vpnInventory.length+' 个系统 VPN 服务。':'未发现系统 VPN。可先配置系统服务，或添加学校 WebVPN 门户。');if(view==='vpn')render();return true}
 if(type==='paperSchoolLogin'){
  if(paperJob?.token!==d.token||paperJob.vendor!=='cnki')return true;
  const p=publishers().find(p=>p.id==='cnki');
  if(!p)return true;
  p.mode='sso';
  const running=activeDownload?.platforms.find(platform=>platform.id==='cnki');
  if(running)running.mode='sso';
  save();return true;
 }
 if(type!=='paperStatus'&&type!=='paperFinished')return false;
 const job=paperJob;if(!job||job.token!==d.token)return true;
 if(type==='paperStatus'){job.status=d.message;render();return true}
 paperJob=null;
 if(job.action==='verify'){
  const p=publishers().find(x=>x.id===job.vendor);
  if(p&&job.accessKey===JSON.stringify([p.home,p.login,p.mode,p.network])){p.sessionStatus=['in','out'].includes(d.state)?d.state:'unknown';p.sessionTime=Date.now();save()}
  else render();
  if(d.message)toast(d.message);return true;
 }
 if(d.file&&job.c){
  const s=locate(job.c);if(s){const raw=job.r||{title:d.title||'论文全文',source:d.host||'',articleURL:d.articleURL||''};
   const refs=s.references||=[],r=refs.find(x=>(raw.id&&x.id===raw.id)||samePaper(x,raw))||{...raw,id:raw.id||uid()};
   if(!refs.includes(r))refs.push(r);
   for(const key of ['authors','journal','year','volume','issue','pages','doi','articleURL'])r[key]||=raw[key]||d[key]||'';
   if(r.file&&!r.file.endsWith('.pdf'))r.previousFile=r.file;
   if(r.file&&r.file!==d.file&&r.readingReport&&!r.readingReport.sourceFile)r.readingReport.sourceFile=r.file;
   r.file=d.file;r.kind='论文全文 PDF';r.note=[r.note,d.note].filter(Boolean).join('\n\n');if(job.onBatch){r.downloadSource=d.downloadSource||'';job.onBatch({...d,referenceId:r.id});return true}save();toast('PDF 已保存至「'+s.name+'」的文献区。');return true;
  }
 }
 if(job.onBatch){job.onBatch(d);return true}render();if(d.message)toast(d.message);return true;
}

async function clashSetup(){
 if(!native)throw Error('请在 Mac App 中配置本机代理。');
 const detected=await askBatch('clashDefaults',{}),existing=networks().find(n=>n.clash===true);
 const body='<p class="small">在客户端开启代理，再填写其 HTTP 或 SOCKS5 端口。保存后，在论文提供商的「访问网络」选择这条连接。</p>'+field('name','网络名称',existing?.name||'Clash 本机代理','text',true)+
 '<label>代理类型<select name="kind">'+option('http','HTTP CONNECT',(existing?.proxyKind||detected.kind)!=='socks5')+option('socks5','SOCKS5',(existing?.proxyKind||detected.kind)==='socks5')+'</select></label>'+
 field('port','本机代理端口',existing?.port||detected.port||'','number',true)+'<div class="actions">'+(detected.client?'<button type="button" class="btn" id="openClient">打开 '+esc(detected.client)+'</button>':'')+'<button type="button" class="btn" id="testPort">测试本机端口</button><small role="status" id="portStatus"></small></div>';
 form('接入 Clash 客户端',body,d=>{
  named(d.name,networks(),existing?.id);if(!/^\d{1,5}$/.test(d.port)||+d.port<1||+d.port>65535)throw Error('请填写有效的代理端口。');
  const item={id:existing?.id||uid(),clash:true,name:d.name,type:'proxy',proxyKind:d.kind,host:'127.0.0.1',port:d.port};
  if(existing)Object.assign(existing,item);else networks().push(item);
 },f=>{
  const open=f.querySelector('#openClient');if(open)open.onclick=()=>send('openClash');
  const btn=f.querySelector('#testPort'),status=f.querySelector('#portStatus');
  let serial=0;f.elements.port.oninput=()=>{serial++;btn.disabled=false;status.textContent=''};
  btn.onclick=async()=>{const run=++serial;btn.disabled=true;status.textContent='正在测试…';
   try{const result=await askBatch('checkClashPort',{port:f.elements.port.value});if(run===serial)status.textContent=result}
   catch(e){if(run===serial)status.textContent=e.message}finally{if(run===serial)btn.disabled=false}
  };
 });
}
