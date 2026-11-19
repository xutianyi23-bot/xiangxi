const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const web=path.join(__dirname,'..','web');
const events={},messages=[];
const app={addEventListener(type,f){(events[type]??=[]).push(f)},querySelector:()=>({scrollTop:0}),style:{},innerHTML:''};
const dialog={...app,addEventListener(){}};
const context=vm.createContext({assert,messages,crypto,TextEncoder,URL,console,AbortController,setTimeout,clearTimeout,setInterval(){},
 document:{querySelector:key=>key==='#editor'?dialog:app},window:{addEventListener(){},webkit:{messageHandlers:{workspace:{postMessage:m=>messages.push(m)}}}}});
for(const [,file] of fs.readFileSync(path.join(web,'index.html'),'utf8').matchAll(/<script src="([^"]+)"/g))vm.runInContext(fs.readFileSync(path.join(web,file),'utf8'),context,{filename:file});
const run=code=>vm.runInContext(code,context);
run("window.receiveNative('load',seed())");
const click=(a,id)=>events.click.forEach(listener=>listener({target:{closest:()=>({dataset:{a,id}})}}));
for(const id of ['projects','tools','settings']){
 click('toggleGroup',id);assert.match(app.innerHTML,new RegExp('id="group-'+id+'" class="groupRows" hidden'));
 click('toggleGroup',id);assert.ok(!app.innerHTML.includes('id="group-'+id+'" class="groupRows" hidden'));
}
click('nav','toc');assert.match(app.innerHTML,/新建 TOC 图/);assert.match(app.innerHTML,/全局操作，你可以让我做任何事/);
const fixture={title:'A & B',caption:'Caption <1>',nodes:[{id:'A',shape:'ellipse',label:'起点',x:10,y:30,w:60,h:40,fill:'#ffcc00'},{id:'B',shape:'hexagon',label:'<终点>',x:300,y:60,w:70,h:60,fill:'#ccffaa'}],edges:[{from:'A',to:'B',label:'A & B',arrow:true}]};
context.fixture=fixture;
const [xml,svg]=run('var graph=normalizeTOC(fixture);[tocDrawio(graph),tocSVG(graph)]');
execFileSync('python3',['-c',`import json,sys,xml.etree.ElementTree as E
x,s=map(E.fromstring,json.load(sys.stdin))
cells=x.findall('.//mxCell')
vertices={c.get('id') for c in cells if c.get('vertex')=='1'}
assert len(vertices)==2 and any(c.get('value')=='<终点>' for c in cells)
assert any(c.get('source') in vertices and c.get('target') in vertices for c in cells if c.get('edge')=='1')
assert s.tag.endswith('svg') and s.find('{*}desc').text=='Caption <1>'`],{input:JSON.stringify([xml,svg])});
run("assert.throws(()=>normalizeTOC({...fixture,edges:[{from:'A',to:'C'}]}));assert.throws(()=>normalizeTOC({...fixture,nodes:[{...fixture.nodes[0],x:960}]}))");
const check=fs.readFileSync(path.join(web,'provider-session.js'),'utf8');
function session(mode,body,labels){
 const o={accessMode:mode,document:{body:{innerText:body},querySelectorAll:()=>labels.map(s=>({innerText:s,getClientRects:()=>[1]}))}};
 return vm.runInNewContext(check,o);
}
assert.equal(session('account','',['Log out']),'in');
assert.equal(session('account','',['Sign in']),'out');
assert.equal(session('account','',['Browse']),'unknown');
assert.equal(session('ip','Access provided by UCAS',['Sign in']),'in');
assert.equal(session('ip','Access provided by your institution',[]),'unknown');
assert.equal(session('sso','',['Sign in']),'unknown');
assert.equal(session('sso','No institutional access detected',[]),'out');
run("view='publishers';accessClick('pubVerify','elsevier');assert.equal(paperJob.action,'verify');assert.equal(publisherSessionLabel(publishers()[0]),'核验中…');accessEvent('paperFinished',{token:paperJob.token,state:'in'});assert.equal(publisherSessionLabel(publishers()[0]),'已登录');accessClick('pubVerify','elsevier');accessEvent('paperFinished',{token:paperJob.token,message:'offline'});assert.equal(publisherSessionLabel(publishers()[0]),'登录状态待核验')");
(async()=>{
 run("db.providers=[{id:'mock',name:'Model',models:['m']}];db.aiChoices.toc={provider:'mock',model:'m'};var commitToc;form=(title,body,commit)=>{assert.ok(body.includes('请选择具有生图能力、识图能力的模型'));commitToc=commit};flowAI=async(kind,ai,payload)=>{assert.equal(kind,'tocGraph');assert.equal(ai.model,'m');return fixture};tocForm();commitToc({message:'a finding'})");
 while(run("flowJobs.size"))await new Promise(r=>setTimeout(r,1));
 run("assert.equal(db.tocFigures.length,1);tocForm(activeTOC);commitToc({message:'a finding',feedback:'Revise title'});");
 while(run("flowJobs.size"))await new Promise(r=>setTimeout(r,1));
 run("assert.equal(db.tocFigures.length,2);assert.equal(db.tocFigures[1].version,2);form=(title,body,commit)=>{commitToc=commit};editTOC(activeTOC);commitToc({node:'n0',label:'revised',fill:'#FFFFFF',x:'20',y:'30',w:'50',h:'60'});assert.equal(db.tocFigures[1].nodes[0].label,'revised');assert.equal(db.tocFigures[0].nodes[0].label,'起点')");
 console.log('三栏折叠、TOC 生成和修订、编辑图元、draw.io/SVG XML及登录核验状态通过。');
})().catch(e=>{console.error(e);process.exitCode=1});
