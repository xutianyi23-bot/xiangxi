// Copyright © 2026 徐天翼（笔名：鸡腿堡）
// SPDX-License-Identifier: GPL-3.0-only
'use strict';
const drawingModelHint='<p class="drawingHint">请选择具有生图能力、识图能力的模型</p>';
let activeTOC='';
function tocPage(){
 const figures=db.tocFigures||[],current=figures.find(x=>x.id===activeTOC)||figures.at(-1);
 return '<section class="box"><div class="sect"><h2>图稿</h2>'+btn('新建 TOC 图','tocNew','primary')+'</div>'+
 (figures.length?'<div class="actions">'+figures.map(x=>btn(x.title+(x.version?' · v'+x.version:''),'tocShow',current===x?'btn selectedPlan':'btn',x.id)).join('')+'</div>':'<p class="empty">输入核心发现，或选择工作区实验，生成可编辑的图文摘要。</p>')+
 (flowJobs.has('toc')?noteBlock(flowJobs.get('toc')):'')+'</section>'+(current?'<section class="box"><div class="sect"><h2>'+esc(current.title)+'</h2>'+'<div class="actions">'+btn('编辑图元','tocEdit','btn',current.id)+btn('按意见改图','tocRevise','btn',current.id)+'</div>'+'</div><div class="tocCanvas">'+tocSVG(current)+'</div><p>'+esc(current.caption)+'</p><div class="actions">'+btn('导出 draw.io','tocDrawio','primary',current.id)+btn('导出 SVG','tocSVG','btn',current.id)+'</div></section>':'');
}
function tocForm(id,notes=''){
 if(flowJobs.has('toc'))return toast('正在绘图…');
 const previous=db.tocFigures?.find(x=>x.id===id);
 let image=null;
 const options=db.projects.flatMap(p=>p.systems.flatMap(s=>batches(s).map(b=>'<label class="tick"><input type="checkbox" name="b_'+esc(b.id)+'" '+(previous?.selection?.includes(b.id)?'checked':'')+'>'+esc([p.name,s.name,b.title].join(' / '))+'</label>'))).join('');
 const body=modelSelectors('toc')+drawingModelHint+longField('message','核心发现或图稿要求',previous?.message||notes)+
 (options?'<details><summary>选择工作区实验</summary>'+options+'</details>':'')+
 '<div class="actions"><button type="button" class="btn" id="tocImage">选择参考图</button><small id="tocFilename"></small></div>'+
 (previous?longField('feedback','修改意见',''):'');
 form(previous?'按意见改图':'新建 TOC 图',body,d=>{
  const selection=Object.keys(d).filter(k=>k.startsWith('b_')).map(k=>k.slice(2));
  if(!d.message&&!image&&!selection.length)throw Error('请输入图稿要求、选择实验或添加参考图。');
  if(previous&&!d.feedback)throw Error('请填写修改意见。');
  const ai=selectedAI('toc');
  void flowJob('toc',async progress=>{
   progress('正在绘图…');
   const experiments=selection.length?await digestMaterial(JSON.stringify(drawingExperiments(selection)),ai,{},progress,6000):'';
   const answer=await flowAI('tocGraph',{...ai,...(image?{image:image.jpeg}:{})},{message:d.message,experiments,feedback:d.feedback,previous:previous&&{nodes:previous.nodes,edges:previous.edges,caption:previous.caption}});
   if(answer.clarification)throw Error(String(answer.clarification));
   const figure={...normalizeTOC(answer),id:uid(),version:previous?(previous.version||1)+1:1,message:d.message,selection,date:localDay()};
   (db.tocFigures??=[]).push(figure);activeTOC=figure.id;save();
  });
 },f=>{
  f.querySelector('.primary').textContent='生成图稿';
  f.querySelector('#tocImage').onclick=async()=>{try{const picked=await askBatch('diagramImage',{});if(picked){image=picked;f.querySelector('#tocFilename').textContent=picked.name}}catch(e){toast(e.message)}};
 });
}
const tocShapes={box:'rounded=1',ellipse:'ellipse',diamond:'rhombus',hexagon:'shape=hexagon',text:'text'};
function normalizeTOC(raw){
 const invalid=()=>{throw Error('图稿结构或坐标无效，请重新生成。')};
 if(!Array.isArray(raw.nodes)||!raw.nodes.length||raw.nodes.length>80||!Array.isArray(raw.edges)||raw.edges.length>120)invalid();
 const keys=new Map();
 const nodes=raw.nodes.map((n,i)=>{
  if(!n||typeof n.id!=='string'||!n.id||keys.has(n.id)||!Object.hasOwn(tocShapes,n.shape)||typeof n.label!=='string'||![n.x,n.y,n.w,n.h].every(Number.isFinite)||n.x<0||n.y<0||n.w<4||n.h<4||n.x+n.w>960||n.y+n.h>420)invalid();
  const id='n'+i;keys.set(n.id,id);
  return {id,label:n.label,shape:n.shape,x:n.x,y:n.y,w:n.w,h:n.h,fill:/^#[0-9a-f]{6}$/i.test(n.fill)?n.fill:'#e3f1eb'};
 });
 const edges=raw.edges.map(e=>{if(!e||!keys.has(e.from)||!keys.has(e.to)||e.from===e.to)invalid();return {from:keys.get(e.from),to:keys.get(e.to),label:typeof e.label==='string'?e.label:'',arrow:e.arrow!==false}});
 return {title:requireText(raw.title,'图名'),caption:String(raw.caption||''),nodes,edges};
}
function tocDrawio(d){
 const vertex=n=>`<mxCell id="${n.id}" value="${esc(n.label)}" style="${tocShapes[n.shape]};whiteSpace=wrap;html=0;fontSize=15;fontColor=#203d35;fillColor=${n.shape==='text'?'none':n.fill};strokeColor=${n.shape==='text'?'none':'#437565'}" vertex="1" parent="1"><mxGeometry x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" as="geometry"/></mxCell>`;
 const edge=(e,i)=>`<mxCell id="e${i}" value="${esc(e.label)}" style="html=0;strokeColor=#437565;endArrow=${e.arrow?'block':'none'}" edge="1" parent="1" source="${e.from}" target="${e.to}"><mxGeometry relative="1" as="geometry"/></mxCell>`;
 return `<mxfile host="app.diagrams.net"><diagram id="toc" name="${esc(d.title)}"><mxGraphModel pageWidth="960" pageHeight="420"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${d.edges.map(edge).join('')}${d.nodes.map(vertex).join('')}</root></mxGraphModel></diagram></mxfile>`;
}
function tocSVG(d){
 const nodes=new Map(d.nodes.map(n=>[n.id,n]));
 const center=n=>[n.x+n.w/2,n.y+n.h/2];
 function boundary(n,other){
  const [x,y]=center(n),[a,b]=center(other),dx=a-x,dy=b-y;
  if(!dx&&!dy)return [x,y];
  const u=Math.abs(dx)*2/n.w,v=Math.abs(dy)*2/n.h;
  const scale=n.shape==='ellipse'?Math.hypot(u,v):n.shape==='diamond'?u+v:Math.max(u,v);
  return [x+dx/scale,y+dy/scale];
 }
 function node(n){
  const [x,y]=center(n),paint=` fill="${n.fill}" stroke="#437565" stroke-width="1.5"`;
  let shape='';
  if(n.shape==='ellipse')shape=`<ellipse cx="${x}" cy="${y}" rx="${n.w/2}" ry="${n.h/2}"${paint}/>`;
  else if(n.shape==='box')shape=`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="8"${paint}/>`;
  else if(n.shape!=='text'){
   const points=n.shape==='diamond'?[[x,n.y],[n.x+n.w,y],[x,n.y+n.h],[n.x,y]]:[[n.x+n.w/4,n.y],[n.x+3*n.w/4,n.y],[n.x+n.w,y],[n.x+3*n.w/4,n.y+n.h],[n.x+n.w/4,n.y+n.h],[n.x,y]];
   shape='<polygon points="'+points.map(p=>p.join(',')).join(' ')+'"'+paint+'/>';
  }
  const width=Math.max(1,Math.floor(n.w/16)),lines=[];
  for(const line of n.label.split(/\r?\n/)){const chars=Array.from(line);for(let i=0;i<chars.length;i+=width)lines.push(chars.slice(i,i+width).join(''))}
  return shape+lines.map((v,i)=>`<text x="${x}" y="${y+(i-(lines.length-1)/2)*17+5}">${esc(v)}</text>`).join('');
 }
 function edge(e){
  const a=nodes.get(e.from),b=nodes.get(e.to),[x,y]=boundary(a,b),[u,v]=boundary(b,a);
  return `<path d="M${x} ${y}L${u} ${v}" stroke="#437565" stroke-width="2"${e.arrow?' marker-end="url(#tocArrow)"':''}/><text x="${(x+u)/2}" y="${(y+v)/2-5}" font-size="12">${esc(e.label)}</text>`;
 }
 return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="420" viewBox="0 0 960 420" font-family="Helvetica,Arial,sans-serif" font-size="15" text-anchor="middle" fill="#203d35"><title>${esc(d.title)}</title><desc>${esc(d.caption)}</desc><defs><marker id="tocArrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="#437565"/></marker></defs><rect width="960" height="420" fill="white"/>${d.edges.map(edge).join('')}${d.nodes.map(node).join('')}</svg>`;
}

function editTOC(id){
 const d=db.tocFigures?.find(x=>x.id===id);if(!d)return;
 const inputs=[['label','文字','text'],['x','横坐标','number'],['y','纵坐标','number'],['w','宽度','number'],['h','高度','number'],['fill','填充色','color']];
 const body='<label>图元<select name="node">'+d.nodes.map((n,i)=>option(n.id,(i+1)+' · '+(n.label||n.shape),i===0)).join('')+'</select></label><div class="tocFields">'+inputs.map(([key,title,type])=>field(key,title,d.nodes[0][key],type)).join('')+'</div>';
 form('编辑图元',body,v=>{
  const n=d.nodes.find(n=>n.id===v.node);if(!n)throw Error('请选择图元。');
  const patch={...n,label:v.label,fill:v.fill};
  for(const k of ['x','y','w','h']){if(!v[k])throw Error('请填写坐标和尺寸。');patch[k]=Number(v[k])}
  normalizeTOC({...d,nodes:d.nodes.map(item=>item===n?patch:item)});
  Object.assign(n,patch);
 },f=>{
  for(const k of ['x','y','w','h'])f.elements[k].step='any';
  f.elements.node.onchange=()=>{const n=d.nodes.find(n=>n.id===f.elements.node.value);for(const [k] of inputs)f.elements[k].value=n[k]};
 });
}
