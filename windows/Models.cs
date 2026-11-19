using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Map = System.Collections.Generic.Dictionary<string, object>;

namespace Xiangxi {
    internal sealed partial class Workspace {
        static readonly HttpClient Api = new HttpClient(new HttpClientHandler {AllowAutoRedirect=false}) { Timeout=TimeSpan.FromSeconds(100), MaxResponseContentBufferSize=32*1024*1024 };
        static readonly Dictionary<string,string> Replies = new Dictionary<string,string> {
            {"ask","ai"},{"askProject","projectReply"},{"testProject","testProjectReply"},{"testCalendar","testCalendarReply"},
            {"design","designReply"},{"summary","summaryReply"},{"keywords","keywordsReply"}
        };
        Map rules;
        Map Provider(Map msg) {
            var p=Rows(state,"providers").FirstOrDefault(s=>Str(s,"id")==Str(msg,"provider"));
            if(p==null) throw new InvalidOperationException("请先在模型页保存服务商。");
            return p;
        }
        static Uri Endpoint(Map p) {
            Uri uri;
            if(!Uri.TryCreate(Str(p,"base"),UriKind.Absolute,out uri) || uri.UserInfo.Length!=0 || uri.Query.Length!=0 || uri.Fragment.Length!=0 ||
                !(uri.Scheme=="https" || (uri.Scheme=="http" && (uri.Host=="localhost" || uri.Host=="127.0.0.1" || uri.Host=="[::1]"))))
                throw new InvalidDataException("服务商地址无效。远程接口须使用 HTTPS。");
            return uri;
        }
        string KeyPath(Map p) {
            var identity=Encoding.UTF8.GetBytes(Str(p,"id")+"|"+Endpoint(p).AbsoluteUri);
            using(var hash=SHA256.Create()) return Path.Combine(root,"Credentials",BitConverter.ToString(hash.ComputeHash(identity)).Replace("-","")+".bin");
        }
        void PurgeKeys(Map old, Map next) {
            foreach(var p in Rows(old,"providers").Where(p=>Str(p,"format")!="codexCLI"))
                if(!Rows(next,"providers").Any(n=>Str(n,"id")==Str(p,"id") && Str(n,"base")==Str(p,"base"))) { var file = KeyPath(p); if (File.Exists(file)) File.Delete(file); }
        }
        void EditKey(Map p) {
            var file=KeyPath(p);
            using(var dlg=new Form {Text=Str(p,"name")+" · API 密钥",ClientSize=new Size(480,130),FormBorderStyle=FormBorderStyle.FixedDialog,StartPosition=FormStartPosition.CenterParent,MinimizeBox=false,MaximizeBox=false})
            using(var label=new Label {Left=12,Top=10,Width=455,Height=34,Text="密钥仅供当前 Windows 用户访问。目标地址："+Endpoint(p).AbsoluteUri})
            using(var box=new TextBox {Left=12,Top=47,Width=455,UseSystemPasswordChar=true})
            using(var save=new Button {Left=232,Top=86,Text="保存",DialogResult=DialogResult.OK})
            using(var remove=new Button {Left=312,Top=86,Text="移除",DialogResult=DialogResult.No})
            using(var cancel=new Button {Left=392,Top=86,Text="取消",DialogResult=DialogResult.Cancel}) {
                dlg.Controls.AddRange(new Control[]{label,box,save,remove,cancel}); dlg.AcceptButton=save;dlg.CancelButton=cancel;dlg.ActiveControl=box;
                var result=dlg.ShowDialog(window);
                if(result==DialogResult.No){if(File.Exists(file))File.Delete(file);emit("providerNotice","密钥已移除。");}
                if(result==DialogResult.OK && box.Text.Trim().Length>0) {
                    Atomic(file,ProtectedData.Protect(Encoding.UTF8.GetBytes(box.Text.Trim()),null,DataProtectionScope.CurrentUser));
                    emit("providerNotice","密钥已保存在当前 Windows 账户。");
                }
            }
        }
        async Task<Map> CallApi(Map p,string route,object body,CancellationToken token) {
            var uri=new Uri(Endpoint(p).AbsoluteUri.TrimEnd('/')+"/"+route);
            using(var request=new HttpRequestMessage(body==null?HttpMethod.Get:HttpMethod.Post,uri)) {
                var keyfile=KeyPath(p);
                string key=File.Exists(keyfile)?Encoding.UTF8.GetString(ProtectedData.Unprotect(File.ReadAllBytes(keyfile),null,DataProtectionScope.CurrentUser)):"";
                if(Str(p,"format")=="anthropic") {
                    request.Headers.Add("anthropic-version","2023-06-01");
                    if(key.Length>0) request.Headers.Add("x-api-key",key);
                } else if(key.Length>0) request.Headers.Authorization=new AuthenticationHeaderValue("Bearer",key);
                if(body!=null) request.Content=new StringContent(Json.Serialize(body),Encoding.UTF8,"application/json");
                using(var response=await Api.SendAsync(request,token)) {
                    if(!response.IsSuccessStatusCode) throw new InvalidOperationException(Str(p,"name")+" 返回 HTTP "+(int)response.StatusCode+"，请核对地址、密钥和模型。");
                    return Json.Deserialize<Map>(await response.Content.ReadAsStringAsync());
                }
            }
        }
        async Task Holiday(Map m) {
            int year;
            if(!Int32.TryParse(Convert.ToString(Get(m,"year")),out year)||year<1900||year>2200)return;
            object payload=null;
            try {
                using(var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(10)))
                using(var response=await Api.GetAsync("https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/"+year+".json",timeout.Token)) {
                    if(response.IsSuccessStatusCode){var content=await response.Content.ReadAsStringAsync();if(content.Length<=100000)payload=Json.DeserializeObject(content);}
                }
            } catch(HttpRequestException){} catch(OperationCanceledException){} catch(ArgumentException){}
            emit("holidayYear",new {year,payload});
        }
        async Task Model(Map m,CancellationToken token) {
            var p=Provider(m);var op=Str(m,"op");var format=Str(p,"format");var model=Str(m,"model");
            if(op=="modelList") {
                var models=format=="codexCLI"?CodexModels():Rows(await CallApi(p,"models",null,token),"data").Select(r=>Str(r,"id")).Where(s=>s.Length>0).ToArray();
                if(models.Length==0) throw new InvalidDataException("服务商未返回模型目录，可在编辑服务商时填写模型 ID。");
                emit("modelList",new {id=Str(p,"id"),@base=Str(p,"base"),models});return;
            }
            if(!Items(Get(p,"models")).Contains(model)) throw new InvalidOperationException("请重新选择服务商和模型。");
            if(rules==null) rules=Json.Deserialize<Map>(File.ReadAllText(Path.Combine(Program.Root,"prompts.json")));
            var rule=Str(rules,op=="workflowAI"?"workflow."+Str(m,"kind"):op);
            if(rule.Length==0) throw new InvalidOperationException("此任务缺少对应的 AI 指令。");
            string text;
            if(format=="codexCLI") text=await RunCodex(m,rule,token);
            else {
                string route;
                var body=ModelBody(m,rule,format,out route);
                var result=await CallApi(p,route,body,token);
                text=ModelText(format,result);
                var usage=Get(result,"usage") as Map; object tokens=Get(usage,"total_tokens");
                if(tokens==null && Get(usage,"input_tokens")!=null && Get(usage,"output_tokens")!=null)
                    tokens=Convert.ToInt64(usage["input_tokens"])+Convert.ToInt64(usage["output_tokens"]);
                emit("modelUsage",new {provider=Str(p,"id"),tokens});
            }
            if(Str(m,"requestID").Length!=0) Reply(Str(m,"requestID"),text); else emit(Replies[op],text);
        }
        internal static object ModelBody(Map m,string rule,string format,out string route) {
            string model=Str(m,"model"),input=Str(m,"context"),image=Str(m,"image");
            var uri="data:image/jpeg;base64,"+image;
            var text=new {type="text",text=input}; object user=input;
            switch(format) {
            case "anthropic":
                route="messages";
                if(image.Length>0) user=new object[]{new {type="image",source=new {type="base64",media_type="image/jpeg",data=image}},text};
                return new {model,system=rule,max_tokens=new[]{"tocGraph","researchDiagram"}.Contains(Str(m,"kind"))?6000:2048,messages=new[]{new {role="user",content=user}}};
            case "responses":
                route="responses";
                if(image.Length>0) user=new[]{new {role="user",content=new object[]{new {type="input_text",text=input},new {type="input_image",image_url=uri}}}};
                return new {model,instructions=rule,input=user,store=false};
            case "chat":
                route="chat/completions";
                if(image.Length>0) user=new object[]{text,new {type="image_url",image_url=new {url=uri}}};
                return new {model,messages=new object[]{new {role="system",content=rule},new {role="user",content=user}}};
            default: throw new InvalidDataException("服务商协议无效。");
            }
        }
        internal static string ModelText(string format,Map r) {
            var choice=Rows(r,"choices").FirstOrDefault();
            if(Str(r,"stop_reason")=="max_tokens" || Str(choice,"finish_reason")=="length" || Str(Get(r,"incomplete_details") as Map,"reason")=="max_output_tokens")
                throw new InvalidDataException("模型输出达到长度上限。");
            var text=format=="anthropic"?String.Concat(Rows(r,"content").Where(p=>Str(p,"type")=="text").Select(p=>Str(p,"text"))):
                format=="responses"?String.Concat(Rows(r,"output").Where(i=>Str(i,"type")=="message").SelectMany(i=>Rows(i,"content")).Where(p=>Str(p,"type")=="output_text").Select(p=>Str(p,"text"))):Str(Get(choice,"message") as Map,"content");
            if(String.IsNullOrWhiteSpace(text)) throw new InvalidDataException("模型未返回文本，请核对协议和模型 ID。");
            return text;
        }
        string CodexPath() {
            var config=Path.Combine(root,"codex-path.txt");
            var candidates=new List<string>(); if(File.Exists(config))candidates.Add(File.ReadAllText(config));
            foreach(var dir in (Environment.GetEnvironmentVariable("PATH")??"").Split(Path.PathSeparator))
                if(Path.IsPathRooted(dir.Trim('"'))) candidates.Add(Path.Combine(dir.Trim('"'),"codex.exe"));
            var result=candidates.FirstOrDefault(File.Exists);
            if(result==null)throw new FileNotFoundException("请安装并登录 Windows Codex CLI，在模型页选择「定位 Codex」并选中 codex.exe。");
            return result;
        }
        void ChooseCodex(Map m) {
            using(var dlg=new OpenFileDialog{Title="选择 Windows Codex CLI",Filter="Codex CLI|codex.exe"}) {
                if(dlg.ShowDialog(window)!=DialogResult.OK)return;
                if(!Path.GetFileName(dlg.FileName).Equals("codex.exe",StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("请选择 codex.exe。");
                Atomic(Path.Combine(root,"codex-path.txt"),Encoding.UTF8.GetBytes(dlg.FileName)); emit("codexLocated",Str(m,"provider"));
            }
        }
        string[] CodexModels() {
            CodexPath();
            var home=Environment.GetEnvironmentVariable("CODEX_HOME");
            if(String.IsNullOrEmpty(home))home=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),".codex");
            var file=Path.Combine(home,"models_cache.json");
            return File.Exists(file)?Rows(Json.Deserialize<Map>(File.ReadAllText(file)),"models").Select(r=>Str(r,"slug")).Where(x=>x.Length>0).Concat(new[]{"默认模型"}).Distinct().ToArray():new[]{"默认模型"};
        }
        // Quote for CreateProcess / CommandLineToArgvW. No command shell is used.
        internal static string Quote(string value) {
            var buffer=new StringBuilder("\"");int count=0;
            foreach(char c in value) {
                if(c=='\\'){count++;continue;}
                buffer.Append('\\',c=='"'?count*2+1:count);buffer.Append(c);count=0;
            }
            return buffer.Append('\\',count*2).Append('"').ToString();
        }
        async Task<string> RunCodex(Map m,string rule,CancellationToken token) {
            string exe=CodexPath();
            var dir=Directory.CreateDirectory(Path.Combine(Path.GetTempPath(),"xiangxi-"+Guid.NewGuid())).FullName;
            try {
                var args=new List<string>{"exec","--ephemeral","--ignore-user-config","--ignore-rules","--skip-git-repo-check","--sandbox","read-only",
                    "-c","approval_policy=\"never\"","-c","web_search=\"disabled\"","-c","project_doc_max_bytes=0","-c","developer_instructions="+Json.Serialize(rule)};
                foreach(var feature in "shell_tool unified_exec apps plugins remote_plugin multi_agent computer_use image_generation hooks".Split(' ')){args.Add("--disable");args.Add(feature);}
                if(Str(m,"model")!="默认模型"){args.Add("--model");args.Add(Str(m,"model"));}
                if(Str(m,"image").Length!=0){File.WriteAllBytes(Path.Combine(dir,"image.jpg"),Convert.FromBase64String(Str(m,"image")));args.Add("--image");args.Add("image.jpg");}
                args.AddRange(new[]{"-o","answer.txt","-"});
                var start=new ProcessStartInfo(exe,String.Join(" ",args.Select(Quote))){WorkingDirectory=dir,UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardError=true,RedirectStandardOutput=true};
                using(var child=Process.Start(start))
                using(token.Register(()=>{try{if(!child.HasExited)child.Kill();}catch(InvalidOperationException){}})) {
                    child.BeginErrorReadLine();child.BeginOutputReadLine();
                    var input=new UTF8Encoding(false).GetBytes(Str(m,"context"));
                    await child.StandardInput.BaseStream.WriteAsync(input,0,input.Length,token);
                    child.StandardInput.Close();
                    await Task.Run((Action)child.WaitForExit); token.ThrowIfCancellationRequested();
                    var answer=Path.Combine(dir,"answer.txt");
                    if(child.ExitCode!=0 || !File.Exists(answer))throw new InvalidOperationException("Codex 调用失败。请检查 CLI 版本、登录状态和模型权限。");
                    return File.ReadAllText(answer);
                }
            } finally {Directory.Delete(dir,true);}
        }
    }
}
