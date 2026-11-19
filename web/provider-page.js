// Executed in an isolated WebKit content world. Only interact with the provider's visible links.
(vendor, action, mode, tryIP=true, article=null) => {
 const cnki=vendor==='cnki';
 const allowed=host=>cnki ? /(^|\.)cnki\.(net|com\.cn)$/i.test(host) : /(^|\.)sciencedirect\.com$/i.test(host);
 if(!allowed(location.hostname))return {state:location.hostname.endsWith('.sciencedirectassets.com')?'waiting':'login'};
 const clean=s=>(s||'').replace(/\s+/g,' ').trim();
 const visible=e=>e.getClientRects().length && getComputedStyle(e).visibility!=='hidden';
 const text=e=>clean(e.innerText||e.getAttribute('aria-label')||e.title);
 if(cnki&&(/^(fsso|login|passport)\./i.test(location.hostname)||/\/(?:Shibboleth\.sso|saml)\//i.test(location.pathname)))return {state:'login'};
 const links=Array.from(document.querySelectorAll('a[href]')).filter(visible);
 const body=clean(document.body?.innerText);
 if(/访问过于频繁|操作过于频繁|too many requests|temporarily blocked/i.test(body.slice(0,2200)))return {state:'limited'};
 if(/人机验证|完成安全验证|请输入验证码|verify you are human|checking your browser|verify you are a human/i.test(body.slice(0,1600)))return {state:'verify'};
 function clickIP(){
  if(!cnki||mode!=='ip'||!tryIP)return false;
  const ip=Array.from(document.querySelectorAll('a,button,input[type=button],[role=button]')).filter(visible).find(a=>
   /^(?:机构)?IP(?:自动)?(?:登录|登陆|login)$/i.test(clean(text(a)||a.value).replace(/\s/g,'')));
  if(ip&&!ip.dataset.workstationRequested){ip.dataset.workstationRequested='1';ip.click();return true}
 }
 if(action==='ipLogin')return {state:clickIP()?'ipClicked':'waiting'};
 if(cnki&&['www.cnki.net','cnki.net'].includes(location.hostname)&&/^\/(?:index(?:\.html?)?)?$/i.test(location.pathname))return {state:'home'};
 if(cnki&&action==='selectArticle'&&article){
  const entries=links.filter(a=>{
   const url=new URL(a.href);
   return url.protocol==='https:'&&allowed(url.hostname)&&
    (a.matches('a.fz14,td.name a,.name a')||/\/kcms2?\/article\/abstract|\/KCMS\/detail\//i.test(url.pathname));
  });
  const sameTitle=entries.filter(a=>text(a)===clean(article.title));
  const link=entries.find(a=>a.href===article.url)||(sameTitle.length===1?sameTitle[0]:null);
  if(link&&!link.dataset.workstationRequested){link.dataset.workstationRequested='1';link.click();return {state:'clicked'}}
  return {state:'waiting'};
 }
 if(action==='sessionCatalog'){
  const rows=[],seen=new Set();
  for(const a of links){
   let url;try{url=new URL(a.href)}catch{continue}
   if(url.protocol!=='https:'||!allowed(url.hostname))continue;
   const match=cnki?(a.matches('a.fz14,td.name a,.name a')||/\/kcms2?\/article\/abstract|\/KCMS\/detail\//i.test(url.pathname)):/^\/science\/article\/(?:abs\/)?pii\/[A-Za-z0-9]+\/?$/.test(url.pathname);
   const title=text(a);
   if(!match||title.length<5||/^(view|download|show|abstract|下载|摘要|PDF$)/i.test(title)||seen.has(url.href))continue;
   const row={title,articleURL:url.href,source:cnki?'中国知网':'ScienceDirect',note:''};
   if(cnki){
    const tr=a.closest?.('tr');
    if(tr){
     row.journal=clean(tr.querySelector('td.source a,td.source')?.textContent);
     row.authors=clean(tr.querySelector('td.author')?.textContent);
     row.year=clean(tr.querySelector('td.date,td.year')?.textContent).match(/\b(?:19|20)\d{2}\b/)?.[0]||'';
    }
   }
   if(!cnki){
    const pii=url.pathname.split('/').filter(Boolean).pop();
    const entry=a.closest('li,article');
    const pdf=Array.from(entry?.querySelectorAll('a[href]')||[]).find(link=>{
     const u=new URL(link.href,location.href);
     return u.protocol==='https:'&&allowed(u.hostname)&&u.pathname==='/science/article/pii/'+pii+'/pdfft';
    });
    if(pdf)row.sessionPDF=pdf.href;
   }
   seen.add(url.href);rows.push(row);
  }
  if(rows.length)return {state:'rows',rows:rows.slice(0,60)};
  if(/未检索到|未找到相关|暂无数据|no results (found|for)|no articles found/i.test(body))return {state:'empty'};
 }else{
  // Prefer the publisher's explicitly labelled PDF control in the main article.
  const controls=Array.from(document.querySelectorAll('a,button')).filter(visible);
  const pdf=controls.find(a=>cnki?/^(PDF\s*(全文)?下载|下载\s*PDF)(\s|$)/i.test(text(a)): /^(view\s+pdf|download\s+pdf|view open manuscript)(\s|$)/i.test(text(a)) && !/supplement/i.test(text(a)));
  if(pdf){
   const href=pdf.getAttribute('href');
   if(!cnki && href && !/^(javascript:|#)/i.test(href)){
    const u=new URL(href,location.href);
    if(u.protocol==='https:'&&allowed(u.hostname)&&u.href!==location.href)return {state:'pdf',url:u.href};
   }
   if(!pdf.dataset.workstationRequested){pdf.dataset.workstationRequested='1';pdf.click();return {state:'clicked'}}
  }
  if(/purchase pdf|purchase this article|购买本文|购买该篇/i.test(body)&&!pdf)return {state:clickIP()?'ipClicked':'unavailable'};
 }
 return {state:clickIP()?'ipClicked':'waiting'};
}
