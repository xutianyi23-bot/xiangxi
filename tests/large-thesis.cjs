const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const web=path.join(__dirname,'..','web');
const element={addEventListener(){},querySelector(){return {scrollTop:0}},style:{},innerHTML:''};
const context=vm.createContext({assert,console,crypto,TextEncoder,queueMicrotask,setTimeout,clearTimeout,setInterval(){},document:{querySelector:()=>element},window:{addEventListener(){},webkit:{messageHandlers:{workspace:{postMessage(){}}}}}});
for(const [,file] of fs.readFileSync(path.join(web,'index.html'),'utf8').matchAll(/<script src="([^"]+)"/g)){
 vm.runInContext(fs.readFileSync(path.join(web,file),'utf8'),context,{filename:file});
}
vm.runInContext(`(async()=>{
 window.receiveNative('load',seed());
 const p=proj(),s=p.systems[0],other=p.systems[1];
 p.researchBackground=Array.from({length:3200},(_,i)=>'实测材料'+i+'号◇🧪').join('\\n');
 db.providers=[{id:'fake',name:'test',models:['test']}];db.aiChoices.thesis={provider:'fake',model:'test'};
 const t=p.thesis={title:'验收论文',degree:'硕士',selection:[s.id,other.id],chapterPlan:[
  {system:s.id,title:'第一体系',sections:[{title:'原理',words:8000}]},
  {system:other.id,title:'第二体系',sections:[{title:'讨论',words:3200}]}],
  template:'学院排版要求。'.repeat(3400),format:'格式要求'.repeat(1500)};
 let stop=true,probedLimit=false,oversize=0,digests=0,blocks=0;
 flowAI=async(kind,ai,data)=>{
  if(kind==='thesisDigest'){digests++;assert.ok(contextBytes(JSON.stringify(data))<8200);return {body:'材料包含独立样品记录及序号，写作时按原研究范围使用。'}}
  assert.equal(kind,'thesisPart');
  assert.ok(contextBytes(JSON.stringify(data))<15000);
  if(data.part===1&&!data.subsection&&!probedLimit){probedLimit=true;oversize++;throw Error('context length exceeded')}
  if(stop&&data.part===2){stop=false;throw Error('service unavailable')}
  blocks++;return {body:'第'+data.part+'段'+(data.subsection||'')+'：'+('研'.repeat(data.targetWords))};
 };
 await makeThesis(p);
 assert.ok(t.pending);assert.equal(t.pending.blocks[0].length,1);
 assert.ok(t.pending.blocks[0][0].includes('1/2')&&t.pending.blocks[0][0].includes('2/2'));
 const first=t.pending.blocks[0][0],calls=digests;
 await makeThesis(p);
 assert.equal(t.pending,undefined);assert.equal(t.chapters.length,2);assert.equal(t.chapters[0].sections.length,1);
 assert.ok(t.chapters[0].body.includes(first));assert.equal((t.chapters.map(x=>x.body).join('').match(/研/g)||[]).length,11200);
 assert.ok(digests>10&&oversize===1&&blocks===8);assert.ok(digests-calls<12);
 console.log('长论文分段、上下文缩减、超限重试、中断续写和合并通过。',digests,'次材料整理，',blocks,'个写作片段。');
})()`,context).catch(error=>{console.error(error);process.exitCode=1});
