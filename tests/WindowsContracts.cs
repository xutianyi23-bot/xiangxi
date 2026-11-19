using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using Xiangxi;
using Map = System.Collections.Generic.Dictionary<string,object>;

class WindowsContracts {
    static void Check(bool ok, string message) { if (!ok) throw new Exception(message); }
    public sealed class Notice : EventArgs {}
    public sealed class EventSource {
        public event EventHandler<Notice> Notified;
        public bool Received;
        public void Raise() { Notified(this, new Notice()); }
        public void Receive(object sender, EventArgs e) { Received = true; }
    }
    static void PaperContracts(string temp) {
        var direct=new PaperRoute(new Map{{"proxyKind","campus"}});
        Check(direct.BrowserArguments=="--no-proxy-server","campus direct");
        var proxy=new PaperRoute(new Map{{"proxyKind","socks5"},{"host","127.0.0.1"},{"port","7890"}});
        Check(proxy.BrowserArguments=="--proxy-server=socks5://127.0.0.1:7890","browser proxy");
        var target=new Uri("https://publisher.example/article?x=1&y=2");
        var portal=new PaperRoute(new Map{{"gateway","https://school.example/open?url={url}"}});
        Check(portal.Through(target).Query=="?url="+Uri.EscapeDataString(target.AbsoluteUri),"encoded portal target");
        try { new PaperRoute(new Map{{"proxyKind","http"},{"host","127.0.0.1 --another-flag"},{"port","7890"}});throw new Exception("invalid proxy accepted"); }
        catch(InvalidDataException) {}
        Check(PaperWindow.ProviderHost("cnki","kns.cnki.net","") && !PaperWindow.ProviderHost("cnki","cnki.net.example.com",""),"provider origin");
        var record=Workspace.CatalogRow(Workspace.Json.Deserialize<Map>("{\"title\":[\"Title\"],\"container-title\":[\"Journal\"],\"published\":{\"date-parts\":[[2023,5]]},\"DOI\":\"10.1016/example\"}"),true);
        Check(Workspace.Str(record,"year")=="2023" && Workspace.Str(record,"journal")=="Journal","Crossref metadata");
        var pmc=Workspace.CatalogRow(new Map{{"title","Open paper"},{"pmcid","PMC123"},{"journalTitle","Journal"}},false);
        Check(Workspace.Str(pmc,"articleURL")=="https://europepmc.org/articles/PMC123","PMC target");
        using(var article=new MemoryStream(System.Text.Encoding.UTF8.GetBytes("<article><body><p>Test <b>paper</b></p></body></article>")))
            Check(Workspace.ArticleText(article)=="Test paper","Europe PMC article body");
        var dir=Path.Combine(temp,"pdf-test");
        var data=System.Text.Encoding.ASCII.GetBytes("%PDF-1.7\nfixture\n%%EOF");
        string saved;
        using(var stream=new MemoryStream(data))saved=Workspace.ArchivePDF(stream,dir,System.Threading.CancellationToken.None).GetAwaiter().GetResult();
        Check(File.ReadAllBytes(Path.Combine(dir,saved)).SequenceEqual(data),"archive intact PDF");
        foreach(var bad in new[]{"<html>login</html>","%PDF-1.7 partial"}) {
            using(var stream=new MemoryStream(System.Text.Encoding.ASCII.GetBytes(bad)))
                try {Workspace.ArchivePDF(stream,dir,System.Threading.CancellationToken.None).GetAwaiter().GetResult();throw new Exception("invalid PDF accepted");}
                catch(InvalidDataException){}
        }
        Check(Directory.GetFiles(dir).Length==1,"remove incomplete downloads");
        Console.WriteLine("Windows paper contracts passed: VPN/proxy routes, portal, publisher origins, catalogs and PDF archive.");
    }
    static void Main() {
        var source = new EventSource();
        WorkspaceWindow.Hook(source, "Notified", source, "Receive");
        source.Raise();
        Check(source.Received, "WebView2 event handler binding");
        var temp=Directory.CreateDirectory(Path.Combine(Path.GetTempPath(),"xiangxi-contract-"+Guid.NewGuid())).FullName;
        try {
            PaperContracts(temp);
            string last="";object data=null;
            var host=new Workspace(null,temp,(e,v)=>{last=e;data=v;});
            Action<object> send=message=>host.Handle(Workspace.Json.Serialize(message)).GetAwaiter().GetResult();
            send(new {op="load"});Check(last=="load" && data==null,"clean start");
            var name=Guid.NewGuid()+".jpg";
            var src=Directory.CreateDirectory(Path.Combine(temp,"Reagents")).FullName;
            File.WriteAllText(Path.Combine(src,name),"fixture");
            var state=new {version=5,current="p",projects=new[]{new{id="p",systems=new[]{new{reagentImports=new[]{new{file=name}}}}}},tasks=new object[0],personal=new object[0]};
            send(new {op="save",state});Check(last=="saved","save: "+last+" "+data);
            send(new {op="load"});Check(Workspace.Str((Map)data,"current")=="p","reopen");
            var folder=Directory.CreateDirectory(Path.Combine(temp,"Credentials")).FullName;
            File.WriteAllText(Path.Combine(folder,"dummy.bin"),"fixture");
            using(var backup=ZipFile.OpenRead(host.WriteBackup(temp,(Map)data))) {
                Check(backup.Entries.Select(e=>e.FullName).OrderBy(s=>s).SequenceEqual(new[]{"Reagents/"+name,"workspace.json"}.OrderBy(s=>s)),"backup allowlist");
            }
            send(new {op="save",state,removedReagentFiles=new[]{name}});Check(File.Exists(Path.Combine(src,name)),"retain shared attachment");
            send(new {op="save",state=new {version=5,current="",projects=new object[0],tasks=new object[0],personal=new object[0]},deletedProject="p"});
            Check(last=="saved" && !File.Exists(Path.Combine(src,name)),"delete obsolete attachment");
            send(new {op="readAttachment",requestID="request",file="../Credentials/dummy.bin"});
            Check(last=="batchRPC" && Workspace.Json.Serialize(data).Contains("error"),"invalid attachment must reject RPC");
            send(new {op="workflowAI",requestID="missing",provider="none"});Check(last=="batchRPC" && Workspace.Json.Serialize(data).Contains("missing"),"AI failure must settle RPC");
            var m=new Map{{"model","demo"},{"context","材料"},{"image","eA=="}};
            foreach(string format in new[]{"responses","chat","anthropic"}) {
                string route;
                var body=Workspace.Json.Serialize(Workspace.ModelBody(m,"test rule",format,out route));
                Check(body.Contains("eA==") && body.Contains("test rule") && body.Contains("demo"),"model payload "+format);
            }
            string answer=Workspace.ModelText("responses",Workspace.Json.Deserialize<Map>("{\"output\":[{\"type\":\"message\",\"content\":[{\"type\":\"output_text\",\"text\":\"ok\"}]}]}"));
            Check(answer=="ok","responses text");
            File.WriteAllText(Path.Combine(temp,"workspace.json"),"broken");
            send(new {op="load"});Check(last=="loadError","surface damaged state");
            Console.WriteLine("Windows contracts passed: first launch, persistence, backup, deletion, RPC, model formats, damaged state.");
        } finally { Directory.Delete(temp,true); }
    }
}
