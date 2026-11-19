using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Xml;
using Map = System.Collections.Generic.Dictionary<string,object>;

namespace Xiangxi {
    internal sealed partial class Workspace {
        string paperToken;
        CancellationTokenSource paperStop;
        static Map ArticleProvider() {return new Map{{"id","paperaccess.elsevier"},{"base","https://api.elsevier.com"},{"name","Elsevier 全文"}};}
        static HttpClient PaperHttp(PaperRoute route) {
            var handler = new HttpClientHandler { AllowAutoRedirect=false,UseCookies=false,UseProxy=route.Kind!="campus" };
            if(route.Proxy!=null) {
                if(route.Kind!="http")throw new NotSupportedException("此请求需要通过论文访问窗口使用 SOCKS5。");
                handler.Proxy=new WebProxy(route.Proxy);
            }
            return new HttpClient(handler){Timeout=TimeSpan.FromSeconds(35),MaxResponseContentBufferSize=8*1024*1024};
        }
        internal static async Task<string> ArchivePDF(Stream input,string directory,CancellationToken token) {
            Directory.CreateDirectory(directory);
            var name=Guid.NewGuid()+".pdf";
            var dest=Path.Combine(directory,name);
            var stage=dest+".part";
            try {
                using(var output=new FileStream(stage,FileMode.CreateNew,FileAccess.ReadWrite,FileShare.None)) {
                    var buffer=new byte[65536];int n;
                    while((n=await input.ReadAsync(buffer,0,buffer.Length,token))!=0) {
                        if(output.Length+n>128L*1024*1024)throw new InvalidDataException("PDF 超过 128 MB。");
                        await output.WriteAsync(buffer,0,n,token);
                    }
                    await output.FlushAsync(token);
                    output.Position=0;
                    int header=output.Read(buffer,0,5);
                    if(header!=5 || Encoding.ASCII.GetString(buffer,0,5)!="%PDF-")throw new InvalidDataException("响应不是 PDF，可能需要先登录出版社。");
                    output.Position=Math.Max(0,output.Length-8192);
                    int tail=output.Read(buffer,0,8192);
                    if(!Encoding.ASCII.GetString(buffer,0,tail).Contains("%%EOF"))throw new InvalidDataException("PDF 未下载完整。");
                }
                token.ThrowIfCancellationRequested();
                File.Move(stage,dest);return name;
            } finally {if(File.Exists(stage))File.Delete(stage);}
        }
        async Task<Map> ElsevierPDF(Map m,PaperRoute route,CancellationToken token) {
            if(Str(m,"vendor")!="elsevier" || !Regex.IsMatch(Str(m,"doi"),@"^10\.1016/[^\s]+$",RegexOptions.IgnoreCase)
                || route.Gateway.Length!=0 || route.Kind=="socks5" || !Equals(Get(m,"canSave"),true))return null;
            var path=KeyPath(ArticleProvider());
            if(!File.Exists(path))return null;
            using(var http=PaperHttp(route))
            using(var req=new HttpRequestMessage(HttpMethod.Get,"https://api.elsevier.com/content/article/doi/"+String.Join("/",Str(m,"doi").Split('/').Select(Uri.EscapeDataString)))) {
                req.Headers.Add("X-ELS-APIKey",Encoding.UTF8.GetString(ProtectedData.Unprotect(File.ReadAllBytes(path),null,DataProtectionScope.CurrentUser)));
                req.Headers.Add("Accept","application/pdf");
                using(var response=await http.SendAsync(req,HttpCompletionOption.ResponseHeadersRead,token)) {
                    if(!response.IsSuccessStatusCode)return null;
                    using(var stream=await response.Content.ReadAsStreamAsync()) {
                        string file=await ArchivePDF(stream,Path.Combine(root,"References"),token);
                        return new Map{{"file",file},{"downloadSource","Elsevier API"}};
                    }
                }
            }
        }
        async Task PaperAccess(Map m) {
            string job=Str(m,"token");
            if(paperStop!=null)throw new InvalidOperationException("已有论文访问窗口，请先完成当前访问。");
            using(var stop=new CancellationTokenSource()) {
                paperStop=stop;paperToken=job;
                Map result=null;
                try {
                    var route=new PaperRoute(m);
                    using(var ready=CancellationTokenSource.CreateLinkedTokenSource(stop.Token)) {
                        ready.CancelAfter(TimeSpan.FromMinutes(2)); await PaperNetwork.Connect(route.Service,ready.Token);
                    }
                    if(new[]{"paper","batch","sessionPDF"}.Contains(Str(m,"action"))) {
                        try {result=await ElsevierPDF(m,route,stop.Token);}
                        catch(HttpRequestException){}catch(IOException){}catch(InvalidDataException){}catch(TaskCanceledException){stop.Token.ThrowIfCancellationRequested();}
                    }
                    if(result==null)using(var browser=new PaperWindow(m,route,root,emit)) result=await browser.Visit(window,stop.Token);
                } finally {paperStop=null;paperToken=null;}
                result["token"]=job;emit("paperFinished",result);
            }
        }
        internal static string ArticleText(Stream xml) {
            var settings=new XmlReaderSettings{XmlResolver=null,DtdProcessing=DtdProcessing.Ignore,MaxCharactersInDocument=12*1024*1024};
            var document=new XmlDocument{XmlResolver=null};
            using(var reader=XmlReader.Create(xml,settings))document.Load(reader);
            var nodes=document.SelectNodes("/article/body//p | /article/body//title");
            var text=String.Join("\n\n",nodes.Cast<XmlNode>().Select(n=>n.InnerText.Trim()).Where(v=>v.Length!=0));
            if(text.Length==0)throw new InvalidDataException("全文未包含可提取的正文。");
            return text;
        }
        async Task DownloadOpenPaper(Map m) {
            string pmc=Str(m,"pmc");
            if(!Regex.IsMatch(pmc,@"^PMC[0-9]+$"))throw new InvalidDataException("缺少开放全文标识。");
            using(var http=PaperHttp(new PaperRoute(new Map())))
            using(var resp=await http.GetAsync("https://www.ebi.ac.uk/europepmc/webservices/rest/"+pmc+"/fullTextXML")) {
                resp.EnsureSuccessStatusCode();
                string text;
                using(var xml=await resp.Content.ReadAsStreamAsync())text=ArticleText(xml);
                var name=Guid.NewGuid()+".txt";Atomic(Attachment("References",name),Encoding.UTF8.GetBytes(text));
                m["file"]=name;m["note"]=text.Substring(0,Math.Min(12000,text.Length));emit("paperDownloaded",m);
            }
        }
        async Task Catalog(Map m) {
            var query=Str(m,"query").Trim(); if(query.Length==0)throw new InvalidDataException("请输入检索词。");
            var route=new PaperRoute(m);
            if(route.Gateway.Length!=0)throw new InvalidOperationException("学校门户需要交互式登录，请使用提供商检索窗口。");
            var journal=Str(m,"journal");
            bool batch=Str(m,"op")=="batchCatalog";bool onlyPMC=batch && Str(m,"vendor")=="pmc";
            int count;Int32.TryParse(Convert.ToString(Get(m,"count")),out count);
            var limit=batch?Math.Min(100,Math.Max(35,count*6)):7;
            var rows=new List<Map>();var failed=new List<string>();
            using(var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(110))) {
                await PaperNetwork.Connect(route.Service,timeout.Token);
                foreach(string source in onlyPMC?new[]{"Europe PMC"}:new[]{"Crossref","Europe PMC"}) {
                    bool cross=source=="Crossref";
                    string url;
                    if(cross) {
                        url="https://api.crossref.org/works?rows="+limit+"&query.bibliographic="+Uri.EscapeDataString(query);
                        if(journal.Length!=0)url+="&query.container-title="+Uri.EscapeDataString(journal);
                        var filters=Items(Get(m,"prefixes")).OfType<string>().Where(v=>Regex.IsMatch(v,@"^10\.\d{4,9}$")).Select(v=>"prefix:"+v);
                        if(batch)url+="&filter="+Uri.EscapeDataString(String.Join(",",new[]{"type:journal-article"}.Concat(filters)));
                    } else {
                        var terms="("+query+")"+(journal.Length==0?"":" AND JOURNAL:\""+journal.Replace('"',' ')+"\"")+(batch?" AND OPEN_ACCESS:Y AND HAS_PDF:Y":"");
                        url="https://www.ebi.ac.uk/europepmc/webservices/rest/search?format=json&resultType=core&pageSize="+limit+"&query="+Uri.EscapeDataString(terms);
                    }
                    try {
                        string json;
                        if(route.Kind=="socks5") {
                            var curl=Path.Combine(Environment.SystemDirectory,"curl.exe");
                            json=await PaperNetwork.ReadProcess(curl,"-q --silent --show-error --fail --max-time 30 --max-filesize 8388608 --proxy "+
                                Quote(route.Proxy.Replace("socks5://","socks5h://"))+" "+Quote(url),timeout.Token);
                        } else using(var http=PaperHttp(route)) using(var resp=await http.GetAsync(url,timeout.Token)) {
                            resp.EnsureSuccessStatusCode();json=await resp.Content.ReadAsStringAsync();
                        }
                        var response=Json.Deserialize<Map>(json);
                        var list=Get(response,cross?"message":"resultList") as Map;
                        if(Get(list,cross?"items":"result")==null)throw new InvalidDataException();
                        rows.AddRange(Rows(list,cross?"items":"result").Select(r=>CatalogRow(r,cross)).Where(r=>Str(r,"title").Length>0));
                    } catch(OperationCanceledException){if(timeout.IsCancellationRequested)throw;failed.Add(source);}
                    catch(Exception){failed.Add(source);}
                }
            }
            using(var check=new CancellationTokenSource(TimeSpan.FromSeconds(15)))await PaperNetwork.EnsureConnected(route.Service,check.Token);
            if(batch)Reply(Str(m,"requestID"),new {rows,failed,api=File.Exists(KeyPath(ArticleProvider()))});
            else {m["rows"]=rows;m["failed"]=failed;emit("searchResults",m);}
        }
        internal static Map CatalogRow(Map r,bool cross) {
            string doi=Str(r,cross?"DOI":"doi");
            var title=cross?Items(Get(r,"title")).OfType<string>().FirstOrDefault():Str(r,"title");
            var journal=cross?Items(Get(r,"container-title")).OfType<string>().FirstOrDefault():Str(r,"journalTitle");
            var journalInfo=Get(r,"journalInfo") as Map;
            if(String.IsNullOrEmpty(journal))journal=Str(Get(journalInfo,"journal") as Map,"title");
            var alerts=new[]{"published erratum","correction","retraction","retraction of publication","retracted publication","expression of concern","withdrawal","editorial"};
            var types=Items(Get(Get(r,"pubTypeList") as Map,"pubType")).OfType<string>().Concat(Rows(r,"update-to").Select(v=>Str(v,"type")));
            bool notice=Str(r,"isRetracted")=="Y" || types.Any(t=>alerts.Contains(t,StringComparer.OrdinalIgnoreCase));
            bool openLicense=Rows(r,"license").Any(l=>{
                Uri u;
                return Uri.TryCreate(Str(l,"URL"),UriKind.Absolute,out u) && u.Host=="creativecommons.org"
                    && (u.AbsolutePath.StartsWith("/licenses/") || u.AbsolutePath.StartsWith("/publicdomain/")) && Str(l,"content-version")!="am";
            });
            string pdf="",year=Str(r,"pubYear"),pmc=Str(r,"pmcid");
            var links=cross?Rows(r,"link"):Rows(Get(r,"fullTextUrlList") as Map,"fullTextUrl");
            foreach(var link in links)if(Str(link,cross?"content-type":"documentStyle").IndexOf("pdf",StringComparison.OrdinalIgnoreCase)>=0) {
                if(cross ? !openLicense || Str(link,"intended-application")=="text-mining" : !Str(link,"availability").Equals("open access",StringComparison.OrdinalIgnoreCase))continue;
                var raw=Str(link,cross?"URL":"url"); if(raw.StartsWith("https://")){pdf=raw;break;}
            }
            if(cross){var date=Get(r,"published") as Map ?? Get(r,"issued") as Map;year=Convert.ToString(Items(Items(Get(date,"date-parts")).FirstOrDefault()).FirstOrDefault());}
            var authors=cross?String.Join(", ",Rows(r,"author").Select(a=>(Str(a,"given")+" "+Str(a,"family")).Trim())):Str(r,"authorString");
            string note=WebUtility.HtmlDecode(Regex.Replace(Str(r,cross?"abstract":"abstractText"),"<[^>]*>"," "));
            return new Map{{"title",title??""},{"doi",doi},{"journal",journal??""},{"authors",authors},{"year",year},{"pmc",pmc},{"pdfURL",pdf},
                {"notice",notice?"yes":""},{"source",cross?"Crossref":"Europe PMC"},{"articleURL",doi.Length>0?"https://doi.org/"+doi:pmc.Length>0?"https://europepmc.org/articles/"+pmc:""},
                {"note",note.Substring(0,Math.Min(5000,note.Length))},{"volume",Str(cross?r:journalInfo,"volume")},{"issue",Str(cross?r:journalInfo,"issue")},{"pages",Str(r,cross?"page":"pageInfo")}};
        }
    }
}
