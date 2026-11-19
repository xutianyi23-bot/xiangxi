// Executed in an isolated WebKit world after the provider origin is checked.
(()=>{
 const labels=[...document.querySelectorAll('a,button,[role=button]')].filter(e=>e.getClientRects().length).map(e=>(e.innerText||e.getAttribute('aria-label')||'').trim().replace(/\s+/g,' '));
 const body=document.body?.innerText||'';
 const institution=/access (?:provided|brought to you) by[：:\s]+(?!your institution\b|your organization\b)\S|机构用户[：:]\s*\S|欢迎[，, ]+机构用户/i.test(body);
 const account=labels.some(v=>/^(sign out|log out|logout|退出登录|注销登录|安全退出)$/i.test(v));
 if(accessMode==='account'){
  if(account)return 'in';
  return labels.some(v=>/^(sign in|log in|login|登录|个人登录)$/i.test(v))?'out':'unknown';
 }
 if(institution)return 'in';
 if(/未登录机构账户|未识别到机构|no institutional access detected|not signed in through an institution/i.test(body))return 'out';
 return 'unknown';
})()
