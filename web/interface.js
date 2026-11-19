'use strict';

const interfaceLanguages={'zh-Hans':'简体中文','zh-Hant':'繁體中文',en:'English',de:'Deutsch',es:'Español',ja:'日本語',ko:'한국어',fr:'Français',pt:'Português',it:'Italiano',ru:'Русский'};
function interfaceLocale(){return Object.hasOwn(interfaceLanguages,db?.uiLanguage)?db.uiLanguage:'zh-Hans'}
const extraLanguages=['fr','pt','it','ru'];
async function switchInterface(code){
 if(!extraLanguages.includes(code)){activateInterface(code);return}
 const pack=((db.languagePacks||={})[code]||={});
 const missing=interfaceCatalogue.filter(row=>!pack[row[0]]);
 if(!missing.length){activateInterface(code);return}
 render();form('准备界面语言',noteBlock(interfaceLanguages[code]+' · 首次使用时，由所选模型翻译内置界面文字。完成后可离线切换。')+modelSelectors('interfacePack'),()=>{
  const ai=selectedAI('interfacePack');void flowJob('interfacePack',async progress=>{
   for(let i=0;i<missing.length;i+=24){
    progress(interfaceLanguages[code]+' · '+i+' / '+missing.length);
    const rows=missing.slice(i,i+24),out=await flowAI('interfacePack',ai,{target:interfaceLanguages[code],strings:rows.map(row=>row[2])});
    if(!Array.isArray(out.translations)||out.translations.length!==rows.length||out.translations.some(v=>typeof v!=='string'||!v.trim()))throw Error('语言包未完成，重新选择可继续。');
    rows.forEach((row,j)=>{pack[row[0]]=out.translations[j]});save(false);
   }
   activateInterface(code);
  });
 });
}
function activateInterface(code){
 db.uiLanguage=code;send('interfaceLanguage',{code,labels:db.languagePacks?.[code]||{}});save();localizeInterface(document.body);
}
function languagePage(){
 return '<section class="box"><label>界面语言<select id="interfaceLanguage">'+Object.entries(interfaceLanguages).map(([value,label])=>option(value,label,value===interfaceLocale())).join('')+'</select></label><p role="status">'+esc(flowJobs.get('interfacePack')||'')+'</p></section>';
}
const interfaceTextNodes=new WeakMap(),interfaceAttributes=new WeakMap();
let interfaceUserText=new Set(),interfacePattern,interfaceRows;
function indexInterface(){
 if(interfaceRows)return;
 interfaceRows=new Map(interfaceCatalogue.map(row=>[row[0],row]));
 const keys=[...interfaceRows.keys()].sort((a,b)=>b.length-a.length);
 interfacePattern=new RegExp(keys.map(k=>k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'gu');
}
function interfaceLabel(text){indexInterface();return db.languagePacks?.[interfaceLocale()]?.[text]||interfaceRows.get(text)?.[Object.keys(interfaceLanguages).indexOf(interfaceLocale())]||text}
function indexUserText(){
 interfaceUserText=new Set();if(interfaceLocale()==='zh-Hans')return;
 const fields=new Set(['name','title','goal','question','topic','label','note','notes','text','body','abstract','purpose','transcript','minutes','affiliation','journal','description','author','sourceName','feedback','researchBackground','summary','detail','heading','material','materials','operations','idea','content','procedure','phenomena','deviations','problem']);
 function visit(v,key){
  if(typeof v==='string'){if(v&&fields.has(key))interfaceUserText.add(v);return}
  if(key==='points'&&Array.isArray(v)&&Array.isArray(v[0])||key==='digests'||key==='templateDocument')return;
  if(v&&typeof v==='object')for(const [k,child] of Object.entries(v))visit(child,Array.isArray(v)?key:k);
 }
 visit(db?.projects,'');visit(db?.tasks,'');visit(db?.personal,'');visit(db?.authors,'');
}
function interfaceTranslate(source,locale,element,attribute=''){
 if(locale==='zh-Hans'||!/[\u3400-\u9fff]/u.test(source))return source;
 if(element.closest('.projectRow,pre,code,[data-verbatim],#interfaceLanguage')||(!attribute&&element.closest('textarea')))return source;
 if(element.closest('.transcript')&&source.trim()!=='暂无转写')return source;
 if(attribute!=='placeholder'&&interfaceUserText.has(source.trim())&&!element.matches('button:not(.name),label,summary,.sectionlabel,.nav,#status,.primary'))return source;
 if(element.matches('[data-a="quickSelect"],[data-a="selectPlan"],[data-a="batchOpen"],[data-a="paperSelect"],option')&&interfaceUserText.has(source.trim()))return source;
 indexInterface();
 const index=Object.keys(interfaceLanguages).indexOf(locale);
 function convert(text){
  const trim=text.trim(),row=interfaceRows.get(trim);
  if(row)return text.replace(trim,()=>db.languagePacks?.[locale]?.[trim]||row[index]||trim);
  if(/[\u3400-\u9fff]/u.test(text.replace(interfacePattern,'')))return text;
  return text.replace(interfacePattern,key=>db.languagePacks?.[locale]?.[key]||interfaceRows.get(key)[index]||key);
 }
 if(attribute==='placeholder'||!interfaceUserText.size||interfaceRows.has(source.trim()))return convert(source);
 // Preserve embedded user titles in labels such as “System 1 · …” and in deletion dialogs.
 const matches=[];
 for(const value of interfaceUserText)if(value.length>0&&value.length<=source.length&&source.includes(value)&&source.trim()!==value)matches.push(value);
 if(!matches.length)return convert(source);
 const out=[];let rest=source;
 while(rest){let pos=rest.length,chosen='';for(const v of matches){const i=rest.indexOf(v);if(i>=0&&(i<pos||i===pos&&v.length>chosen.length)){pos=i;chosen=v}}
  out.push(convert(rest.slice(0,pos)),chosen);if(!chosen)break;rest=rest.slice(pos+chosen.length);
 }
 return out.join('');
}
function localizeInterface(root){
 if(!root||typeof Node==='undefined'||!db)return;
 const locale=interfaceLocale();
 document.documentElement.lang=locale;
 function visit(node){
  if(node.nodeType===Node.TEXT_NODE){
   const el=node.parentElement;if(!el)return;
   const last=interfaceTextNodes.get(node),source=last&&last.display===node.nodeValue?last.source:node.nodeValue;
   const display=interfaceTranslate(source,locale,el);interfaceTextNodes.set(node,{source,display});
   if(display!==node.nodeValue){if(el.tagName==='OPTION'&&!el.hasAttribute('value'))el.value=source;node.nodeValue=display}
  }else if(node.nodeType===Node.ELEMENT_NODE){
   if(['SCRIPT','STYLE','SVG'].includes(node.tagName.toUpperCase()))return;
   for(const attr of ['placeholder','aria-label','title']){
    if(!node.hasAttribute(attr))continue;
    let record=interfaceAttributes.get(node);if(!record){record={};interfaceAttributes.set(node,record)}
    const val=node.getAttribute(attr),last=record[attr],source=last&&val===last.display?last.source:val,display=interfaceTranslate(source,locale,node,attr);
    if(display!==val)node.setAttribute(attr,display);record[attr]={source,display};
   }
   if(node.tagName.toUpperCase()!=='TEXTAREA')node.childNodes.forEach(visit);
  }
 }
 visit(root);
}
function bindInterface(){
 if(typeof MutationObserver==='undefined')return;
 new MutationObserver(records=>{
  const roots=new Set();
  for(const r of records){if(r.type==='childList')for(const n of r.addedNodes)roots.add(n);else roots.add(r.target)}
  for(const n of roots)if(n.isConnected)localizeInterface(n);
 }).observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['title','placeholder','aria-label']});
}
