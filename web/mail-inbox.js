// Copyright © 2026 徐天翼（笔名：鸡腿堡）
// SPDX-License-Identifier: GPL-3.0-only
'use strict';
let mailRunning=false,mailStatus='',mailActive='';
function mailRecords(){return db.mailRecords??=[]}
function mailConnectionGuide(){
 return '<details class="mailGuide"><summary>如何接入邮箱</summary><ol><li>登录邮箱网页版，在「设置」中找「邮件客户端」「IMAP/SMTP」或「账户安全」。启用 IMAP 收信，在服务商的客户端设置页查找收件服务器和 SSL/TLS 端口。</li><li>打开「邮箱与定时设置」。「IMAP 服务器」填收件服务器主机名，「TLS 端口」填服务商公布的加密收件端口，「邮箱账号」通常填完整地址。国科大邮箱示例为 <code>mail.cstnet.cn</code>、<code>993</code>、<code>你的用户名@mails.ucas.ac.cn</code>。账号按本人邮箱实际后缀填写。</li><li>在网页邮箱生成客户端专用密码或授权码。国科大邮箱在网页版依次打开「设置 → 个人信息 → 邮箱密码」，在「客户端专用密码」下点「＋」。回到工作站保存设置，点「保存邮箱授权码」，将它存入 Mac 钥匙串。仅支持 OAuth 网页授权的邮箱可用「粘贴邮件」导入。</li><li>点「立即读取」验证接入。需要定时收信时填写一个或多个本地时间，如 09:00, 16:30，并保持 App 运行。需要自动分析时再选模型并勾选自动分析。</li><li>打开审稿邮件，点「AI 提取要求与建议」后核对，再点「归入目标稿件」。在对应体系的「论文工作区 → 论文修改」查看原文，选择段落、预览改稿并逐条确认。</li></ol></details>';
}
function mailPage(){
 const c=db.mailConfig,rows=mailRecords(),m=rows.find(x=>x.id===mailActive)||rows.at(-1);
 return '<section class="box"><div class="sect"><h2>收件箱</h2>'+btn('邮箱与定时设置','mailSettings')+'</div>'+mailConnectionGuide()+noteBlock(c?c.user+' · '+(c.times.join('、')||'手动读取'):'接入支持 IMAP 的邮箱，或粘贴一封邮件试用。')+'<div class="actions">'+(c?btn('保存邮箱授权码','mailKey')+btn('立即读取','mailRead','primary'):'')+btn('粘贴邮件','mailPaste')+'</div>'+noteBlock(mailStatus||c?.status||'')+'</section>'+
 '<section class="box"><h2>邮件记录</h2><div class="actions">'+rows.slice().reverse().map(x=>btn(x.subject||'无主题','mailSelect',x===m?'btn selectedPlan':'btn',x.id)).join('')+'</div></section>'+
 (m?'<section class="box"><h2>'+esc(m.subject)+'</h2><p class="small">'+esc([m.sender,m.date].filter(Boolean).join(' · '))+'</p><details><summary>邮件原文</summary>'+noteBlock(m.body||m.issue)+'</details>'+modelSelectors('mail')+'<div class="actions">'+btn('AI 提取要求与建议','mailAnalyze','btn',m.id)+btn('归入目标稿件','mailAssign','btn',m.id)+'</div>'+noteBlock(m.summary||'')+(m.items||[]).map(x=>'<article class="deskItem"><b>'+esc(x.title)+'</b>'+noteBlock(x.quote)+noteBlock(x.text)+(x.applied?'已确认':btn('核对并应用','mailApply','btn',x.id))+'</article>').join('')+'</section>':'');
}
function mailSettings(){
 const c=db.mailConfig||{};
 form('邮箱与定时设置',mailConnectionGuide()+field('host','IMAP 服务器',c.host||'','text',true)+field('port','TLS 端口',c.port||'993','number',true)+field('user','邮箱账号',c.user,'text',true)+field('times','每日读取时间（如 09:00, 16:30）',(c.times||[]).join(', '))+
 '<p class="small">首次读取最近七天的收件箱，以后只取新增邮件，包括已读邮件。App 运行期间按本机时间检查，唤醒后补读。邮箱读取使用 Python 3。</p>'+modelSelectors('mail')+'<label class="tick"><input type="checkbox" name="auto" '+(c.auto?'checked':'')+'>自动将疑似科研邮件正文交给所选模型分析</label>',d=>{
  if(!/^[a-z\d.-]+$/i.test(d.host)||!/^\d+$/.test(d.port)||+d.port<1||+d.port>65535)throw Error('服务器或端口无效。');
  const times=[...new Set(d.times.split(/[,，、;；\s]+/).filter(Boolean))].sort();if(times.some(v=>!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)))throw Error('时间请按 09:00 格式填写。');
  if(d.auto)selectedAI('mail');
  const same=c.host===d.host&&c.user===d.user&&c.port===d.port;
  db.mailConfig={...(same?c:{}),host:d.host,port:d.port,user:d.user,times,auto:!!d.auto};
 });
}
async function analyzeMail(m){
 const ai=selectedAI('mail');if(!m.body)throw Error('这封邮件缺少正文。');
 await flowJob(m.id,async()=>{
  const items=[],brief=[];
  for(const chunk of textPieces(m.body,10000)){
   const out=await flowAI('mailReview',ai,{subject:m.subject,date:m.date,body:chunk});
   if(!Array.isArray(out.items))throw Error('模型没有返回可核对的建议。');
   if(out.summary)brief.push(out.summary);
   for(const v of out.items){
    if(!['revision','experiment','test','calendar','progress'].includes(v.kind)||!v.quote||!chunk.includes(v.quote)||!v.title||!v.text)continue;
    if(!items.some(x=>x.quote===v.quote&&x.kind===v.kind))items.push({id:uid(),kind:v.kind,title:String(v.title),quote:v.quote,text:String(v.text),date:validDate(v.date)?v.date:''});
   }
  }
  const applied=(m.items||[]).filter(x=>x.applied);
  m.items=applied.concat(items.filter(v=>!applied.some(x=>x.quote===v.quote&&x.kind===v.kind)));m.summary=brief.join('\n');save();
 });
}
async function fetchMail(slot=''){
 if(mailRunning)return;const c=db.mailConfig;if(!c)throw Error('请先配置邮箱。');
 mailRunning=true;mailStatus='正在读取收件箱…';render();
 try{
  const added=[];
  for(;;){
   const out=await askBatch('mailFetch',{host:c.host,port:c.port,user:c.user,cursor:c.cursor||0,epoch:c.epoch||''});
   if(c!==db.mailConfig)return;
   for(const row of out.items){
    const key=JSON.stringify([c.host,c.port,c.user,out.epoch,row.uid]);
    if(mailRecords().some(m=>m.key===key))continue;
    const m={...row,key,id:uid()};mailRecords().push(m);added.push(m);
   }
   Object.assign(c,{epoch:out.epoch,cursor:out.cursor});save(false);if(!out.more)break;
  }
  if(slot)c.lastSlot=slot;
  mailStatus='本次读取 '+added.length+' 封新邮件。';c.status=localDay()+' · '+mailStatus;save(false);
  if(c.auto)for(const m of added.filter(x=>x.body&&/审稿|修改|投稿|课题|实验|会议|review|revis|manuscript|deadline|experiment|meeting/i.test(x.subject+' '+x.body)))await analyzeMail(m);
 }catch(e){mailStatus=e.message;c.status=mailStatus;throw e}finally{mailRunning=false;save()}
}
let mailRetryAt=0;
function mailTick(){
 if(typeof db==='undefined'||!db?.mailConfig||mailRunning||Date.now()<mailRetryAt)return;
 const now=new Date(),c=db.mailConfig,slot=c.times.filter(x=>x<=now.toTimeString().slice(0,5)).at(-1);
 if(!slot)return;const stamp=localDay(now)+' '+slot;if(c.lastSlot>=stamp)return;
 mailRetryAt=Date.now()+60000;void fetchMail(stamp).catch(()=>{mailRetryAt=Date.now()+300000});
}
function mailDestination(m,item){
 const systems=db.projects.flatMap(p=>p.systems.map(s=>({p,s})));if(!systems.length)throw Error('请先建立课题和体系。');
 const needsPaper=!item||item.kind==='revision';
 const rows=systems.flatMap(({p,s})=>(needsPaper?paperTargets(s):[null]).map(t=>({p,s,t,key:t?.id||s.id})));
 if(!rows.length)throw Error('请先在论文工作区添加目标期刊。');
 const body='<label>归属课题 / 体系'+(needsPaper?' / 稿件':'')+'<select name="dest">'+rows.map(v=>option(v.key,[v.p.name,v.s.name,v.t?.name].filter(Boolean).join(' / '),v.key===(needsPaper?m.target:m.system))).join('')+'</select></label>'+
 (item?.kind==='test'?'<label>安排到实验<select name="batch"></select></label>':'')+(item?noteBlock(item.quote)+field('title','事项名称',item.title,'text',true)+longField('text','确认内容',item.text)+field('date','日历日期（选填）',item.date,'date'):noteBlock('保存整封邮件正文，可以在论文修改中逐条核对。'));
 form(item?'核对并应用':'归入目标稿件',body,d=>{
  if(item?.applied)return;if(item?.kind==='calendar'&&!d.date)throw Error('日历事项需要日期。');const {s,t,p}=rows.find(r=>r.key===d.dest);
  m.system=s.id;if(t)m.target=t.id;
  if(t){
   const reviews=t.reviews??=[];let review=reviews.find(v=>v.mailId===m.id);
   if(!review){review={id:uid(),mailId:m.id,title:m.subject,original:m.body,items:[]};reviews.push(review)}
   const source=item?[item]:(m.items||[]).filter(x=>x.kind==='revision');
   for(const v of source)if(!review.items.some(x=>x.quote===v.quote)){review.items.push({id:uid(),quote:v.quote,text:item?d.text:v.text})}
  }
  if(item){
   if(item.kind==='test'&&d.batch){
    const b=batches(s).find(b=>b.id===d.batch);if(!b)throw Error('所选实验已移除。');
    (b.plannedTests??=[]).push({id:uid(),title:d.title,requirement:d.text,source:m.subject,date:d.date});
   }else if(['experiment','test'].includes(item.kind)){
    const card={id:uid(),unit:'锅',category:item.kind==='test'?'补充检测':'补充实验',title:d.title,question:item.quote,purpose:d.text,materials:'',procedure:'',note:m.subject,results:[],position:nextPosition(s),mailId:m.id};
    (s.experiments??=[]).push(card);
   }
   if(item.kind==='progress')(s.mailUpdates??=[]).push({id:uid(),date:localDay(),title:d.title,text:d.text,source:m.subject});
   if(item.kind==='calendar'||d.date){
    db.tasks.push({id:uid(),project:p.id,system:s.id,title:d.title,detail:d.text,date:d.date||'',time:'',done:false,mailId:m.id});
   }
   item.applied=true;
  }toast('已应用到 '+p.name+' / '+s.name);
 },f=>{
  if(item?.kind!=='test')return;
  const show=()=>{const s=rows.find(v=>v.key===f.elements.dest.value)?.s;f.elements.batch.innerHTML=option('','新建补测实验卡',true)+(s?batches(s).map(b=>option(b.id,b.title,false)).join(''):'')};
  f.elements.dest.onchange=show;show();
 });
}
function mailAction(a,id){
 if(!a.startsWith('mail'))return false;
 const m=mailRecords().find(x=>x.id===id);
 if(a==='mailSettings')mailSettings();
 if(a==='mailKey')askBatch('mailCredential',db.mailConfig).then(ok=>{if(ok)toast('授权码已保存至钥匙串。')}).catch(e=>toast(e.message));
 if(a==='mailRead')void fetchMail().catch(e=>toast(e.message));
 if(a==='mailPaste')form('粘贴邮件',field('subject','邮件主题','','text',true)+longField('body','邮件正文'),d=>{requireText(d.body,'正文');const m={...d,id:uid(),date:localDay()};mailRecords().push(m);mailActive=m.id});
 if(a==='mailSelect'){mailActive=id;render()}
 if(a==='mailAnalyze'&&m)void analyzeMail(m).catch(e=>toast(e.message));
 if(a==='mailAssign'&&m)mailDestination(m);
 if(a==='mailApply'){const mail=mailRecords().find(x=>x.items?.some(v=>v.id===id));if(mail)mailDestination(mail,mail.items.find(v=>v.id===id))}
 return true;
}

function mailProgress(p){
 const updates=p.systems.flatMap(s=>(s.mailUpdates||[]).map(x=>({...x,system:s.name}))).sort((a,b)=>b.date.localeCompare(a.date));
 return updates.length?'<section class="box"><h2>课题进展</h2>'+updates.map(x=>'<article><small>'+esc(x.date+' · '+x.system)+'</small><h3>'+esc(x.title)+'</h3>'+noteBlock(x.text)+'</article>').join('')+'</section>':'';
}
