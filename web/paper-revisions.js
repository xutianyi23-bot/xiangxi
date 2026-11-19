// Copyright © 2026 徐天翼（笔名：鸡腿堡）
// SPDX-License-Identifier: GPL-3.0-only
'use strict';
function reviewPanel(s,t){
 if(!t)return '<section class="box">请先添加目标期刊。</section>';
 const reviews=t.reviews||[],draft=t.drafts.find(d=>d.id===t.activeDraft)||t.drafts.at(-1);
 return '<section class="box"><div class="sect"><h2>'+esc(t.name)+' · 论文修改</h2>'+btn('录入审稿意见','reviewNew')+'</div>'+modelSelectors('manuscript')+
 '<p>保留审稿原文，逐条生成修改建议，确认后另存为新稿。</p>'+ (draft?'<label>当前稿件</label><div class="actions">'+t.drafts.map((d,i)=>btn('第 '+(i+1)+' 稿','paperVersion',draft===d?'btn selectedPlan':'btn',d.id)).join('')+'</div>':'')+
 reviews.map(r=>'<article class="deskItem"><h3>'+esc(r.title)+'</h3><details><summary>查看完整原文</summary>'+noteBlock(r.original)+'</details>'+btn('从原文拆分意见','reviewSplit','btn',r.id)+
 (r.items||[]).map(x=>'<section class="box">'+noteBlock(x.quote)+noteBlock(x.text||'')+(x.applied?'已应用至新稿':btn('生成逐条修改稿','reviewPropose','btn',x.id))+(x.proposal?'<h4>原段落</h4>'+noteBlock(x.proposal.before)+'<h4>建议修改</h4>'+noteBlock(x.proposal.paragraph.map(v=>v.text).join(' '))+(!x.applied?btn('确认采用此修改','reviewAccept','primary',x.id):''):'')+'</section>').join('')+'</article>').join('')+'</section>';
}
function reviewClick(a,id,s,t){
 if(a==='paperTab'){s.paperTab=id;save();return true}
 if(!a.startsWith('review')||!t)return false;
 if(a==='reviewNew')form('录入审稿意见',field('title','来源或轮次','','text',true)+longField('original','审稿人原文'),d=>{requireText(d.original,'原文');(t.reviews??=[]).push({...d,id:uid(),items:[]})});
 const r=t.reviews?.find(r=>r.id===id||r.items.some(x=>x.id===id)),item=r?.items.find(x=>x.id===id),c=scope();
 if(a==='reviewSplit'&&r){const ai=selectedAI('manuscript');void flowJob(id,async()=>{
  const pieces=[];for(const part of textPieces(r.original,10000)){
   const out=await flowAI('mailReview',ai,{subject:r.title,body:part});if(!Array.isArray(out.items))throw Error('未取得有效意见。');
   for(const x of out.items)if(x.quote&&part.includes(x.quote))pieces.push(x);
  }
  for(const x of pieces)if(!r.items.some(y=>y.quote===x.quote))r.items.push({id:uid(),quote:x.quote,text:x.text});save();
 });}
 const draft=t.drafts.find(d=>d.id===t.activeDraft)||t.drafts.at(-1);
 if(a==='reviewPropose'&&item){
  if(!draft)throw Error('请先生成稿件。');
  const choices=draft.sections.flatMap((s,i)=>s.paragraphs.map((p,j)=>({key:i+'-'+j,i,j,label:s.heading+' · '+p.map(v=>v.text).join(' ').slice(0,64)})));
  form('选择要修改的段落',noteBlock(item.quote)+'<label>段落<select name="paragraph">'+choices.map(x=>option(x.key,x.label,false)).join('')+'</select></label>'+modelSelectors('manuscript'),d=>{
   const ai=selectedAI('manuscript'),pos=choices.find(v=>v.key===d.paragraph),old=draft.sections[pos.i].paragraphs[pos.j],before=old.map(v=>v.text).join(' ');
   void flowJob(item.id,async()=>{
    const research=await digestMaterial(JSON.stringify(writingResearch(c)),ai,{},()=>{},8000);
    const sources=draft.refs.map(x=>({id:x.id,evidence:(x.evidence||'').slice(0,1600)}));
    const answer=await flowAI('revisionItem',ai,{journal:t.name,language:draft.lang,original:old,review:item.quote,research,sources});
    const paragraphs=verifyParagraphs(answer.paragraphs,sources);if(paragraphs.length!==1)throw Error('请重试，单项修改应只涉及一个段落。');
    if(!t.drafts.includes(draft))throw Error('原稿已删除。');
    item.proposal={base:draft.id,i:pos.i,j:pos.j,before,paragraph:paragraphs[0]};save();
   });
  });
 }
 if(a==='reviewAccept'&&item&&!item.applied){
  const q=item.proposal;if(!q||draft?.id!==q.base)throw Error('当前稿件已变化，请在当前版本重新生成此项修改。');
  const next=JSON.parse(JSON.stringify(draft));next.sections[q.i].paragraphs[q.j]=q.paragraph;
  const used=new Set(next.sections.flatMap(s=>s.paragraphs.flatMap(p=>p.flatMap(v=>v.refs.map(r=>r.id)))));
  next.refs=next.refs.filter(x=>used.has(x.id));next.id=uid();next.feedback=item.quote;next.date=localDay();t.drafts.push(next);t.activeDraft=next.id;item.applied=next.id;save();
 }return true;
}
async function searchGuide(c,t){
 const ai=selectedAI('corpus');await flowJob('guide'+t.id,async progress=>{
  progress('正在查找期刊官方投稿须知…');
  const source=await askBatch('journalGuide',{query:t.name});const out=await flowAI('authorGuide',ai,{journal:t.name,url:source.url,text:source.text});
  if(journalObject(c,t.id)!==t)return;t.guide=requireText(out.guide,'投稿须知');t.guideSource=source.url;t.guideDate=localDay();save();
 });
}
