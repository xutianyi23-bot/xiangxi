using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Win32;
using Map = System.Collections.Generic.Dictionary<string, object>;

namespace Xiangxi {
    internal sealed class PaperRoute {
        internal readonly string Service, Gateway, Proxy, Kind;
        internal PaperRoute(Map m) {
            Service = Workspace.Str(m,"service");
            Gateway = Workspace.Str(m,"gateway");
            Kind = Workspace.Str(m,"proxyKind");
            if (Gateway.Length != 0) Https(Gateway.Replace("{url}", "target"));
            if (Kind == "" || Kind == "campus") return;
            var host = Workspace.Str(m,"host").Trim('[',']');
            int port;
            if ((Kind != "http" && Kind != "socks5") || Uri.CheckHostName(host) == UriHostNameType.Unknown
                || !Int32.TryParse(Workspace.Str(m,"port"), NumberStyles.None, CultureInfo.InvariantCulture, out port) || port < 1 || port > 65535)
                throw new InvalidDataException("代理地址或端口无效。");
            Proxy = new UriBuilder(Kind, host, port).Uri.GetLeftPart(UriPartial.Authority);
        }
        internal static Uri Https(string raw) {
            Uri uri;
            if (!Uri.TryCreate(raw,UriKind.Absolute,out uri) || uri.Scheme != "https" || uri.UserInfo.Length != 0 || uri.Host.Length == 0)
                throw new InvalidDataException("论文访问需要有效的 HTTPS 地址。");
            return uri;
        }
        internal Uri Through(Uri target) {
            return Gateway.Length == 0 ? target : Https(Gateway.Replace("{url}", Uri.EscapeDataString(target.AbsoluteUri)));
        }
        internal string BrowserArguments { get { return Kind == "campus" ? "--no-proxy-server" : Proxy == null ? "" : "--proxy-server="+Proxy; } }
    }

    internal static class PaperNetwork {
        static readonly string SystemDir = Environment.GetFolderPath(Environment.SpecialFolder.System);
        // Only installed profiles and their connection state leave the Windows VPN cmdlet.
        internal static async Task<Map[]> Inventory(CancellationToken token) {
            const string script = "$ErrorActionPreference='Stop'; [Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false); " +
                "$rows=@(foreach($all in @($false,$true)){ foreach($v in @(Get-VpnConnection -AllUserConnection:$all)){ " +
                "[pscustomobject]@{id=($v.Guid.ToString());name=$v.Name;status=$v.ConnectionStatus.ToString();all=$all} } }); " +
                "ConvertTo-Json -InputObject $rows -Compress";
            string result = await ReadProcess(Path.Combine(SystemDir,@"WindowsPowerShell\v1.0\powershell.exe"),
                "-NoLogo -NoProfile -NonInteractive -EncodedCommand "+Convert.ToBase64String(Encoding.Unicode.GetBytes(script)), token);
            return Workspace.Items(Workspace.Json.DeserializeObject(result.TrimStart('\uFEFF'))).OfType<Map>().ToArray();
        }
        internal static async Task<string> ReadProcess(string exe, string args, CancellationToken token) {
            token.ThrowIfCancellationRequested();
            var start = new ProcessStartInfo(exe,args) { UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,
                RedirectStandardError=true,StandardOutputEncoding=Encoding.UTF8,StandardErrorEncoding=Encoding.UTF8 };
            using (var proc=Process.Start(start))
            using (token.Register(()=>{try {if(!proc.HasExited)proc.Kill();}catch(InvalidOperationException){}})) {
                var output=proc.StandardOutput.ReadToEndAsync();
                var error=proc.StandardError.ReadToEndAsync();
                await Task.WhenAll(output,error,Task.Run((Action)proc.WaitForExit));
                token.ThrowIfCancellationRequested();
                if(proc.ExitCode!=0) throw new IOException("Windows 未能完成操作。"+error.Result.Trim().Split('\n').FirstOrDefault());
                return output.Result;
            }
        }
        internal static async Task EnsureConnected(string service,CancellationToken token) {
            if(service.Length!=0 && !(await Inventory(token)).Any(v=>Workspace.Str(v,"id")==service && Workspace.Str(v,"status")=="Connected"))
                throw new InvalidOperationException("所选 VPN 已断开。请重新连接后继续。");
        }
        internal static async Task Connect(string service,CancellationToken token) {
            if(service.Length==0)return;
            var inventory=await Inventory(token);
            var profile=inventory.FirstOrDefault(v=>Workspace.Str(v,"id")==service);
            if(profile==null)throw new InvalidOperationException("未找到所选 Windows VPN，请刷新服务并重新绑定。");
            if(Workspace.Str(profile,"status")=="Connected")return;
            if(inventory.Any(v=>Workspace.Str(v,"id")!=service && Workspace.Str(v,"status")=="Connected"))
                throw new InvalidOperationException("另一个系统 VPN 已连接，请先在 Windows 中选择要使用的网络。");
            var baseDir=Equals(Workspace.Get(profile,"all"),true)?Environment.SpecialFolder.CommonApplicationData:Environment.SpecialFolder.ApplicationData;
            string book=Path.Combine(Environment.GetFolderPath(baseDir),@"Microsoft\Network\Connections\Pbk\rasphone.pbk");
            if(Workspace.Str(profile,"status")!="Connecting") {
                var args=(File.Exists(book)?"-f "+Workspace.Quote(book)+" ":"")+"-d "+Workspace.Quote(Workspace.Str(profile,"name"));
                using(Process.Start(new ProcessStartInfo(Path.Combine(SystemDir,"rasphone.exe"),args){UseShellExecute=false})) {}
            }
            for(int i=0;i<25;i++) {
                await Task.Delay(1600,token);
                if((await Inventory(token)).Any(v=>Workspace.Str(v,"id")==service && Workspace.Str(v,"status")=="Connected"))return;
            }
            throw new InvalidOperationException("尚未连接所选 Windows VPN。请完成系统登录后重试。");
        }
        internal static string ClashClient() {
            var dirs=new[]{Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Programs")};
            var installs=new[]{@"FlClash\FlClash.exe",@"Clash Verge\clash-verge.exe",@"Clash Verge Rev\clash-verge.exe"};
            return dirs.SelectMany(d=>installs.Select(f=>Path.Combine(d,f))).FirstOrDefault(File.Exists);
        }
        internal static object ClashDefaults() {
            var raw=Convert.ToString(Registry.GetValue(@"HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Internet Settings","ProxyServer",""));
            var match=Regex.Match(raw??"", @"(?:^|;)(?:(http|https|socks)=)?(?:127\.0\.0\.1|localhost|\[::1\]):(\d{1,5})(?:;|$)",RegexOptions.IgnoreCase);
            return new { kind=match.Groups[1].Value=="socks"?"socks5":"http",port=match.Success?match.Groups[2].Value:"",client=Path.GetFileNameWithoutExtension(ClashClient())??"" };
        }
        internal static async Task<string> TestPort(string value) {
            int port;
            if(!Int32.TryParse(value,out port)||port<1||port>65535)throw new InvalidDataException("请输入有效端口。");
            using(var socket=new TcpClient()) {
                var connect=socket.ConnectAsync(IPAddress.Loopback,port);
                if(await Task.WhenAny(connect,Task.Delay(2500))!=connect)throw new IOException("连接本机端口超时。");
                await connect;
                return "本机端口可连接。请打开提供商窗口确认代理可以访问目标网站。";
            }
        }
    }
}
