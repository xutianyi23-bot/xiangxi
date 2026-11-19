// Observe only CNKI's error notice. Authentication forms, cookies and URLs stay in WebKit.
(()=>{
 if(!/(^|\.)cnki\.(net|com\.cn)$/i.test(location.hostname))return;
 let scheduled=false;
 const inspect=()=>{
  scheduled=false;
  const text=document.body?.innerText||'';
  if(!/来源应用不正确\s*[（(]\s*0?1\s*[）)]/.test(text))return;
  observer.disconnect();
  window.webkit.messageHandlers.cnkiLoginStatus.postMessage('sourceRejected');
 };
 const observer=new MutationObserver(()=>{
  if(!scheduled){scheduled=true;setTimeout(inspect,250)}
 });
 observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true});
 inspect();
})();
