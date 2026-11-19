// Copyright © 2026 徐天翼（笔名：鸡腿堡）
// SPDX-License-Identifier: GPL-3.0-only
'use strict';

let diagramDraft={type:'mechanism',source:'names',substrate:'',product:'',notes:'',selection:[],image:null},activeDiagram='';
function diagramPage(){
 const drawings=db.drawings||[],d=drawings.find(x=>x.id===activeDiagram)||drawings.at(-1);
 return '<section class="box"><div class="sect"><h2>研究绘图</h2>'+btn('新建绘图','diagramNew','primary')+'</div><div class="actions">'+drawings.map(x=>btn(x.title,'diagramShow','btn',x.id)).join('')+'</div>'+esc(flowJobs.get('diagram')||'')+'</section>'+(d?'<section class="box"><div class="sect"><h2>'+esc(d.title)+'</h2>'+btn('导出可编辑 SVG','diagramExport','btn',d.id)+'</div><div class="diagramPreview">'+diagramSVG(d)+'</div>'+noteBlock(d.review||'')+'</section>':'');
}
function diagramForm(prefill){
 if(flowJobs.has('diagram'))return toast('正在绘图…');
 if(prefill)diagramDraft={...diagramDraft,...prefill};const d=diagramDraft;
 const batchesHTML=db.projects.map(p=>'<fieldset><legend>'+esc(p.name)+'</legend>'+p.systems.map(s=>batches(s).map(b=>'<label class="tick"><input type="checkbox" name="b_'+esc(b.id)+'" '+(d.selection.includes(b.id)?'checked':'')+'>'+esc(s.name+' / '+b.title)+'</label>').join('')).join('')+'</fieldset>').join('');
 form('研究绘图',modelSelectors('mechanism')+drawingModelHint+'<label>图的类型<select name="type">'+option('mechanism','反应机理图',d.type==='mechanism')+option('flow','流程图',d.type==='flow')+'</select></label><label>资料来源<select name="source">'+Object.entries({names:'底物与产物',image:'手稿图片',batches:'工作区实验'}).map(([k,v])=>option(k,v,k===d.source)).join('')+'</select></label><div data-source="names">'+field('substrate','底物名称',d.substrate)+field('product','产物名称',d.product)+'</div><div data-source="image"><button type="button" class="btn" id="sketchPicker">选择手稿图片</button><span id="sketchName"></span></div><div data-source="batches">'+batchesHTML+'</div>'+longField('notes','补充说明',d.notes),v=>{
  const ai=selectedAI('mechanism'),selection=Object.keys(v).filter(k=>k.startsWith('b_')).map(k=>k.slice(2));
  Object.assign(d,{type:v.type,source:v.source,substrate:v.substrate,product:v.product,notes:v.notes,selection});
  if(v.source==='names'&&(!v.substrate||!v.product))throw Error('请填写底物和产物名称。');
  if(v.source==='image'&&!d.image)throw Error('请选择手稿图片。');
  if(v.source==='batches'&&!selection.length)throw Error('请选择至少一锅实验。');
  void generateDiagram({...d},ai);
 },f=>{
  const show=()=>{for(const g of f.querySelectorAll('[data-source]'))g.hidden=g.dataset.source!==f.elements.source.value};
  f.elements.source.onchange=show;show();const name=f.querySelector('#sketchName');name.textContent=d.image?.name||'';
  f.querySelector('#sketchPicker').onclick=async()=>{try{const img=await askBatch('diagramImage',{});if(img){d.image=img;name.textContent=img.name}}catch(e){toast(e.message)}};
  f.querySelector('.primary').textContent='生成图稿';
 });
}
function drawingExperiments(ids){
 return db.projects.flatMap(p=>p.systems.flatMap(s=>batches(s).filter(b=>ids.includes(b.id)).map(b=>({project:p.name,system:s.name,experiment:b.title,purpose:b.purpose,materials:b.materials,procedure:b.procedure,notes:b.note,log:b.log,results:(b.results||[]).map(r=>({method:r.method,text:r.text,pending:r.pendingReview}))}))));
}
async function generateDiagram(d,ai){
 await flowJob('diagram',async progress=>{
  progress('正在绘图…');
  const source=d.source==='batches'?await digestMaterial(JSON.stringify(drawingExperiments(d.selection)),ai,{},progress,6000):d.source==='names'?{substrate:d.substrate,product:d.product}:{filename:d.image.name};
  const result=await flowAI('researchDiagram',{...ai,...(d.source==='image'?{image:d.image.jpeg}:{})},{type:d.type,source,notes:d.notes});
  if(result.clarification)throw Error(result.clarification);
  const drawing={id:uid(),type:d.type,title:requireText(result.title,'图名'),steps:result.steps,review:result.review||'',date:localDay()};
  validateDrawing(drawing);(db.drawings||=[]).push(drawing);activeDiagram=drawing.id;save();
 });
}
function validateDrawing(d){
 if(!Array.isArray(d.steps)||!d.steps.length||d.steps.length>32)throw Error('图稿步骤无效。');
 for(const s of d.steps){
  requireText(s.label,'步骤名称');if(d.type==='flow')continue;
  if(!Array.isArray(s.atoms)||!s.atoms.length||!Array.isArray(s.bonds)||!Array.isArray(s.arrows))throw Error('模型未返回可核对的分子结构。');
  const ids=new Set(s.atoms.map(a=>a.id));
  if(ids.size!==s.atoms.length||s.atoms.some(a=>typeof a.id!=='string'||typeof a.label!=='string'||![a.x,a.y].every(v=>Number.isFinite(v)&&v>=0&&v<=100)))throw Error('原子编号或坐标无效。');
  const pairs=new Set();
  for(const b of s.bonds){const pair=JSON.stringify([b.a,b.b].sort());if(!ids.has(b.a)||!ids.has(b.b)||b.a===b.b||pairs.has(pair)||![1,2,3].includes(b.order))throw Error('请核对分子键的连接与键级。');pairs.add(pair)}
  for(const a of s.arrows)for(const endpoint of [a.from,a.to]){
   if(typeof endpoint==='string'? !ids.has(endpoint):!Array.isArray(endpoint)||endpoint.length!==2||!pairs.has(JSON.stringify([...endpoint].sort())))throw Error('电子箭头未对应到原子或化学键。');
  }
 }
}
function diagramSVG(d){
 const w=590,h=d.type==='mechanism'?265:100;
 const bounds=d.type==='mechanism'?d.steps.map(step=>{
  const xx=step.atoms.map(a=>a.x),yy=step.atoms.map(a=>a.y);
  return {left:Math.min(...xx),right:Math.max(...xx),top:Math.min(...yy),bottom:Math.max(...yy)};
 }):[];
 const scale=Math.min(5,...bounds.flatMap(b=>[460/Math.max(1,b.right-b.left),125/Math.max(1,b.bottom-b.top)]));
 const header='<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+(d.steps.length*h+40)+'" viewBox="0 0 '+w+' '+(d.steps.length*h+40)+'" font-family="Helvetica,Arial,sans-serif"><defs><marker id="electronTip" orient="auto" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="8" refX="8" refY="4"><path d="M0 0L8 4L0 8" fill="none" stroke="#245A82"/></marker><marker id="fishhook" orient="auto" markerWidth="8" markerHeight="8" refX="7" refY="4"><path d="M0 0L7 4" fill="none" stroke="#245A82"/></marker></defs><rect width="100%" height="100%" fill="white"/>';
 const txt=(x,y,s,sz=14)=>'<text x="'+x+'" y="'+y+'" font-size="'+sz+'">'+esc(s)+'</text>';
 return header+d.steps.map((s,i)=>{
  const y=i*h+12;let body=txt(18,20,(i+1)+'. '+s.label,17);
  if(d.type==='mechanism'){
   const box=bounds[i],atoms=new Map(s.atoms.map(a=>[a.id,{x:w/2+(a.x-(box.left+box.right)/2)*scale,y:110+(a.y-(box.top+box.bottom)/2)*scale}]));
   const point=v=>{if(typeof v==='string')return atoms.get(v);const a=atoms.get(v[0]),b=atoms.get(v[1]);return {x:(a.x+b.x)/2,y:(a.y+b.y)/2}};
   for(const b of s.bonds){
    const a=point(b.a),c=point(b.b),dx=c.x-a.x,dy=c.y-a.y,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;
    if(b.stereo==='wedge'){body+='<polygon points="'+a.x+','+a.y+' '+(c.x+nx*3)+','+(c.y+ny*3)+' '+(c.x-nx*3)+','+(c.y-ny*3)+'"/>';continue}
    if(b.stereo==='dash'){for(let j=1;j<=7;j++){const f=j/7,x=a.x+dx*f,y=a.y+dy*f;body+='<path d="M'+(x-nx*3*f)+' '+(y-ny*3*f)+'l'+(nx*6*f)+' '+(ny*6*f)+'" stroke="black"/>'}continue}
    for(let j=0;j<b.order;j++){const off=(j-(b.order-1)/2)*3.1;
     body+='<path d="M'+(a.x+nx*off)+' '+(a.y+ny*off)+'l'+dx+' '+dy+'" stroke="black" stroke-width="1.4"/>'}
   }
   for(const arrow of s.arrows){const a=point(arrow.from),b=point(arrow.to),bend=arrow.bend===-1?-1:1,dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
    body+='<path d="M'+a.x+' '+(a.y-3)+'Q'+((a.x+b.x)/2-bend*dy*30/len)+' '+((a.y+b.y)/2+bend*dx*30/len)+' '+b.x+' '+(b.y-4)+'" stroke="#245A82" fill="none" marker-end="url(#'+(arrow.radical?'fishhook':'electronTip')+')"/>'}
   for(const atom of s.atoms){if(!atom.label)continue;const p=point(atom.id);body+='<text x="'+p.x+'" y="'+(p.y+4)+'" text-anchor="middle" font-size="14" stroke="white" stroke-width="3" paint-order="stroke">'+esc(atom.label)+'</text>'}
  }
  const lines=Array.from(String(s.detail||'')).join('').match(/.{1,47}/gu)||[];
  body+=lines.slice(0,3).map((line,j)=>txt(18,h-49+16*j,line,13)).join('');
  if(i<d.steps.length-1)body+=txt(14,h-1,'↓',18);
  return '<g transform="translate(0 '+y+')">'+body+'</g>';
 }).join('')+'</svg>';
}
