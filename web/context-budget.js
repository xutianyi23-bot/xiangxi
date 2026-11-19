'use strict';

// The bound covers serialized UTF-8, including field names and escaping.
const contextBytes=s=>new TextEncoder().encode(s).length;
function textPieces(text,maxBytes,escaped=false){
 const parts=[];let buffer='',bytes=0;
 for(const ch of text){const code=ch.charCodeAt(0);
  const n=escaped&&(code<32||ch==='"'||ch==='\\')?JSON.stringify(ch).length-2:ch.length===2?4:code<128?1:code<2048?2:3;
  if(bytes+n>maxBytes&&buffer){parts.push(buffer);buffer='';bytes=0}buffer+=ch;bytes+=n;
 }
 if(buffer)parts.push(buffer);return parts;
}
function contextSignature(text){
 let a=2166136261,b=5381;for(let i=0;i<text.length;i++){const n=text.charCodeAt(i);a=Math.imul(a^n,16777619);b=Math.imul(b,33)^n}return [text.length,a>>>0,b>>>0].join('-');
}
function contextFailure(e){return /context|token|too (long|large)|length|truncat|exceed|maximum|限额截断|超长|超出|过长|超时|上限|返回格式|JSON|unexpected end|HTTP (400|413|422)/i.test(e.message)}
async function digestMaterial(text,ai,cache,progress,budget=4800){
 if(contextBytes(text)<=budget)return text;
 let level=text;
 while(contextBytes(level)>budget){
  const chunks=textPieces(level,budget,true),notes=[];
  for(const [i,chunk] of chunks.entries()){
   const key=contextSignature(chunk)+'/'+budget;let note=cache[key];
   if(!note){
    progress('分段整理写作材料 '+(i+1)+' / '+chunks.length);
    try{note=requireText((await flowAI('thesisDigest',ai,{material:chunk})).body,'材料摘要')}
    catch(e){if(!contextFailure(e)||budget<=1400)throw e;note=await digestMaterial(chunk,ai,cache,progress,Math.floor(budget/2))}
    // Prevent a verbose summarizer from creating an ever-growing reduction tree.
    note=textPieces(note,Math.max(350,Math.floor(budget/4)))[0];cache[key]=note;save(false);
   }
   notes.push(note);
  }
  level=notes.join('\n');
 }
 return level;
}
async function writeBoundedPart(ai,payload,cache,progress,depth=0){
 const limit=depth===0?15000:depth===1?8000:4000;
 // Process large fields separately so an extensive template cannot crowd out evidence.
 const compact={...payload};
 const fields=['research','template','outline','previous','feedback','format','authors','preceding','title','degree','length','chapter','section'];
 for(const key of fields){
  if(!compact[key])continue;
  const value=typeof compact[key]==='string'?compact[key]:JSON.stringify(compact[key]);
  const allowance=Math.max(150,Math.floor(limit*({research:.38,template:.10,outline:.08,previous:.09,feedback:.07,format:.05,preceding:.07}[key]||.018)));
  if(contextBytes(JSON.stringify(compact[key]))>allowance){
   const digest=await digestMaterial(value,ai,cache,progress,Math.max(1400,allowance));
   compact[key]=textPieces(digest,allowance-2,true)[0];
  }
 }
 try{return requireText((await flowAI('thesisPart',ai,compact)).body,'章节正文')}
 catch(e){
  if(depth>=2||!contextFailure(e))throw e;
  progress('缩小写作片段并重试');
  const count=payload.targetWords>400?2:1,blocks=[];
  for(let i=0;i<count;i++)blocks.push(await writeBoundedPart(ai,{...payload,targetWords:Math.ceil(payload.targetWords/count),subsection:[payload.subsection,(i+1)+'/'+count].filter(Boolean).join(' · '),preceding:blocks.at(-1)?.slice(-600)||payload.preceding},cache,progress,depth+1));
  return blocks.join('\n\n');
 }
}
