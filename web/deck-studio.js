// Copyright © 2026 徐天翼（笔名：鸡腿堡）
// SPDX-License-Identifier: GPL-3.0-only
'use strict';
function deckHistory(r){
 if(!r.deckVersions)r.deckVersions=r.slides?.length?[{id:uid(),number:1,date:r.date||'',slides:r.slides,appearance:r.appearance||{},notes:(r.revisions||[]).slice()}]:[];
 return r.deckVersions;
}
function activeDeck(r){const rows=deckHistory(r);return rows.find(v=>v.id===r.currentDeck)||rows.at(-1)}
function selectDeck(r,v){r.currentDeck=v?.id;r.slides=v?.slides||[];r.appearance=v?.appearance||{};r.revisions=v?.notes?.slice()||[];r.previewIndex=0}
function deckStyles(){return db.reportStyles??=Object.entries(db.deckStyles||{}).map(([category,v])=>({...v,id:uid(),name:category,category}))}
function reportStyle(r){
 const styles=deckStyles();if(r.styleId!==undefined)return styles.find(x=>x.id===r.styleId);
 return styles.filter(x=>x.category===r.category).at(-1);
}
function reportStudio(r){
 const v=activeDeck(r),rows=deckHistory(r),idx=Math.max(0,Math.min(r.previewIndex||0,(v?.slides.length||1)-1)),slide=v?.slides[idx],styles=deckStyles();
 const style=reportStyle(r);
 const controls='<div class="actions">'+btn('生成汇报 PPT','makeDeck','primary',r.id)+btn('导入 PPT 模板','deckImport','btn',r.id)+(r.deckTemplate?btn(r.deckTemplate.name+' ×','deckClear','btn',r.id):'')+btn(style?'风格 · '+style.name:'选择汇报风格','deckStyles','btn',r.id)+'</div>';
 const versions=rows.slice().reverse().map(x=>'<tr><td>'+btn('V'+x.number,'deckSelect',x===v?'btn selectedPlan':'btn',x.id)+'</td><td>'+esc(x.date)+'</td><td>'+x.slides.length+'</td><td>'+esc(x.notes?.at(-1)||'初稿')+'</td><td><div class="actions">'+btn('预览','deckPreview','link',x.id)+btn('AI 修改','deckRevise','link',x.id)+btn('导出','deckExport','link',x.id)+btn('删除','deckDelete','link',x.id)+'</div></td></tr>').join('');
 return '<section class="box">'+modelSelectors('deck')+controls+noteBlock(flowJobs.get(r.id)||'')+(v?'<div class="slidePreview" style="--accent:#'+(/^[a-f0-9]{6}$/i.test(v.appearance?.accent)?v.appearance.accent:'205946')+'"><small>'+esc(slide.role||r.category)+'</small><h2>'+esc(slide.title)+'</h2><ul>'+slide.points.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul></div><div class="actions">'+btn('上一页','deckPrev','btn',r.id)+'<span>'+(idx+1)+' / '+v.slides.length+'</span>'+btn('下一页','deckNext','btn',r.id)+btn('预览实际版式','deckPreview','btn',v.id)+btn('记录 PPT 相关风格','deckRecord','btn',v.id)+'</div><h3>历史版本</h3><div class="tableScroll"><table class="versions"><thead><tr><th>版本</th><th>生成日期</th><th>页数</th><th>修改要求</th><th>操作</th></tr></thead><tbody>'+versions+'</tbody></table></div>':'')+'</section>';
}
function deckAction(a,id,p){
 if(!a.startsWith('deck'))return false;
 const r=p.reports?.find(r=>r.id===id||deckHistory(r).some(v=>v.id===id));if(!r)return false;
 const v=deckHistory(r).find(v=>v.id===id)||activeDeck(r);
 if(a==='deckNext'||a==='deckPrev'){r.previewIndex=Math.max(0,Math.min((r.previewIndex||0)+(a==='deckNext'?1:-1),v.slides.length-1));render()}
 if(a==='deckSelect'){selectDeck(r,v);save()}
 if(a==='deckPreview'||a==='deckExport')send(a==='deckPreview'?'previewReport':'exportResearch',{format:'pptx',name:r.title+' V'+v.number,slides:v.slides,appearance:v.appearance,templateFile:v.template?.file||''});
 if(a==='deckDelete')form('删除 V'+v.number+'？',noteBlock(r.title),()=>{r.deckVersions=r.deckVersions.filter(x=>x!==v);if(r.currentDeck===id||!r.deckVersions.length)selectDeck(r,r.deckVersions.at(-1))});
 if(a==='deckRevise')form('修改 V'+v.number,longField('feedback','修改要求'),d=>{const feedback=requireText(d.feedback,'修改要求');queueMicrotask(()=>makeDeck(r,feedback,v).catch(e=>toast(e.message)))});
 if(a==='deckImport')askBatch('pickDeckTemplate',{}).then(x=>{if(x?.file){r.deckTemplate=x;save()}}).catch(e=>toast(e.message));
 if(a==='deckClear'){delete r.deckTemplate;save()}
 if(a==='deckRecord')form('记录 PPT 相关风格',field('name','风格名称',r.category||'组会汇报','text',true)+longField('notes','额外风格要求'),d=>{
  named(d.name,deckStyles());const style={id:uid(),name:d.name,category:r.category,instructions:[...(v.notes||[]),d.notes].filter(Boolean),appearance:v.appearance,layout:v.slides.map(x=>({role:x.role,points:x.points.length}))};
  deckStyles().push(style);r.styleId=style.id;
 });
 if(a==='deckStyles'){
  const styles=deckStyles();
  form('汇报风格','<label>已记录的风格<select name="style">'+option('','自动设计',!reportStyle(r))+styles.map(x=>option(x.id,x.name,x.id===reportStyle(r)?.id)).join('')+'</select></label><div class="styleInfo"></div><button class="btn" type="button" id="styleExport">导出风格</button>',d=>{r.styleId=d.style},f=>{
   const show=()=>{const x=styles.find(x=>x.id===f.elements.style.value);f.querySelector('.styleInfo').textContent=x?[x.name,...x.instructions||[],'主题色 #'+(x.appearance?.accent||'205946'),...(x.layout||[]).map(v=>v.role+' · '+v.points+' 个要点')].join('\n'):'';f.querySelector('#styleExport').disabled=!x};
   f.elements.style.onchange=show;show();f.querySelector('#styleExport').onclick=()=>{const x=styles.find(x=>x.id===f.elements.style.value);if(x)send('exportDeckStyle',{name:x.name,text:JSON.stringify(x,null,2)})};
  });
 }return true;
}
