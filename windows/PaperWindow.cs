using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Map = System.Collections.Generic.Dictionary<string,object>;

namespace Xiangxi {
    internal sealed class PaperWindow : Form {
        readonly PaperRoute route;
        readonly string root, action, vendor, mode, title, profile;
        readonly Uri target, login, catalog;
        readonly bool canSave;
        readonly ToolStrip tools = new ToolStrip();
        readonly ToolStripLabel hint = new ToolStripLabel();
        readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer {Interval=1100};
        readonly TaskCompletionSource<Map> done = new TaskCompletionSource<Map>(TaskCreationOptions.RunContinuationsAsynchronously);
        readonly CancellationTokenSource life = new CancellationTokenSource();
        readonly List<Form> popups = new List<Form>();
        readonly Dictionary<Form,object> views = new Dictionary<Form,object>();
        readonly HashSet<string> tried = new HashSet<string>();
        readonly Dictionary<object,string> downloads = new Dictionary<object,string>();
        readonly Action<string,object> emit;
        DateTime deadline, nextVpnCheck;
        bool inspecting, saving, attemptedIP, ready;
        string previousState="", publishedState="";
        readonly string sessionScript, pageScript;
        string Value(Map m,string k){return Workspace.Str(m,k);}
        internal PaperWindow(Map m,PaperRoute route,string root,Action<string,object> emit=null) {
            this.route=route;this.root=root;this.emit=emit;
            action=Value(m,"action");vendor=Value(m,"vendor");mode=Value(m,"mode");title=Value(m,"title");
            canSave=Equals(Workspace.Get(m,"canSave"),true);
            var requested=PaperRoute.Https(Value(m,"target"));
            if(action=="batch") {
                var pmc=Value(m,"pmc");
                if(Regex.IsMatch(pmc,@"^PMC[0-9]+$"))requested=PaperRoute.Https("https://europepmc.org/articles/"+pmc+"?pdf=render");
                else if(Value(m,"pdf").Length>0)requested=PaperRoute.Https(Value(m,"pdf"));
            }
            target=requested;login=PaperRoute.Https(Value(m,"login").Replace("{url}",Uri.EscapeDataString(target.AbsoluteUri)));
            if(action=="sessionPDF" && vendor=="cnki" && Value(m,"catalogURL").Length!=0)catalog=PaperRoute.Https(Value(m,"catalogURL"));
            // WebView2 accepts one set of process arguments per user data folder.
            string identity=Value(m,"profile")+"\n"+route.BrowserArguments+"\n"+route.Gateway+"\n"+route.Service;
            using(var hash=SHA256.Create())profile=Path.Combine(root,"PaperBrowsers",BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(identity))).Replace("-",""));
            sessionScript=File.ReadAllText(Path.Combine(Program.Root,"provider-session.js"));
            pageScript=File.ReadAllText(Path.Combine(Program.Root,"provider-page.js"));
            Text="相析 · "+Value(m,"name");ClientSize=new Size(1050,720);StartPosition=FormStartPosition.CenterParent;
            tools.Items.Add("返回",null,(s,e)=>{dynamic c=Current;if(c!=null && c.CanGoBack)c.GoBack();});
            tools.Items.Add("登录入口",null,(s,e)=>Navigate(login));
            tools.Items.Add("前往目标",null,(s,e)=>Navigate(catalog??target));
            if(canSave)tools.Items.Add("导入已下载的 PDF",null,async(s,e)=>await PickPDF());
            tools.Items.Add(hint);Controls.Add(tools);
            timer.Tick+=Inspect;Shown+=Start;
            FormClosed+=(s,e)=>Finish(new Map{{"message","论文访问窗口已关闭。"},{"paused","yes"}});
        }
        dynamic Current { get {
            object c;
            for(int i=popups.Count-1;i>=0;i--)if(views.TryGetValue(popups[i],out c))return c;
            return views.TryGetValue(this,out c)?c:null;
        }}
        bool Session {get{return action=="sessionCatalog"||action=="sessionPDF";}}
        internal async Task<Map> Visit(Form owner,CancellationToken token) {
            token.ThrowIfCancellationRequested();Show(owner);
            using(token.Register(()=>{if(!IsDisposed && IsHandleCreated)BeginInvoke(new Action(()=>Finish(new Map{{"paused","yes"},{"message","任务已停止。"}})));}))return await done.Task;
        }
        void Finish(Map result) {
            if(!done.TrySetResult(result))return;
            timer.Stop();life.Cancel();
            foreach(var entry in downloads.Keys.ToArray()){try{((dynamic)entry).Cancel();}catch(System.Runtime.InteropServices.COMException){}}
            foreach(var popup in popups.ToArray())popup.Close();
            if(!IsDisposed && Visible)Close();
        }
        void Error(Exception ex) {if(!done.Task.IsCompleted)Finish(new Map{{"message",ex.GetBaseException().Message}});}
        async void Start(object sender,EventArgs args) {
            try {
                await AddView(this);if(done.Task.IsCompleted)return;
                ready=true;deadline=DateTime.UtcNow.AddSeconds(action=="verify"?20:75);
                Navigate(action=="login"?login:catalog??target);
                hint.Text=route.Gateway.Length>0 && !route.Gateway.Contains("{url}")?"请在学校门户内选择数据库。":"请在此窗口完成机构认证或打开论文。";
                timer.Start();
            } catch(Exception ex){Error(ex);}
        }
        void Navigate(Uri url) {
            if(!ready)return;
            ((dynamic)views[this]).Navigate(route.Through(url).AbsoluteUri);
            foreach(var popup in popups.ToArray())popup.Close();
        }
        async Task<object> AddView(Form form) {
            var type=WebViewBindings.BrowserType;
            dynamic browser=Activator.CreateInstance(type);
            dynamic options=Activator.CreateInstance(type.GetProperty("CreationProperties").PropertyType);
            options.UserDataFolder=profile;
            if(route.BrowserArguments.Length>0)options.AdditionalBrowserArguments=route.BrowserArguments;
            browser.CreationProperties=options;
            var control=(Control)browser;control.Dock=DockStyle.Fill;form.Controls.Add(control);control.SendToBack();
            await (Task)browser.EnsureCoreWebView2Async(null);
            if(form.IsDisposed||done.Task.IsCompleted)throw new OperationCanceledException();
            object core=browser.CoreWebView2;
            dynamic c=core;c.Settings.AreHostObjectsAllowed=false;c.Settings.IsWebMessageEnabled=false;
            WorkspaceWindow.Hook(core,"NavigationStarting",this,"Navigation");
            WorkspaceWindow.Hook(core,"NewWindowRequested",this,"Popup");
            WorkspaceWindow.Hook(core,"DownloadStarting",this,"Download");
            WorkspaceWindow.Hook(core,"WebResourceResponseReceived",this,"Response");
            WorkspaceWindow.Hook(core,"WindowCloseRequested",this,"WindowClose");
            views[form]=core;return core;
        }
        public void Navigation(object sender,EventArgs args) {
            dynamic e=args;string url=e.Uri;Uri u;
            if(url!="about:blank" && (!Uri.TryCreate(url,UriKind.Absolute,out u)||u.Scheme!="https"||u.UserInfo.Length!=0))e.Cancel=true;
        }
        public void WindowClose(object sender,object args) {
            var pair=views.FirstOrDefault(kv=>ReferenceEquals(kv.Value,sender));
            if(pair.Key!=null)pair.Key.BeginInvoke(new Action(pair.Key.Close));
        }
        public async void Popup(object sender,EventArgs args) {
            dynamic e=args;dynamic deferral=e.GetDeferral();e.Handled=true;
            Form popup=null;
            try {
                popup=new Form {Text=Text+" · 认证或论文页面",ClientSize=new Size(970,680),StartPosition=FormStartPosition.CenterParent};
                popups.Add(popup);popup.FormClosed+=(s,v)=>{popups.Remove(popup);views.Remove(popup);};
                popup.Show(this);
                object core=await AddView(popup);e.NewWindow=(dynamic)core;
            } catch(Exception ex){if(popup!=null && !popup.IsDisposed)popup.Close();hint.Text=ex.GetBaseException().Message;}
            finally{deferral.Complete();}
        }
        static bool Subdomain(string host,string suffix){return host.Equals(suffix,StringComparison.OrdinalIgnoreCase)||host.EndsWith("."+suffix,StringComparison.OrdinalIgnoreCase);}
        internal static bool ProviderHost(string vendor,string host,string fallback) {
            string[] domains;
            switch(vendor) {
            case "cnki": domains=new[]{"cnki.net","cnki.com.cn"};break;
            case "elsevier": domains=new[]{"sciencedirect.com","elsevier.com"};break;
            case "acs": domains=new[]{"acs.org"};break;
            case "springer": domains=new[]{"springer.com","springernature.com"};break;
            case "wiley": domains=new[]{"wiley.com"};break;
            default:return String.Equals(host,fallback,StringComparison.OrdinalIgnoreCase);
            }
            return domains.Any(d=>Subdomain(host,d));
        }
        async void Inspect(object sender,EventArgs args) {
            if(inspecting||saving||done.Task.IsCompleted)return;
            inspecting=true;
            try {
                if(route.Service.Length!=0 && DateTime.UtcNow>=nextVpnCheck) {
                    nextVpnCheck=DateTime.UtcNow.AddSeconds(12);
                    try {await PaperNetwork.EnsureConnected(route.Service,life.Token);}catch(Exception ex){Error(ex);return;}
                }
                dynamic c=Current;
                if(c==null)return;
                Uri u;if(!Uri.TryCreate((string)c.Source,UriKind.Absolute,out u))return;
                bool provider=ProviderHost(vendor,u.Host,target.Host);
                if((action=="verify" || Session || action=="batch") && DateTime.UtcNow>deadline) {
                    Finish(new Map{{"state","unknown"},{"message",action=="verify"?"网页未显示明确登录状态。":"未取得可用结果或 PDF。请核对登录状态、全文权限与网络。"}});return;
                }
                if(provider && (action=="verify"||action=="login")) {
                    string probe="(function(accessMode){return (\n"+sessionScript+"\n);})("+Workspace.Json.Serialize(mode)+")";
                    string result=await (Task<string>)c.ExecuteScriptAsync(probe);
                    if(done.Task.IsCompleted||c.Source!=u.AbsoluteUri)return;
                    string state=Workspace.Json.DeserializeObject(result) as string;
                    if((state=="in"||state=="out") && state==previousState) {
                        if(action=="verify"){Finish(new Map{{"state",state},{"message",state=="in"?"已登录":"未登录"}});return;}
                        if(emit!=null && state!=publishedState){publishedState=state;emit("publisherSession",new {vendor,state});}
                    }
                    previousState=state;
                }
                bool ipLogin=action=="login" && vendor=="cnki" && mode=="ip" && !attemptedIP;
                if(!Session && !ipLogin)return;
                if(!provider){deadline=DateTime.UtcNow.AddSeconds(75);hint.Text="请完成机构登录，再返回论文页面。";return;}
                var which=ipLogin?"ipLogin":catalog!=null && u.GetLeftPart(UriPartial.Path)==catalog.GetLeftPart(UriPartial.Path)?"selectArticle":action;
                var arguments=new object[]{vendor,which,mode,!attemptedIP,new {title,url=target.AbsoluteUri}};
                string code="(\n"+pageScript+"\n).apply(null,"+Workspace.Json.Serialize(arguments)+")";
                string raw=await (Task<string>)c.ExecuteScriptAsync(code);
                if(done.Task.IsCompleted)return;
                var data=Workspace.Json.DeserializeObject(raw) as Map;
                switch(Workspace.Str(data,"state")) {
                case "rows":Finish(new Map{{"rowsJSON",Workspace.Json.Serialize(Workspace.Get(data,"rows"))}});break;
                case "empty":Finish(new Map{{"rowsJSON","[]"}});break;
                case "limited":Finish(new Map{{"limited","yes"},{"message","平台提示访问过于频繁，本轮已暂停。"}});break;
                case "unavailable":Finish(new Map{{"message","未取得该篇论文的全文权限。"}});break;
                case "ipClicked":attemptedIP=true;hint.Text="请核对页面显示的机构名称。";break;
                case "login":case "verify":deadline=DateTime.UtcNow.AddSeconds(75);hint.Text="请在窗口中完成登录或网站验证。";break;
                case "pdf":var pdf=PaperRoute.Https(Workspace.Str(data,"url"));if(tried.Add(pdf.AbsoluteUri))c.Navigate(pdf.AbsoluteUri);break;
                }
            } catch(Exception ex){if(!done.Task.IsCompleted)hint.Text=ex.GetBaseException().Message;}
            finally{inspecting=false;}
        }
        async Task PickPDF() {
            if(saving)return;
            try {using(var dlg=new OpenFileDialog{Title="选择本文 PDF",Filter="PDF|*.pdf"}) {
                if(dlg.ShowDialog(this)!=DialogResult.OK)return;
                using(var stream=File.OpenRead(dlg.FileName))await SavePDF(stream,"手动导入");
            }}catch(Exception ex){hint.Text=ex.GetBaseException().Message;}
        }
        async Task SavePDF(Stream stream,string source) {
            if(saving||done.Task.IsCompleted)return;
            saving=true;
            try {
                await PaperNetwork.EnsureConnected(route.Service,life.Token);
                string file=await Workspace.ArchivePDF(stream,Path.Combine(root,"References"),life.Token);
                Finish(new Map{{"file",file},{"title",String.IsNullOrWhiteSpace(title)?Text:title},{"articleURL",target.AbsoluteUri},{"downloadSource",source}});
            } finally{saving=false;}
        }
        public async void Response(object sender,EventArgs args) {
            if(!canSave||saving||done.Task.IsCompleted||action=="sessionCatalog")return;
            try {
                dynamic e=args;
                if(e.Response.StatusCode!=200 || !e.Response.Headers.Contains("Content-Type"))return;
                string type=e.Response.Headers.GetHeader("Content-Type");
                if(!type.StartsWith("application/pdf",StringComparison.OrdinalIgnoreCase))return;
                string url=e.Request.Uri;
                string dest=e.Request.Headers.Contains("Sec-Fetch-Dest")?(string)e.Request.Headers.GetHeader("Sec-Fetch-Dest"):"";
                if(dest!="document" && url!=(string)((dynamic)sender).Source)return;
                using(var stream=await (Task<Stream>)e.Response.GetContentAsync())
                    if(stream!=null)await SavePDF(stream,new Uri(url).Host);
            } catch(Exception ex){if(!done.Task.IsCompleted)hint.Text=ex.GetBaseException().Message;}
        }
        public void Download(object sender,EventArgs args) {
            dynamic e=args;dynamic op=e.DownloadOperation;
            if(!canSave||done.Task.IsCompleted||action=="sessionCatalog"){e.Cancel=true;return;}
            var name=Path.GetFileName((string)e.ResultFilePath);
            if(!name.EndsWith(".pdf",StringComparison.OrdinalIgnoreCase) && !((string)op.MimeType??"").StartsWith("application/pdf",StringComparison.OrdinalIgnoreCase)){e.Cancel=true;return;}
            object size=op.TotalBytesToReceive;
            if(size!=null && Convert.ToDecimal(size)>128L*1024*1024){e.Cancel=true;hint.Text="PDF 超过 128 MB。";return;}
            string path=Path.Combine(Path.GetTempPath(),"xiangxi-"+Guid.NewGuid()+".part");
            e.ResultFilePath=path;e.Handled=true;
            downloads[(object)op]=path;
            WorkspaceWindow.Hook((object)op,"BytesReceivedChanged",this,"DownloadProgress");
            WorkspaceWindow.Hook((object)op,"StateChanged",this,"DownloadChanged");
        }
        public void DownloadProgress(object sender,object args) {
            dynamic op=sender;
            if(Convert.ToDecimal(op.BytesReceived)>128L*1024*1024)op.Cancel();
        }
        public async void DownloadChanged(object sender,object args) {
            dynamic op=sender;string path;
            if(!downloads.TryGetValue(sender,out path))return;
            var state=op.State.ToString();if(state=="InProgress")return;
            downloads.Remove(sender);
            try {
                if(state=="Completed" && !done.Task.IsCompleted)using(var stream=File.OpenRead(path))await SavePDF(stream,new Uri((string)op.Uri).Host);
                else if(!done.Task.IsCompleted)hint.Text="下载已中断，可重新下载。";
            } catch(Exception ex){if(!done.Task.IsCompleted)hint.Text=ex.GetBaseException().Message;}
            finally{try{File.Delete(path);}catch(IOException){}}
        }
        protected override void Dispose(bool disposing) {
            if(disposing){timer.Dispose();life.Cancel();}
            base.Dispose(disposing);
        }
    }
}
