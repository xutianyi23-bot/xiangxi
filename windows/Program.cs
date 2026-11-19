using System;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Collections.Generic;

[assembly: AssemblyTitle("相析")]
[assembly: AssemblyCompany("徐天翼（笔名：鸡腿堡）")]
[assembly: AssemblyProduct("相析")]
namespace Xiangxi {
    internal static class Program {
        internal static readonly string Root = AppDomain.CurrentDomain.BaseDirectory;
        internal static readonly string Data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Xiangxi-Beta");
        [STAThread] static void Main() {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            bool first;
            using (var mutex = new Mutex(true, @"Local\Xiangxi-Workspace-Beta", out first)) {
                if (!first) { MessageBox.Show("相析已打开，请切回工作台窗口。", "相析"); return; }
                ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
                Application.Run(new WorkspaceWindow());
            }
        }
    }

    // The online build initializes Microsoft's managed bindings once per Windows user.
    internal static class WebViewBindings {
        internal static Type BrowserType { get; private set; }
        internal const string Version = "1.0.2903.40";
        const string Package = "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/" + Version + "/microsoft.web.webview2." + Version + ".nupkg";
        internal static readonly string[] Entries = {
            "lib/net462/Microsoft.Web.WebView2.Core.dll", "lib/net462/Microsoft.Web.WebView2.WinForms.dll",
            "runtimes/win-x64/native/WebView2Loader.dll"
        };
        static bool Ready(string folder) { return Entries.All(p => File.Exists(Path.Combine(folder, Path.GetFileName(p)))); }
        internal static void Load(string folder) {
            var core = Assembly.LoadFrom(Path.Combine(folder, "Microsoft.Web.WebView2.Core.dll"));
            core.GetType("Microsoft.Web.WebView2.Core.CoreWebView2Environment", true)
                .GetMethod("SetLoaderDllFolderPath").Invoke(null, new object[] { folder });
            var forms = Assembly.LoadFrom(Path.Combine(folder, "Microsoft.Web.WebView2.WinForms.dll"));
            BrowserType = forms.GetType("Microsoft.Web.WebView2.WinForms.WebView2", true);
        }
        internal static async Task<string> Prepare() {
            var bundled = Path.Combine(Program.Root, "WebView2");
            if (Ready(bundled)) return bundled;
            var folder = Path.Combine(Program.Data, "WebView2-" + Version + "-x64");
            if (Ready(folder)) return folder;
            Directory.CreateDirectory(Program.Data);
            var stage = Directory.CreateDirectory(Path.Combine(Program.Data, ".sdk-" + Guid.NewGuid())).FullName;
            try {
                using (var http = new HttpClient())
                using (var response = await http.GetAsync(Package, HttpCompletionOption.ResponseHeadersRead)) {
                    response.EnsureSuccessStatusCode();
                    var archive = Path.Combine(stage, "sdk.zip");
                    using (var output = File.Create(archive)) await response.Content.CopyToAsync(output);
                    using (var zip = ZipFile.OpenRead(archive)) {
                        foreach (var path in Entries) {
                            var entry = zip.GetEntry(path);
                            if (entry == null) throw new InvalidDataException("WebView2 包缺少 " + path);
                            entry.ExtractToFile(Path.Combine(stage, Path.GetFileName(path)));
                        }
                        foreach (var entry in zip.Entries.Where(e => e.FullName.IndexOf('/') < 0 && e.Name.StartsWith("LICENSE", StringComparison.OrdinalIgnoreCase)))
                            entry.ExtractToFile(Path.Combine(stage, entry.Name));
                    }
                    File.Delete(archive);
                }
                if (Directory.Exists(folder)) Directory.Move(folder, folder + ".old-" + Guid.NewGuid());
                Directory.Move(stage, folder);
                return folder;
            } finally { if (Directory.Exists(stage)) Directory.Delete(stage, true); }
        }
    }

    internal sealed class WorkspaceWindow : Form {
        readonly string page = new Uri(Path.Combine(Program.Root, "web", "index.html")).AbsoluteUri;
        dynamic core;
        Workspace workspace;
        readonly Label status = new Label { Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleCenter, Text = "正在准备 Windows 工作台…" };
        public WorkspaceWindow() {
            Text = "相析"; ClientSize = new Size(1200, 780); MinimumSize = new Size(900, 650);
            StartPosition = FormStartPosition.CenterScreen;
            Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            Controls.Add(status); Shown += Initialize;
        }
        internal static void Hook(object instance, string name, object target, string handler) {
            var evt = instance.GetType().GetEvent(name);
            evt.AddEventHandler(instance, Delegate.CreateDelegate(evt.EventHandlerType, target, target.GetType().GetMethod(handler)));
        }
        async void Initialize(object sender, EventArgs e) {
            string step = "首次启动需联网从 NuGet 下载微软 WebView2 组件。请检查网络后重新打开。";
            try {
                string dll = await WebViewBindings.Prepare();
                step = "请确认已安装 Microsoft Edge WebView2 Evergreen Runtime（x64），并已完整解压程序。";
                WebViewBindings.Load(dll);
                var browserType = WebViewBindings.BrowserType;
                dynamic browser = Activator.CreateInstance(browserType);
                dynamic options = Activator.CreateInstance(browserType.GetProperty("CreationProperties").PropertyType);
                options.UserDataFolder = Path.Combine(Program.Data, "Browser");
                browser.CreationProperties = options;
                var control = (Control)browser;
                control.Dock = DockStyle.Fill; Controls.Add(control);
                await (Task)browser.EnsureCoreWebView2Async(null);
                core = browser.CoreWebView2;
                core.Settings.AreHostObjectsAllowed = false;
                core.Settings.AreDevToolsEnabled = false;
                Hook((object)core, "NavigationStarting", this, "Navigating");
                Hook((object)core, "NewWindowRequested", this, "NewWindow");
                Hook((object)core, "WebMessageReceived", this, "Message");
                workspace = new Workspace(this, Program.Data, Emit);
                if (!File.Exists(new Uri(page).LocalPath)) throw new FileNotFoundException("缺少 web/index.html");
                core.Navigate(page); control.BringToFront();
            } catch (Exception ex) {
                status.BringToFront(); status.Text = step + "\r\n\r\n" + ex.GetBaseException().Message;
            }
        }
        public void Navigating(object sender, EventArgs args) {
            dynamic e = args;
            if (!SamePage((string)e.Uri)) e.Cancel = true;
        }
        bool SamePage(string url) {
            Uri parsed;
            return Uri.TryCreate(url, UriKind.Absolute, out parsed) && parsed == new Uri(page);
        }
        public void NewWindow(object sender, EventArgs args) { ((dynamic)args).Handled = true; }
        public void Message(object sender, EventArgs args) {
            dynamic e = args;
            if (!SamePage((string)e.Source)) return;
            string message = e.WebMessageAsJson;
            BeginInvoke(new Action(async () => await workspace.Handle(message)));
        }
        void Emit(string name, object value) {
            if (!IsDisposed && !Disposing) core.PostWebMessageAsJson(Workspace.Json.Serialize(new object[] { name, value }));
        }
    }
}
