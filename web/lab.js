'use strict';

const labSessions=new WeakMap();
function labSession(s){
 if(!labSessions.has(s))labSessions.set(s,{open:'',selection:new Set(),left:0,top:0});
 return labSessions.get(s);
}
function batchNumber(b,i){return '第 '+(i+1)+' '+(b.unit==='组'?'组':'锅')}
function submittedPlans(s){return designs(s).filter(d=>d.submitted).map(d=>d.published?{...d,...d.published}:d)}
function labPanel(s){
 const batchesHere=batches(s),ui=labSession(s),b=batchesHere.find(x=>x.id===ui.open);
 if(b)return batchDetail(s,b);
 const plans=submittedPlans(s);
 const overviews=plans.map(p=>{
  return `<article class="deskItem"><h3>${esc(p.title)}</h3>${noteBlock(p.question)}<details><summary>对照、工作安排与参考文献</summary>${noteBlock([p.controls,p.steps,p.readout].filter(Boolean).join('\n\n'))}${citationBlock(s,p)}</details></article>`;
 }).join('');
 return `<section class="box"><div class="sect"><h2>实验设计概要</h2>${btn('打开课题设计','area','link','designs')}</div>${overviews||'<p class="empty">从课题设计提交总体方案后，可在这里查看。</p>'}</section>
 ${reagentPanel(s)}<section class="box"><div class="sect"><h2>分锅与分组实验 <span class="num">${batchesHere.length}</span></h2>${btn('＋ 新建实验','batch','primary')}</div>${btn('根据设计概要及药品自动生成','generateFromOverview','btn')}${plans.map(p=>esc(flowJobs.get(p.id)||'')).join(' ')}${batchesHere.length?boardMarkup(s):'<p class="empty">新建第一锅或第一组实验，记录投料、操作和观察。</p>'}</section>${measurementPanel(s,sharedMeasurements(s))}`;
}
function batchDetail(s,b){
 const plan=submittedPlans(s).find(p=>p.id===b.designId);
 return `<section class="box"><div class="sect">${btn('‹ 返回实验工作区','labBack','link')}${btn('编辑实验','batch','btn',b.id)}</div><small>${batchNumber(b,batches(s).indexOf(b))}</small><h2>${esc(b.title)}</h2>
 ${plan?`<p>所属方案　${esc(plan.title)}</p>`:''}
 <p>${esc(b.category||'未分类')} · ${batchState(s,b,proj())}</p>
 ${modelSelectors('potDesign')}${btn('根据总体方案设计本锅实验','potDesign','btn',b.id)} ${btn('与 AI 修改本锅方案','revisePot','btn',b.id)} ${esc(flowJobs.get(b.id)||'')}
 ${b.preparation?'<details open><summary>待核对的单锅草案</summary>'+noteBlock([b.preparation.purpose,b.preparation.materials,b.preparation.procedure].join('\n\n'))+'</details>':''}
 ${b.preparation?btn('核对并采用单锅草案','acceptPot','primary',b.id):''}
 ${[['本锅要解决的问题',b.question],['本锅实验目的',b.purpose],['投料、样品或材料',b.materials],['具体操作与条件',b.procedure],['描述与备注',b.note]].map(([k,v])=>`<h3>${k}</h3>${noteBlock(v||'尚未记录')}`).join('')}
 ${plan?citationBlock(s,plan):''}</section>${logPanel(b)}${measurementPanel(s,b)}`;
}
function batchForm(id,useDraft=false){
 const s=system(filter),b=batches(s).find(b=>b.id===id),plans=submittedPlans(s);
 const values=useDraft?b.preparation:b;
 const planId=b?b.designId:plans.at(-1)?.id;
 form(b?'编辑实验':'新建实验',field('title','实验名称',b?.title,'text',true)+
  `<label>记录单位<select name="unit">${['锅','组'].map(u=>option(u,u,(b?.unit||'锅')===u)).join('')}</select></label>
  <label>所属总体方案<select name="designId">${option('','独立实验',!planId)}${plans.map(p=>option(p.id,p.title,p.id===planId)).join('')}</select></label>`+
  field('category','实验分类（如对照、重复、条件筛选）',values?.category)+longField('question','本锅要解决的问题',values?.question)+longField('purpose','实验目的',values?.purpose)+longField('materials','投料、样品或材料',values?.materials)+longField('procedure','具体操作与条件',values?.procedure)+longField('note','描述与备注',b?.note),d=>{
   if(!d.title)throw Error('请填写实验名称。');
   if(b){Object.assign(b,d);if(useDraft)delete b.preparation}else (s.experiments||=[]).push({...d,id:uid(),results:[],position:nextPosition(s)});
 });
}

