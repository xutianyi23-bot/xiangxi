using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Map = System.Collections.Generic.Dictionary<string, object>;

namespace Xiangxi {
    internal sealed partial class Workspace {
        internal static JavaScriptSerializer Json { get { return new JavaScriptSerializer { MaxJsonLength = 128 * 1024 * 1024, RecursionLimit = 160 }; } }
        readonly Form window;
        readonly string root;
        readonly Action<string, object> emit;
        readonly Dictionary<string, CancellationTokenSource> requests = new Dictionary<string, CancellationTokenSource>();
        Map state;
        internal Workspace(Form window, string root, Action<string, object> emit) {
            this.window = window; this.root = root; this.emit = emit;
        }
        internal static object Get(Map data, string key) { object v; return data != null && data.TryGetValue(key, out v) ? v : null; }
        internal static string Str(Map data, string key) { return Get(data, key) as string ?? ""; }
        internal static IEnumerable<object> Items(object value) { var list = value as IList; return list == null ? Enumerable.Empty<object>() : list.Cast<object>(); }
        internal static IEnumerable<Map> Rows(Map data, string key) { return Items(Get(data, key)).OfType<Map>(); }
        static void Atomic(string path, byte[] content) {
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            var temp = path + "." + Guid.NewGuid() + ".tmp";
            try {
                File.WriteAllBytes(temp, content);
                if (File.Exists(path)) File.Replace(temp, path, null); else File.Move(temp, path);
            } finally { if (File.Exists(temp)) File.Delete(temp); }
        }
        static readonly Dictionary<string,string> FileTypes = new Dictionary<string,string> {
            {"References","pdf txt md docx"}, {"Measurements","txt csv tsv dat jdx dx docx pdf png jpg jpeg tif tiff"},
            {"Reagents","png jpg jpeg bmp tif tiff wav m4a mp3"}, {"Recordings","wav mp3 m4a"}
        };
        string Attachment(string folder, string file) {
            Guid id;
            var ext = Path.GetExtension(file).TrimStart('.').ToLowerInvariant();
            if (Path.GetFileName(file) != file || !Guid.TryParseExact(Path.GetFileNameWithoutExtension(file), "D", out id)
                || !FileTypes[folder].Split(' ').Contains(ext)) throw new InvalidDataException("附件名称或类型无效。");
            return Path.Combine(root, folder, file);
        }
        static HashSet<string> FileNames(object value) {
            var found = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            Collect(value, found); return found;
        }
        static void Collect(object value, HashSet<string> found) {
            var obj = value as Map;
            if (obj != null) {
                foreach (var pair in obj) {
                    if ((pair.Key == "file" || pair.Key == "previousFile") && pair.Value is string) found.Add((string)pair.Value);
                    else Collect(pair.Value, found);
                }
            } else foreach (var item in Items(value)) Collect(item, found);
        }
        void Save(Map msg) {
            var next = Get(msg,"state") as Map;
            if (next == null || !(Get(next, "projects") is IList)) throw new InvalidDataException("工作区数据无效。");
            var old = state;
            Atomic(Path.Combine(root,"workspace.json"), Encoding.UTF8.GetBytes(Json.Serialize(next)));
            state = next;
            var removed = Items(Get(msg,"removedReagentFiles")).OfType<string>().ToArray();
            try {
                PurgeKeys(old, next);
                var deleted = Str(msg,"deletedProject");
                var oldProject = Rows(old,"projects").FirstOrDefault(p => Str(p,"id") == deleted);
                if (removed.Length != 0 || oldProject != null) {
                    var keep = FileNames(Get(next,"projects"));
                    var files = FileNames(oldProject);
                    foreach (string folder in FileTypes.Keys)
                        foreach (string name in (folder == "Reagents" ? files.Concat(removed) : files).Distinct().Where(f => !keep.Contains(f))) {
                            string path;
                            try { path = Attachment(folder, name); } catch (InvalidDataException) { continue; }
                            if (File.Exists(path)) File.Delete(path);
                        }
                }
            } catch (IOException) { emit("providerNotice","数据已保存，部分旧文件未能清理。"); }
            emit("saved", new {removedReagentFiles = removed});
        }
        internal async Task Handle(string input) {
            Map m;
            try { m = Json.Deserialize<Map>(input); } catch (ArgumentException) { return; }
            var op = Str(m,"op"); var id = Str(m,"requestID");
            try {
                switch (op) {
                case "load":
                    var file = Path.Combine(root,"workspace.json");
                    state = File.Exists(file) ? Json.Deserialize<Map>(File.ReadAllText(file)) : null;
                    if (state == null && File.Exists(file)) throw new InvalidDataException("工作区文件为空。");
                    emit("load", state); return;
                case "save": Save(m); return;
                case "openArea": window.Text = "相析 · " + Str(m,"title"); return;
                case "closeArea": window.Text = "相析"; return;
                case "interfaceLanguage": case "stopVoice": case "stopMeetingMic": case "cancelWorkspaceScan": return;
                case "cancelModel":
                    CancellationTokenSource active;
                    if (requests.TryGetValue(id, out active)) active.Cancel();
                    return;
                case "backupDrives":
                    emit("backupDrives", Drives().Select(d => new { id = d.Name, name = d.Name + " " + d.VolumeLabel }).ToArray()); return;
                case "workspaceBackup": Backup(m); return;
                case "locateCodex": ChooseCodex(m); return;
                case "vpnServices":
                    using (var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(20)))
                        emit("vpnServices", new { items = await PaperNetwork.Inventory(timeout.Token) });
                    return;
                case "windowsVPNConnect":
                    using(var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(100)))
                        await PaperNetwork.Connect(Str(m,"service"),timeout.Token);
                    Reply(id,true);return;
                case "windowsVPNSettings": Open("ms-settings:network-vpn"); return;
                case "openClash":
                    var client=PaperNetwork.ClashClient();
                    if(client==null)throw new FileNotFoundException("未找到本机 Clash 客户端。");
                    Open(client); return;
                case "clashDefaults": Reply(id, PaperNetwork.ClashDefaults()); return;
                case "checkClashPort": Reply(id, await PaperNetwork.TestPort(Str(m,"port"))); return;
                case "paperAccess": await PaperAccess(m); return;
                case "paperCancel": if (paperToken == Str(m,"token") && paperStop != null) paperStop.Cancel(); return;
                case "paperAPIKey": EditKey(ArticleProvider()); return;
                case "downloadPaper": await DownloadOpenPaper(m);return;
                case "batchCatalog": case "librarySearch": await Catalog(m); return;
                case "credential": EditKey(Provider(m)); return;
                case "modelList": case "ask": case "askProject": case "testProject": case "testCalendar": case "design":
                case "summary": case "keywords": case "workflowAI": case "reagentAI": case "backgroundAI": case "searchTermsAI":
                case "batchAI": case "readingAI":
                    using (var cts = new CancellationTokenSource(TimeSpan.FromSeconds(105))) {
                        if (id.Length != 0) requests.Add(id,cts);
                        try { await Model(m,cts.Token); } finally { requests.Remove(id); }
                    }
                    return;
                case "importReference": case "importMeasurement": case "importReagent": case "importAudio": Import(op,m); return;
                case "openReference": case "openMeasurement": case "openReagentFile": case "playRecording":
                    var folder = op == "openReference" ? "References" : op == "openMeasurement" ? "Measurements" : op == "playRecording" ? "Recordings" : "Reagents";
                    var attachment = Attachment(folder, Str(m,"file"));
                    if (!File.Exists(attachment)) throw new FileNotFoundException("未找到附件。");
                    Open(attachment); return;
                case "readAttachment":
                    var reference = Attachment("References", Str(m,"file"));
                    if (!new[]{".md",".txt"}.Contains(Path.GetExtension(reference))) throw new InvalidDataException("此预览版可读取 TXT 和 Markdown 正文。");
                    Reply(id, new[]{ReadText(reference)}); return;
                case "readReagentPhoto":
                    if (!Equals(Get(m,"vision"),true)) throw new InvalidOperationException("请选择支持图片的 AI 模型，或手动录入标签文字。");
                    Reply(id,Jpeg(Attachment("Reagents",Str(m,"file")))); return;
                case "diagramImage":
                    var image = Pick("选择参考图","png jpg jpeg bmp",false).FirstOrDefault();
                    Reply(id,image == null ? null : new {name=Path.GetFileName(image), jpeg=Jpeg(image)}); return;
                case "exportFigure": case "exportDiagram": case "exportDeckStyle":
                    var ext = op == "exportDeckStyle" ? "json" : Str(m,"format") == "drawio" ? "drawio" : "svg";
                    ExportText(ext,Str(m,"title"),Str(m, op == "exportDiagram" ? "svg" : op == "exportDeckStyle" ? "text":"body")); return;
                case "exportResearch":
                    if (Str(m,"format") != "html") throw new NotSupportedException(Unavailable);
                    ExportText("html",Str(m,"name"),Str(m,"html")); return;
                case "openDOI":
                    var doi = Str(m,"doi");
                    if (doi.StartsWith("10.") && doi.Contains("/")) Open("https://doi.org/"+String.Join("/",doi.Split('/').Select(Uri.EscapeDataString)));
                    return;
                case "composeFeedback": Open("mailto:xutianyi23@mails.ucas.ac.cn?subject="+Uri.EscapeDataString(Str(m,"subject"))+"&body="+Uri.EscapeDataString(Str(m,"body"))); return;
                case "holidayYear": await Holiday(m); return;
                default: throw new NotSupportedException(Unavailable);
                }
            } catch (Exception ex) { Fail(m,ex is OperationCanceledException ? "请求已取消或超时。" : ex.GetBaseException().Message); }
        }
        const string Unavailable = "这项功能尚未接入 Windows 内测版。";
        static void Open(string target) { Process.Start(new ProcessStartInfo(target) { UseShellExecute=true }); }
        void Reply(string id, object value) { emit("batchRPC", new { requestID=id, value }); }
        void Fail(Map m, string error) {
            var op = Str(m,"op"); var id = Str(m,"requestID");
            if (id.Length != 0) { emit("batchRPC", new {requestID=id,error}); return; }
            switch (op) {
            case "load": emit("loadError",error); break;
            case "save": emit("error",error); break;
            case "ask": emit("aiError",error); break;
            case "askProject": emit("projectError",error); break;
            case "testProject": case "testCalendar": emit("testError",error); break;
            case "design": case "keywords": case "summary": emit(op+"Error",error); break;
            case "workspaceBackup": emit("backupFinished","备份失败："+error); break;
            case "modelList": emit("modelListError",new {id=Str(m,"provider"),message=error}); break;
            case "voice": emit("voice",new {token=Str(m,"token"),final=true,error}); break;
            case "startMeetingMic": emit("meetingSpeech",new {token=Str(m,"token"),error}); break;
            case "vpnServices": emit("vpnServices",new {items=new object[0],error}); break;
            case "paperAccess": emit("paperFinished",new {token=Str(m,"token"),message=error}); break;
            case "librarySearch": m["rows"]=new object[0]; m["failed"]=new[]{error}; emit("searchResults",m); break;
            case "downloadPaper": case "transcribe": case "recognizeReagent":
                m["error"]=error; emit(op=="transcribe"?"transcribed":op=="downloadPaper"?"paperDownloaded":"reagentRecognized",m); break;
            default: emit("providerNotice",error); break;
            }
        }
        IEnumerable<DriveInfo> Drives() { return DriveInfo.GetDrives().Where(d => d.DriveType==DriveType.Removable && d.IsReady); }
        void Backup(Map msg) {
            var destination = Str(msg,"mode")=="desktop" ? Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory)
                : Drives().Single(d => d.Name == Str(msg,"drive")).RootDirectory.FullName;
            var archive = WriteBackup(destination, Get(msg, "state") as Map);
            emit("backupFinished", "备份已保存到 " + archive);
        }
        internal string WriteBackup(string destination, Map data) {
            var archive = Path.Combine(destination, "相析备份-"+DateTime.Now.ToString("yyyyMMdd-HHmmss")+"-"+Guid.NewGuid().ToString("N").Substring(0,6)+".zip");
            var names = FileNames(Get(data,"projects"));
            try {
                using (var zip = ZipFile.Open(archive+".tmp",ZipArchiveMode.Create)) {
                    using (var writer = new StreamWriter(zip.CreateEntry("workspace.json").Open(),new UTF8Encoding(false))) writer.Write(Json.Serialize(data));
                    foreach (var folder in FileTypes.Keys) {
                        var dir=Path.Combine(root,folder);
                        if (Directory.Exists(dir)) foreach(var path in Directory.EnumerateFiles(dir).Where(p=>names.Contains(Path.GetFileName(p))))
                            zip.CreateEntryFromFile(path,folder+"/"+Path.GetFileName(path));
                    }
                }
                File.Move(archive+".tmp",archive);
            } finally { if(File.Exists(archive+".tmp")) File.Delete(archive+".tmp"); }
            return archive;
        }
        static string ReadText(string path) {
            if (new FileInfo(path).Length > 8000000) throw new InvalidDataException("文本超过 8 MB，请选择所需片段。");
            return File.ReadAllText(path);
        }
        static string Jpeg(string path) {
            using(var source=Image.FromFile(path)) {
                var scale=Math.Min(1, 1600.0/Math.Max(source.Width,source.Height));
                using(var resized=new Bitmap(source,Math.Max(1,(int)(source.Width*scale)),Math.Max(1,(int)(source.Height*scale))))
                using(var stream=new MemoryStream()) {
                    resized.Save(stream,ImageFormat.Jpeg); return Convert.ToBase64String(stream.ToArray());
                }
            }
        }
        string[] Pick(string title,string extensions,bool many) {
            using(var dlg=new OpenFileDialog {Title=title,Multiselect=many,Filter="支持的文件|"+String.Join(";",extensions.Split(' ').Select(s=>"*."+s))})
                return dlg.ShowDialog(window)==DialogResult.OK ? dlg.FileNames : new string[0];
        }
        void Import(string op, Map m) {
            var folder=op=="importReference"?"References":op=="importMeasurement"?"Measurements":op=="importAudio"?"Recordings":"Reagents";
            var types=folder=="Reagents"?(Str(m,"kind")=="image"?"png jpg jpeg bmp tif tiff":"wav m4a mp3"):FileTypes[folder];
            var files=Pick("导入附件",types,op=="importReagent");
            var id=Str(m,"requestID");
            if(files.Length==0){if(id.Length!=0) Reply(id,new {cancelled=true}); return;}
            var items=new List<object>();
            foreach(var src in files) {
                var key=Guid.NewGuid().ToString(); var ext=Path.GetExtension(src).ToLowerInvariant(); var file=key+ext;
                var path=Attachment(folder,file); Directory.CreateDirectory(Path.GetDirectoryName(path));
                var name=Path.GetFileName(src);
                if(!types.Split(' ').Contains(ext.TrimStart('.'))) throw new InvalidDataException("不支持该文件格式。");
                File.Copy(src,path);
                switch(op) {
                case "importReference":
                    var note="";
                    if(ext==".txt"||ext==".md") using(var r=File.OpenText(path)){var chars=new char[4500]; note=new string(chars,0,r.ReadBlock(chars,0,chars.Length));}
                    emit("reference",new {project=Str(m,"project"),system=Str(m,"system"),@ref=new {id=key,title=Path.GetFileNameWithoutExtension(src),file,source=name,kind=ext==".pdf"?"参考文献":"调研资料",note}}); break;
                case "importMeasurement":
                    bool table=new[]{".txt",".csv",".tsv",".dat",".jdx",".dx"}.Contains(ext);
                    var measurement=new Map{{"file",file},{"name",name},{"table",table}};
                    if(table) try {measurement["text"]=ReadText(path);} catch(IOException ex){measurement["error"]=ex.Message;} catch(InvalidDataException ex){measurement["error"]=ex.Message;}
                    Reply(id,measurement); break;
                case "importAudio": m["file"]=file;m["title"]=name;emit("audioImported",m);break;
                default: items.Add(new {id=key,file,title=name});break;
                }
            }
            if(op=="importReagent"){m["items"]=items;emit("reagentFiles",m);}
        }
        void ExportText(string ext,string name,string text) {
            var safe=String.Concat(name.Select(c=>Path.GetInvalidFileNameChars().Contains(c)?'_':c)).Trim();
            using(var dlg=new SaveFileDialog{Filter=ext+"|*."+ext,DefaultExt=ext,FileName=(safe.Length==0?"相析":safe)+"."+ext})
                if(dlg.ShowDialog(window)==DialogResult.OK) Atomic(dlg.FileName,new UTF8Encoding(false).GetBytes(text));
        }
    }
}