const tileWidth=170,tileHeight=102,linkColors=['#534278','#ab5141','#247181','#946529','#934e79','#54734b'];
function positionOf(b,index){
 return b.position||{x:20+(index%3)*222,y:24+Math.floor(index/3)*150};
}
function nextPosition(s){
 const positions=batches(s).map(positionOf);
 for(let i=0;;i++){
  const pos=positionOf({},i);
  if(positions.every(p=>Math.abs(p.x-pos.x)>=tileWidth+12||Math.abs(p.y-pos.y)>=tileHeight+12))return pos;
 }
}
function relationColor(s,r){
 const labels=[...new Set((s.relations||[]).map(x=>x.label))];
 return linkColors[Math.max(0,labels.indexOf(r.label))%linkColors.length];
}
function boardMarkup(s){
 const rows=batches(s),selection=labSession(s).selection,relations=s.relations||[];
 const positions=rows.map(positionOf);
 const width=Math.max(620,...positions.map(p=>p.x+tileWidth+64)),height=Math.max(185,...positions.map(p=>p.y+tileHeight+60));
 const cards=rows.map((b,i)=>{
  const p=positions[i],id=esc(b.id),checked=selection.has(b.id);
  return `<article class="labTile${checked?' marked':''}" data-batch="${id}" style="left:${p.x}px;top:${p.y}px"><div class="tileTools"><label><input type="checkbox" data-batch-check="${id}" ${checked?'checked':''}>${batchNumber(b,i)}</label><button class="handle" data-handle="${id}" aria-label="移动${esc(b.title)}" title="拖动，或使用方向键移动">⠿</button></div><button class="tileOpen" data-a="batchOpen" data-id="${id}"><b>${esc(b.title)}</b><small>${esc([b.category,batchState(s,b,proj())].filter(Boolean).join(' · '))}</small></button></article>`;
 }).join('');
 return `<div class="boardBar"><small>拖动卡片右上角可移动位置。勾选实验可建立关系。</small><button data-a="addRelation" class="btn" ${selection.size<2?'disabled':''}>建立关系${selection.size?' ('+selection.size+')':''}</button></div>
 <div class="boardScroll"><div class="labBoard" style="min-width:${width}px;height:${height}px"><svg aria-hidden="true" class="wires">${wireMarkup(s,positions)}</svg>${cards}</div></div>
 ${relations.length?`<div class="legend"><strong>关系图例</strong>${relations.map(r=>`<button data-a="editRelation" data-id="${esc(r.id)}" title="编辑关系"><i style="background:${relationColor(s,r)}"></i>${esc(r.label)} <small>${r.members.map(id=>rows.findIndex(b=>b.id===id)+1).filter(Boolean).join('、')}</small></button>`).join('')}</div>`:''}`;
}
function wireMarkup(s,positions){
 const centers=new Map(batches(s).map((b,i)=>[b.id,{x:positions[i].x+tileWidth/2,y:positions[i].y+tileHeight/2}]));
 return (s.relations||[]).map((r,index)=>{
  const points=r.members.map(id=>centers.get(id)).filter(Boolean);
  if(points.length<2)return '';
  // Connect the nearest unconnected card to the group, keeping each group connected after a move.
  const connected=[points.shift()],segments=[];
  while(points.length){
   let distance=Infinity,start=connected[0],candidate=0;
   for(const a of connected)points.forEach((b,i)=>{
    const d=Math.hypot(a.x-b.x,a.y-b.y);
    if(d<distance){distance=d;start=a;candidate=i}
   });
   const end=points.splice(candidate,1)[0],dx=end.x-start.x,dy=end.y-start.y;
   const offset=(index%5-2)*4,ox=distance?(-dy/distance)*offset:0,oy=distance?(dx/distance)*offset:0;
   segments.push('M'+(start.x+ox)+' '+(start.y+oy)+' L'+(end.x+ox)+' '+(end.y+oy));connected.push(end);
  }
  return `<path data-relation="${esc(r.id)}" d="${segments.join(' ')}" fill="none" stroke="${relationColor(s,r)}" stroke-width="3"/>`;
 }).join('');
}
function relationForm(s,id){
 const r=(s.relations||[]).find(r=>r.id===id),ui=labSession(s),members=r?r.members:[...ui.selection];
 form(r?'编辑关系':'建立实验关系',field('label','关系名称',r?.label||'对比','text',true)+
  '<fieldset><legend>关联实验</legend>'+batches(s).map((b,i)=>`<label class="tick"><input type="checkbox" name="m_${esc(b.id)}" ${members.includes(b.id)?'checked':''}>${batchNumber(b,i)} · ${esc(b.title)}</label>`).join('')+'</fieldset>',d=>{
   const selected=batches(s).filter(b=>d['m_'+b.id]).map(b=>b.id);
   if(!d.label||selected.length<2)throw Error('请填写关系名称并至少选择两个实验。');
   if(r){Object.assign(r,{label:d.label,members:selected});delete r.generatedFor}
   else (s.relations||=[]).push({id:uid(),label:d.label,members:selected});
   ui.selection.clear();
 });
}
function labChange(el){
 if(!el.dataset?.batchCheck||view!=='tasks'||area!=='lab')return false;
 const id=el.dataset.batchCheck,ui=labSession(system(filter));
 if(el.checked)ui.selection.add(id);else ui.selection.delete(id);
 render();return true;
}
function labClick(a,id){
 const s=system(filter),ui=labSession(s);
 if(a==='addRelation'||a==='editRelation'){relationForm(s,id);return true}
 if(a==='batchOpen'||a==='labBack'){
  ui.open=a==='labBack'?'':id;render();app.querySelector('.main').scrollTop=0;return true;
 }
 return measurementClick(a,id,s)||reagentClick(a,id,s);
}
function bindLabBoard(){
 let move=null;
 app.addEventListener('scroll',e=>{
  if(e.target.classList?.contains('boardScroll')&&view==='tasks'&&area==='lab'){
   const ui=labSession(system(filter));ui.left=e.target.scrollLeft;ui.top=e.target.scrollTop;
  }
 },true);
 app.addEventListener('pointerdown',e=>{
  const handle=e.target.closest('[data-handle]');if(!handle||e.button!==0)return;
  const s=system(filter),i=batches(s).findIndex(b=>b.id===handle.dataset.handle),board=handle.closest('.labBoard');
  const pos=positionOf(batches(s)[i],i),rect=board.getBoundingClientRect();
  move={handle,s,i,board,pos,offsetX:e.clientX-rect.left-pos.x,offsetY:e.clientY-rect.top-pos.y};
  handle.setPointerCapture(e.pointerId);e.preventDefault();
 });
 app.addEventListener('pointermove',e=>{
  if(!move)return;
  const {s,i,handle,board,offsetX,offsetY}=move,rect=board.getBoundingClientRect(),scroll=board.parentElement,frame=scroll.getBoundingClientRect();
  if(e.clientX>frame.right-22)scroll.scrollLeft+=12;else if(e.clientX<frame.left+22)scroll.scrollLeft-=12;
  if(e.clientY>frame.bottom-18)scroll.scrollTop+=12;else if(e.clientY<frame.top+18)scroll.scrollTop-=12;
  const x=Math.max(0,Math.round(e.clientX-rect.left-offsetX)),y=Math.max(0,Math.round(e.clientY-rect.top-offsetY));
  const tile=handle.closest('.labTile');tile.style.left=x+'px';tile.style.top=y+'px';
  board.style.minWidth=Math.max(board.clientWidth,x+tileWidth+32)+'px';board.style.height=Math.max(board.clientHeight,y+tileHeight+32)+'px';
  const positions=batches(s).map(positionOf);positions[i]=move.next={x,y};
  board.querySelector('.wires').innerHTML=wireMarkup(s,positions);
 });
 function finish(e){
  if(!move)return;
  const {s,i,next,handle}=move;move=null;
  if(handle.hasPointerCapture(e.pointerId))handle.releasePointerCapture(e.pointerId);
  if(next&&e.type==='pointerup'){batches(s)[i].position=next;save()}else render();
 }
 app.addEventListener('pointerup',finish);app.addEventListener('pointercancel',finish);
 app.addEventListener('lostpointercapture',e=>{if(move?.handle===e.target)finish(e)});
 app.addEventListener('keydown',e=>{
  const id=e.target.dataset.handle,step={ArrowLeft:[-16,0],ArrowRight:[16,0],ArrowUp:[0,-16],ArrowDown:[0,16]}[e.key];
  if(!id||!step)return;
  const rows=batches(system(filter)),i=rows.findIndex(b=>b.id===id),p=positionOf(rows[i],i);
  rows[i].position={x:Math.max(0,p.x+step[0]),y:Math.max(0,p.y+step[1])};e.preventDefault();save();
  Array.from(app.querySelectorAll('[data-handle]')).find(h=>h.dataset.handle===id)?.focus();
 });
}
