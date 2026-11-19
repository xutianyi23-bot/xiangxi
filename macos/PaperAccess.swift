import Cocoa
import WebKit
import PDFKit
import SystemConfiguration
import Security
import UniformTypeIdentifiers

private func httpsURL(_ text:String)->URL? {
    guard let u=URL(string:text),u.scheme?.lowercased()=="https",u.host?.isEmpty==false,u.user==nil,u.password==nil else{return nil}
    return u
}
private func wrapped(_ template:String,_ target:URL)->URL? {
    let value=target.absoluteString.addingPercentEncoding(withAllowedCharacters:.alphanumerics) ?? ""
    return httpsURL(template.replacingOccurrences(of:"{url}",with:value))
}
struct PaperVPN {
    static func services()throws->[[String:String]] {
        let p=Process(),pipe=Pipe();p.executableURL=URL(fileURLWithPath:"/usr/sbin/scutil");p.arguments=["--nc","list"];p.standardOutput=pipe
        try p.run();let data=pipe.fileHandleForReading.readDataToEndOfFile();p.waitUntilExit()
        guard p.terminationStatus==0 else {throw ServiceIssue.message("读取系统 VPN 失败。")}
        return parse(String(decoding:data,as:UTF8.self))
    }
    static func parse(_ output:String)->[[String:String]]{
        let regex=try! NSRegularExpression(pattern:#"^\s*\*\s+\(([^)]+)\)\s+([a-fA-F0-9-]{36})\s+.*?"(.+)"(?:\s+\[.*\])?\s*$"#)
        return output.components(separatedBy:.newlines).compactMap{line in
            let str=line as NSString
            guard let m=regex.firstMatch(in:line,range:NSRange(location:0,length:str.length)) else{return nil}
            return ["name":str.substring(with:m.range(at:3)),"id":str.substring(with:m.range(at:2)),"status":str.substring(with:m.range(at:1))]
        }
    }
    static func connection(_ id:String)->SCNetworkConnection?{
        guard UUID(uuidString:id) != nil else{return nil}
        return SCNetworkConnectionCreateWithServiceID(nil,id as CFString,nil,nil)
    }
    static func ready(_ id:String)->Bool {
        if id.isEmpty{return true};guard let c=connection(id) else{return false};return SCNetworkConnectionGetStatus(c) == .connected
    }
    static func connect(_ id:String)throws {
        if id.isEmpty{return}
        let active=try services()
        guard active.contains(where:{$0["id"]?.lowercased()==id.lowercased()}),let c=connection(id) else {throw ServiceIssue.message("此 VPN 已从 macOS 移除或停用。请刷新并重新绑定服务。")}
        if SCNetworkConnectionGetStatus(c) == .connected{return}
        if active.contains(where:{$0["id"]?.lowercased() != id.lowercased() && $0["status"]=="Connected"}) {throw ServiceIssue.message("另一个系统 VPN 已连接。请在 macOS 中切换到所选网络后重试。")}
        if SCNetworkConnectionGetStatus(c) != .connecting && !SCNetworkConnectionStart(c,nil,true){throw ServiceIssue.message("无法启动 VPN，请在系统设置或 VPN 客户端中连接后重试。")}
        for _ in 0..<90 {
            Thread.sleep(forTimeInterval:0.5)
            if SCNetworkConnectionGetStatus(c) == .connected{return}
        }
        throw ServiceIssue.message("VPN 未确认连接，请在系统设置中完成认证后重试。")
    }
}
enum ArticleKey {
    static var query:[String:Any] { [kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:"studio.xiangxi.beta.paperaccess",kSecAttrAccount as String:"api.elsevier.com"] }
    static func read()throws->String{
        var q=query;q[kSecReturnData as String]=true;var item:CFTypeRef?;let code=SecItemCopyMatching(q as CFDictionary,&item)
        if code==errSecItemNotFound{return ""}
        guard code==errSecSuccess,let d=item as? Data else{throw ServiceIssue.message("无法读取全文 API 密钥。")}
        return String(decoding:d,as:UTF8.self)
    }
    static func edit()throws{
        let a=NSAlert();a.messageText="Elsevier 全文 API 密钥";a.informativeText="密钥保存在本机钥匙串，仅用于 api.elsevier.com。清空后保存可移除密钥。"
        let field=NSSecureTextField(frame:NSRect(x:0,y:0,width:360,height:24));field.stringValue=try read();a.accessoryView=field;a.addButton(withTitle:"保存");a.addButton(withTitle:"取消")
        guard a.runModal() == .alertFirstButtonReturn else{return};let v=field.stringValue.trimmingCharacters(in:.whitespacesAndNewlines)
        var code:OSStatus
        if v.isEmpty{code=SecItemDelete(query as CFDictionary)}else{
            let update=[kSecValueData as String:Data(v.utf8)]
            code=SecItemUpdate(query as CFDictionary,update as CFDictionary)
            if code==errSecItemNotFound{code=SecItemAdd(query.merging(update){_,r in r} as CFDictionary,nil)}
        }
        guard code==errSecSuccess || (v.isEmpty && code==errSecItemNotFound) else{throw ServiceIssue.message("保存全文 API 密钥失败。")}
    }
}
struct PaperPDF {
    static func archive(_ src:URL,folder:URL)throws->[String:String] {
        let h=try FileHandle(forReadingFrom:src);defer{try? h.close()}
        let head=try h.read(upToCount:1024) ?? Data()
        guard head.range(of:Data("%PDF-".utf8)) != nil,let pdf=PDFDocument(url:src),pdf.pageCount>0 else{throw ServiceIssue.message("返回内容不是可读的 PDF。请完成登录或验证码，并选择文章的 PDF 下载入口。")}
        let title=pdf.documentAttributes?[PDFDocumentAttribute.titleAttribute] as? String ?? ""
        let note=(0..<min(pdf.pageCount,4)).compactMap{pdf.page(at:$0)?.string}.joined(separator:"\n")
        let fm=FileManager.default,file=UUID().uuidString+".pdf"
        try fm.createDirectory(at:folder,withIntermediateDirectories:true);try fm.copyItem(at:src,to:folder.appendingPathComponent(file))
        let authors=pdf.documentAttributes?[PDFDocumentAttribute.authorAttribute] as? String ?? ""
        return ["file":file,"title":title,"authors":authors,"note":String(note.prefix(10000))]
    }
}

final class PaperAccess {
    unowned let owner:Workspace
    private var current:PaperVisit?
    init(_ owner:Workspace){self.owner=owner}
    func handle(_ op:String,_ m:[String:Any])throws{
        if op=="paperCancel"{if current?.token==m["token"] as? String{current?.cancelBatch()};return}
        if op=="paperAPIKey"{try ArticleKey.edit();return}
        if op=="vpnServices"{
            DispatchQueue.global().async{
                do{let v=try PaperVPN.services();DispatchQueue.main.async{self.owner.emit("vpnServices",["items":v])}}
                catch{DispatchQueue.main.async{self.owner.emit("vpnServices",["items":[],"error":error.localizedDescription] as [String:Any])}}
            };return
        }
        guard let token=m["token"] as? String else{return}
        guard current==nil else {current?.window?.makeKeyAndOrderFront(nil);owner.emit("paperFinished",["token":token,"message":"请先完成当前论文访问。"]);return}
        do{
            let job=try PaperVisit(owner,m){[weak self] result in
                self?.current=nil;self?.owner.emit("paperFinished",result.merging(["token":token]){_,v in v})
            };current=job;job.start()
        }catch{owner.emit("paperFinished",["token":token,"message":error.localizedDescription])}
    }
}

final class PaperVisit:NSObject,NSWindowDelegate,WKNavigationDelegate,WKUIDelegate,WKDownloadDelegate,WKScriptMessageHandler {
    unowned let owner:Workspace
    let target:URL,login:URL,gateway:String,service:String,action:String,vendor:String,name:String,token:String,doi:String,pmc:String,canSave:Bool
    private var mode:String
    private var campus:CampusRoute?,interfaceName=""
    private var proxyKind:String,proxyHost:String,proxyPort:String
    let profile:UUID,hasReturnPath:Bool
    let preferPublisher:Bool,publicPDF:URL?
    private static let cnkiHome=URL(string:"https://www.cnki.net/")!
    private weak var rejectedView:WKWebView?
    let catalogURL:URL?
    let proposedTitle:String
    private var completion:(([String:String])->Void)?
    var window:NSWindow?
    private var browser:WKWebView!
    private var status=NSTextField(labelWithString:""),origin=NSTextField(labelWithString:"")
    private var popups=[NSWindow](),pendingDownload:WKDownload?,downloadFile:URL?,apiTask:URLSessionDownloadTask?
    private var fallback:[(URLRequest,URLSession,String)]=[]
    private var downloadSource=""
    private var sessionVisit:Bool {action=="sessionCatalog" || action=="sessionPDF"}
    private var deadline=Date.distantFuture,requestedPDF=Set<URL>(),awaitingUser=false,unavailableSince:Date?
    private static let pageObserver:String? = {
        guard let url=Bundle.main.url(forResource:"provider-page",withExtension:"js",subdirectory:"web") else{return nil}
        return try? String(contentsOf:url,encoding:.utf8)
    }()
    private static let sessionProbe=Bundle.main.url(forResource:"provider-session",withExtension:"js",subdirectory:"web").flatMap{try? String(contentsOf:$0,encoding:.utf8)}
    private var probeTimer:Timer?
    private var verifyCandidate=""
    private var reportedSession=""
    private var lastSessionCheck=Date.distantPast
    private func checkSession(_ view:WKWebView){
        guard completion != nil,let host=view.url?.host?.lowercased(),let script=Self.sessionProbe else{return}
        let known=["cnki":["cnki.net","cnki.com.cn"],"elsevier":["sciencedirect.com","elsevier.com"],"springer":["springer.com","springernature.com"],"acs":["acs.org"],"wiley":["wiley.com"]]
        let hosts=known[vendor] ?? [target.host].compactMap{$0?.lowercased()}
        guard hosts.contains(where:{host==$0 || host.hasSuffix("."+$0)}) else{return}
        view.callAsyncJavaScript("return "+script,arguments:["accessMode":mode],in:nil,in:.defaultClient){[weak self,weak view] result in
            guard let self,self.completion != nil,view?.url?.host?.lowercased()==host,case .success(let value)=result,let state=value as? String,(self.reportedSession != state || Date().timeIntervalSince(self.lastSessionCheck)>300) else{return}
            if self.action=="verify" {
                if self.verifyCandidate==state && ["in","out"].contains(state){self.finish(["state":state,"message":self.name+" · "+(state=="in" ? "已登录":"未登录")])}
                self.verifyCandidate=state;return
            }
            self.reportedSession=state;self.lastSessionCheck=Date();self.owner.emit("publisherSession",["vendor":self.vendor,"state":state])
        }
    }
    private var lastTitle="",lastPage:URL?
    private var resumeAfterLogin=false,ipLoginPending=false,attemptedIP=false
    init(_ owner:Workspace,_ m:[String:Any],_ completion:@escaping([String:String])->Void)throws {
        func value(_ key:String)->String{m[key] as? String ?? ""}
        guard let t=httpsURL(value("target")),let l=wrapped(value("login"),t) else{throw ServiceIssue.message("请检查提供商的网址和登录路径。")}
        catalogURL=(value("vendor")=="cnki" && value("action")=="sessionPDF") ? httpsURL(value("catalogURL")) : nil
        preferPublisher=m["preferPublisher"] as? Bool==true;publicPDF=httpsURL(value("pdf"))
        proxyKind=value("proxyKind");proxyHost=value("host");proxyPort=value("port")
        let profileKey="paperProfile."+value("profile")
        if let saved=UserDefaults.standard.string(forKey:profileKey),let id=UUID(uuidString:saved){profile=id}else{profile=UUID();UserDefaults.standard.set(profile.uuidString,forKey:profileKey)}
        hasReturnPath=value("login").contains("{url}")
        target=t;login=l;self.owner=owner;gateway=value("gateway");service=value("service");action=value("action");vendor=value("vendor");name=value("name");token=value("token");doi=value("doi");pmc=value("pmc");mode=value("mode");proposedTitle=value("title");canSave=m["canSave"] as? Bool==true
        guard gateway.isEmpty || wrapped(gateway,t) != nil else{throw ServiceIssue.message("学校代理模板无效。")}
        self.completion=completion
    }
    func start(){
        if proxyKind=="campus" {
            guard #available(macOS 14.0,*),vendor=="cnki",service.isEmpty,gateway.isEmpty else{finish(["message":"校园直连需要 macOS 14 或以上。可在「论文提供商 → 中国知网」切换到学校机构登录，或选择本机网络。"]);return}
            let channel=CampusRoute();campus=channel
            channel.start{result in
                switch result{
                case .success(let (port,iface)):guard self.completion != nil else{return};self.proxyHost="127.0.0.1";self.proxyPort=String(port);self.interfaceName=iface;self.begin()
                case .failure(let error):self.finish(["message":error.localizedDescription])
                }
            };return
        }
        DispatchQueue.global(qos:.userInitiated).async {
            do{try PaperVPN.connect(self.service);DispatchQueue.main.async{self.begin()}}
            catch{DispatchQueue.main.async{self.finish(["message":error.localizedDescription])}}
        }
    }
    private func begin(){
        guard completion != nil else{return}
        guard PaperVPN.ready(service) else{finish(["message":"所选 VPN 已断开。"]);return}
        if !proxyKind.isEmpty {
            guard #available(macOS 14.0,*),["socks5","http","campus"].contains(proxyKind),!proxyHost.isEmpty,UInt16(proxyPort).map({$0>0})==true else{finish(["message":"此代理需要 macOS 14 或以上及有效代理端口。"]);return}
        }
        if action=="verify"{
            openBrowser("正在核验提供商的登录状态…")
            DispatchQueue.main.asyncAfter(deadline:.now()+18){[weak self] in self?.finish(["state":"unknown","message":"网站未显示明确的登录状态。可打开登录窗口查看。"])}
            return
        }
        if sessionVisit{
            guard ["cnki","elsevier"].contains(vendor),Self.pageObserver != nil else{finish(["message":"缺少出版社页面适配器。"]);return}
            deadline=Date().addingTimeInterval(60)
            openBrowser("正在使用已保存的登录会话…")
            inspectSoon()
            return
        }
        if action=="batch"{
            guard canSave,gateway.isEmpty else{finish(["message":"此入口需要交互式登录。"]);return}
            if pmc.range(of:"^PMC[0-9]+$",options:.regularExpression) != nil,let url=URL(string:"https://europepmc.org/articles/"+pmc+"?pdf=render"){
                fallback.append((URLRequest(url:url),.shared,"Europe PMC"))
            }
            if let url=publicPDF,let host=url.host,!(host=="sciencedirect.com" || host.hasSuffix(".sciencedirect.com") || host=="api.elsevier.com"),!fallback.contains(where:{$0.0.url==url}){
                fallback.append((URLRequest(url:url),.shared,host))
            }
            if vendor=="elsevier",doi.hasPrefix("10.1016/"),let key=try? ArticleKey.read(),!key.isEmpty{
                var c=URLComponents();c.scheme="https";c.host="api.elsevier.com";c.path="/content/article/doi/"+doi
                if let u=c.url{var req=URLRequest(url:u);req.setValue(key,forHTTPHeaderField:"X-ELS-APIKey");req.setValue("application/pdf",forHTTPHeaderField:"Accept");fallback.append((req,owner.transport.session,"Elsevier API"))}
            }
            nextBatch("没有可用的授权 PDF 来源。");return
        }
        if canSave && action=="paper" && gateway.isEmpty {
            if vendor=="elsevier",doi.range(of:#"^10\.\d{4,9}/\S+$"#,options:.regularExpression) != nil {
                do{let key=try ArticleKey.read()
                    if !key.isEmpty {
                        var c=URLComponents();c.scheme="https";c.host="api.elsevier.com";c.path="/content/article/doi/"+doi
                        if let url=c.url{
                            var req=URLRequest(url:url);req.setValue(key,forHTTPHeaderField:"X-ELS-APIKey");req.setValue("application/pdf",forHTTPHeaderField:"Accept")
                            fetch(req,session:owner.transport.session);return
                        }
                    }
                }catch{openBrowser(error.localizedDescription);return}
            }
            if !preferPublisher,let url=publicPDF,!(url.host ?? "").hasSuffix("sciencedirect.com") {fetch(URLRequest(url:url),session:.shared);return}
            if !preferPublisher,pmc.range(of:"^PMC[0-9]+$",options:.regularExpression) != nil {
                fetch(URLRequest(url:URL(string:"https://europepmc.org/articles/"+pmc+"?pdf=render")!),session:.shared);return
            }
        }
        openBrowser("")
    }
    private func nextBatch(_ failure:String){
        guard !fallback.isEmpty else{finish(["message":failure]);return}
        let (req,session,source)=fallback.removeFirst();downloadSource=source;fetch(req,session:session)
    }
    private func fetch(_ request:URLRequest,session:URLSession){
        var req=request;req.timeoutInterval=35
        owner.emit("paperStatus",["token":token,"message":"正在获取全文 PDF…"])
        let settings=URLSessionConfiguration.ephemeral
        guard PaperSetProxy(settings,proxyKind,proxyHost,proxyPort) else{finish(["message":"无法启用所选代理。"]);return}
        let client=proxyKind.isEmpty ? session:URLSession(configuration:settings,delegate:req.value(forHTTPHeaderField:"X-ELS-APIKey")==nil ? nil:owner.transport,delegateQueue:nil)
        apiTask=client.downloadTask(with:req){file,response,error in
            // The URLSession download location expires when this callback returns.
            let tmp=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            var ok=false
            if error==nil,(response as? HTTPURLResponse)?.statusCode==200,let file=file {do{try FileManager.default.moveItem(at:file,to:tmp);ok=true}catch{}}
            DispatchQueue.main.async {
                defer{try? FileManager.default.removeItem(at:tmp)}
                guard self.completion != nil else{return}
                guard PaperVPN.ready(self.service) else{self.finish(["message":"所选 VPN 已断开，请重新连接。"]);return}
                if ok,let result=try? PaperPDF.archive(tmp,folder:self.owner.referenceFolder){self.finish(result.merging(["downloadSource":self.downloadSource]){a,_ in a});return}
                if self.action=="batch" {
                    let code=(response as? HTTPURLResponse)?.statusCode ?? 0
                    if code==429{self.finish(["message":"来源要求稍后重试（HTTP 429）。","limited":"yes"])}
                    else{self.nextBatch(code==0 ? "来源连接失败。":"来源未返回可读 PDF（HTTP "+String(code)+"）。")};return
                }
                self.openBrowser("接口未返回可用 PDF，可在提供商页面继续登录或下载。")
            }
        };apiTask?.resume();if !proxyKind.isEmpty{client.finishTasksAndInvalidate()}
    }
    private func through(_ url:URL)->URL {gateway.isEmpty ? url : wrapped(gateway,url)!}
    private func button(_ title:String,_ sel:Selector)->NSButton{NSButton(title:title,target:self,action:sel)}
    private func openBrowser(_ message:String){
        let w=NSWindow(contentRect:NSRect(x:0,y:0,width:1080,height:735),styleMask:[.titled,.closable,.resizable,.miniaturizable],backing:.buffered,defer:false)
        w.isReleasedWhenClosed=false;w.minSize=NSSize(width:780,height:480);w.delegate=self;w.title=name+" · 文献访问";window=w
        let cfg=WKWebViewConfiguration();cfg.websiteDataStore = PaperWebsiteStore(profile)
        cfg.upgradeKnownHostsToHTTPS=true
        cfg.preferences.javaScriptCanOpenWindowsAutomatically = vendor=="cnki"
        guard PaperSetProxy(cfg.websiteDataStore,proxyKind,proxyHost,proxyPort) else{finish(["message":"此系统无法启用所选代理。"]);return}
        if vendor=="cnki",let url=Bundle.main.url(forResource:"cnki-login-status",withExtension:"js",subdirectory:"web"),
           let code=try? String(contentsOf:url,encoding:.utf8){
            cfg.userContentController.add(self,contentWorld:.defaultClient,name:"cnkiLoginStatus")
            cfg.userContentController.addUserScript(WKUserScript(source:code,injectionTime:.atDocumentEnd,forMainFrameOnly:false,in:.defaultClient))
        }
        browser=WKWebView(frame:.zero,configuration:cfg);browser.navigationDelegate=self;browser.uiDelegate=self
        var tools=[button("后退",#selector(back)),button("登录入口",#selector(signIn)),button(action=="search" ? "继续检索":"前往目标",#selector(goTarget)),button("复制目标",#selector(copyTarget)),button("用 Safari 打开",#selector(safari))]
        if !proxyKind.isEmpty{tools.removeLast()}
        if vendor=="cnki" && mode=="ip"{tools.insert(button("学校机构登录",#selector(schoolLogin)),at:2)}
        if canSave && action != "sessionCatalog" {tools.append(button("导入已下载 PDF",#selector(importPDF)))}
        let toolbar=NSStackView(views:tools);toolbar.spacing=8
        let root=NSView();w.contentView=root
        for v in [toolbar,origin,browser!,status] as [NSView]{v.translatesAutoresizingMaskIntoConstraints=false;root.addSubview(v)}
        origin.font = .systemFont(ofSize:12);origin.lineBreakMode = .byTruncatingMiddle;status.lineBreakMode = .byTruncatingTail
        NSLayoutConstraint.activate([toolbar.leadingAnchor.constraint(equalTo:root.leadingAnchor,constant:10),toolbar.topAnchor.constraint(equalTo:root.topAnchor,constant:8),origin.topAnchor.constraint(equalTo:toolbar.bottomAnchor,constant:6),origin.leadingAnchor.constraint(equalTo:toolbar.leadingAnchor),origin.trailingAnchor.constraint(equalTo:root.trailingAnchor,constant:-8),browser.topAnchor.constraint(equalTo:origin.bottomAnchor,constant:6),browser.leadingAnchor.constraint(equalTo:root.leadingAnchor),browser.trailingAnchor.constraint(equalTo:root.trailingAnchor),browser.bottomAnchor.constraint(equalTo:status.topAnchor,constant:-6),status.leadingAnchor.constraint(equalTo:toolbar.leadingAnchor),status.trailingAnchor.constraint(equalTo:root.trailingAnchor,constant:-10),status.bottomAnchor.constraint(equalTo:root.bottomAnchor,constant:-6)])
        let hint=gateway.isEmpty || gateway.contains("{url}") ? "如遇验证，请在本窗口完成，再点击网站的 PDF 下载。" : "请在学校门户内访问数据库，可用「复制目标」取得论文或检索网址。"
        status.stringValue=campus != nil ? "校园直连 · "+interfaceName+" · 请在知网页面核对机构名称。":(message.isEmpty ? hint : message)
        if action != "verify"{w.center();w.makeKeyAndOrderFront(nil)}
        owner.emit("paperStatus",["token":token,"message":action=="verify" ? "正在核验登录状态…":"已打开 "+name+" 的文献访问窗口。"])
        if action=="verify"{var req=URLRequest(url:through(target));req.cachePolicy = .reloadIgnoringLocalCacheData;browser.load(req);return}
        if sessionVisit{goTarget();return}
        if action=="login" || hasReturnPath{signIn();return}
        if mode != "ip" && login != target {
            cfg.websiteDataStore.httpCookieStore.getAllCookies{[weak self] cookies in
                guard let self=self,self.completion != nil else{return}
                let host=self.through(self.target).host?.lowercased() ?? ""
                let known=cookies.contains{let d=$0.domain.lowercased().trimmingCharacters(in:CharacterSet(charactersIn:"."));return host==d || host.hasSuffix("."+d)}
                known ? self.goTarget() : self.signIn()
            }
        }else{goTarget()}
    }
    func cancelBatch(){
        guard sessionVisit || action=="batch" else{return}
        finish(["message":"已停止下载。","paused":"yes"])
    }
    private func inspectSoon(){
        DispatchQueue.main.asyncAfter(deadline:.now()+1){[weak self] in self?.inspectPage()}
    }
    private func inspectPage(){
        guard completion != nil,sessionVisit,let script=Self.pageObserver else{return}
        if rejectedView != nil{inspectSoon();return}
        if Date()>deadline && !awaitingUser{
            finish(["message":action=="sessionCatalog" ? "网站未返回可识别的检索结果，请检查机构登录或网络。" : "未取得可下载的 PDF，可能没有该篇全文权限。"]);return
        }
        guard let view=(popups.last?.contentView as? WKWebView) ?? browser,view.url != nil,!view.isLoading,pendingDownload==nil else{inspectSoon();return}
        let isCatalog=catalogURL.map{through($0).host==view.url?.host && through($0).path==view.url?.path} ?? false
        let args:[String:Any]=["vendor":vendor,"action":isCatalog ? "selectArticle":action,"mode":mode,"tryIP":!attemptedIP,
                                "article":["title":proposedTitle,"url":target.absoluteString]]
        view.callAsyncJavaScript("return ("+script+")(vendor, action, mode, tryIP, article)",arguments:args,in:nil,in:.defaultClient){[weak self,weak view] result in
            guard let self=self,self.completion != nil else{return}
            if case .success(let raw)=result,let item=raw as? [String:Any],let state=item["state"] as? String{
                switch state{
                case "rows":
                    if let rows=item["rows"] as? [[String:String]],let data=try? JSONEncoder().encode(rows){
                        self.finish(["rowsJSON":String(decoding:data,as:UTF8.self)]);return
                    }
                case "empty":self.finish(["rowsJSON":"[]"]);return
                case "limited":self.finish(["message":"平台提示访问过于频繁，本平台任务已暂停。","limited":"yes"]);return
                case "unavailable":
                    if let since=self.unavailableSince,Date().timeIntervalSince(since)>6{
                        self.finish(["message":"该篇网页只显示购买入口，已跳过。"]);return
                    }
                    if self.unavailableSince==nil{self.unavailableSince=Date()}
                case "ipClicked":
                    self.attemptedIP=true;self.resumeAfterLogin=true
                    self.status.stringValue="已请求知网 IP 登录，请核对网页上显示的机构。"
                case "home" where self.resumeAfterLogin:
                    // Let CNKI finish its own callback before leaving the landing page.
                    self.awaitingUser=true
                    self.status.stringValue="请核对知网页面上的机构名称，再点「前往目标」继续。"

                case "verify","login":
                    if state=="login"{self.resumeAfterLogin=true}
                    if !self.awaitingUser{
                        self.awaitingUser=true;(self.popups.last ?? self.window)?.makeKeyAndOrderFront(nil)
                        self.status.stringValue="请在本窗口完成平台验证或机构登录。完成后任务会自动继续；关闭窗口可停止此平台。"
                        self.owner.emit("paperStatus",["token":self.token,"message":self.status.stringValue])
                    }
                case "pdf":
                    if let raw=item["url"] as? String,let u=httpsURL(raw),self.requestedPDF.insert(u).inserted{
                        self.deadline=Date().addingTimeInterval(45);view?.load(URLRequest(url:u))
                    }
                default:
                    if self.awaitingUser{self.awaitingUser=false;self.deadline=Date().addingTimeInterval(55)}
                }
            }
            self.inspectSoon()
        }
    }
    @objc private func back(){browser.goBack()}
    @objc private func schoolLogin(){
        // Keep the same persistent login session when changing the visit's access method.
        if campus != nil {
            guard PaperSetProxy(browser.configuration.websiteDataStore,"","","") else{
                status.stringValue="无法切换机构认证网络，请在论文提供商设置中切换到学校机构登录。";return
            }
            campus?.stop();campus=nil;proxyKind=""
        }
        rememberSchoolLogin()
        openCNKIHome()

    }
    private func rememberSchoolLogin(){
        guard vendor=="cnki",mode != "sso" else{return}
        mode="sso";ipLoginPending=false
        if sessionVisit{awaitingUser=true;resumeAfterLogin=true}
        owner.emit("paperSchoolLogin",["token":token])
    }
    @objc private func signIn(){
        if sessionVisit{awaitingUser=true;resumeAfterLogin=true}
        attemptedIP=false;ipLoginPending = vendor=="cnki" && mode=="ip"
        if vendor=="cnki" && mode=="sso" && login==Self.cnkiHome{openCNKIHome();return}
        browser.load(URLRequest(url:through(login)))
    }
    private func closeLoginPopups(){
        for w in popups{w.delegate=nil;w.close()}
        popups.removeAll()
    }
    private func openCNKIHome(){
        closeLoginPopups();rejectedView=nil
        awaitingUser=sessionVisit;resumeAfterLogin=sessionVisit
        status.stringValue="首页若已显示机构名称，可直接检索。否则点「机构登录 → 校外访问」选择学校。"
        browser.load(URLRequest(url:through(Self.cnkiHome)));window?.makeKeyAndOrderFront(nil)
    }
    @objc private func goTarget(){
        closeLoginPopups();rejectedView=nil;resumeAfterLogin=false;awaitingUser=false
        if sessionVisit{deadline=Date().addingTimeInterval(60)}
        browser.load(URLRequest(url:through(catalogURL ?? (hasReturnPath && !sessionVisit ? login:target))))
    }
    @objc private func copyTarget(){NSPasteboard.general.clearContents();NSPasteboard.general.setString(target.absoluteString,forType:.string)}
    @objc private func safari(){
        guard PaperVPN.ready(service),let safe=httpsURL((vendor=="cnki" ? through(Self.cnkiHome) : through(target)).absoluteString),let app=NSWorkspace.shared.urlForApplication(withBundleIdentifier:"com.apple.Safari") else{return}
        NSWorkspace.shared.open([safe],withApplicationAt:app,configuration:NSWorkspace.OpenConfiguration())
        status.stringValue="Safari 使用自己的登录状态。下载后点击「导入已下载 PDF」。"
    }
    @objc private func importPDF(){
        let panel=NSOpenPanel();panel.prompt=InterfaceLanguage.text("打开");panel.allowedContentTypes=[.pdf];panel.title=InterfaceLanguage.text("选择要归入当前体系的论文 PDF")
        guard panel.runModal() == .OK,let url=panel.url else{return};accept(url,label:url.deletingPathExtension().lastPathComponent)
    }
    private func accept(_ file:URL,label:String){
        guard canSave,completion != nil else{return}
        do {
            var r=try PaperPDF.archive(file,folder:owner.referenceFolder)
            if (r["title"] ?? "").isEmpty {r["title"]=label.isEmpty ? "论文全文":label}
            if let page=lastPage{r["host"]=page.host ?? "";var c=URLComponents(url:page,resolvingAgainstBaseURL:false);let items=c?.queryItems?.filter{["filename","dbname","dbcode","doi","pii"].contains($0.name.lowercased())};c?.queryItems=(items?.isEmpty==false ? items:nil);c?.fragment=nil;r["articleURL"]=c?.url?.absoluteString}
            if sessionVisit{r["downloadSource"]=name+" · 平台网页"}
            finish(r)
        }catch{if sessionVisit{finish(["message":error.localizedDescription])}else{status.stringValue=error.localizedDescription}}
    }
    private func finish(_ result:[String:String]){
        guard let done=completion else{return};completion=nil;probeTimer?.invalidate();probeTimer=nil;campus?.stop();campus=nil;apiTask?.cancel();apiTask=nil
        pendingDownload?.cancel{_ in};pendingDownload=nil
        browser?.configuration.userContentController.removeScriptMessageHandler(forName:"cnkiLoginStatus",contentWorld:.defaultClient)
        if let file=downloadFile{try? FileManager.default.removeItem(at:file)};downloadFile=nil
        for w in popups{w.delegate=nil;w.close()};popups=[]
        window?.delegate=nil;window?.close();window=nil;done(result)
    }
    func windowWillClose(_ n:Notification){guard let w=n.object as? NSWindow else{return};if w===window{finish(["message":"文献访问窗口已关闭。","paused":"yes"])}else{popups.removeAll{$0===w}}}
    func webView(_ webView:WKWebView,decidePolicyFor a:WKNavigationAction,decisionHandler:@escaping(WKNavigationActionPolicy)->Void){
        let u=a.request.url
        guard PaperVPN.ready(service) else{status.stringValue="所选 VPN 已断开，请连接后继续。";decisionHandler(.cancel);return}
        let pageScript = u?.scheme=="javascript" && a.sourceFrame.securityOrigin.protocol=="https"
        let blank = u?.absoluteString.components(separatedBy:"#").first=="about:blank"
        guard u?.scheme=="https" || blank || pageScript || (u?.scheme=="blob" && canSave) else{
            decisionHandler(.cancel)
            if a.targetFrame?.isMainFrame != false{
                let message="无法打开此登录跳转，请使用学校的 HTTPS 认证入口。"
                status.stringValue=message;owner.emit("paperStatus",["token":token,"message":message])
            }
            return
        }
        decisionHandler(a.shouldPerformDownload && canSave ? .download : .allow)
    }
    func webView(_ webView:WKWebView,decidePolicyFor r:WKNavigationResponse,decisionHandler:@escaping(WKNavigationResponsePolicy)->Void){
        let resp=r.response,attachment=(resp as? HTTPURLResponse)?.value(forHTTPHeaderField:"Content-Disposition")?.lowercased() ?? ""
        if sessionVisit,r.isForMainFrame,(resp as? HTTPURLResponse)?.statusCode==429{
            decisionHandler(.cancel);finish(["message":"平台要求稍后再试（HTTP 429）。","limited":"yes"]);return
        }
        let pdf=resp.mimeType?.lowercased()=="application/pdf" || resp.suggestedFilename?.lowercased().hasSuffix(".pdf")==true
        if canSave && action != "sessionCatalog" && (pdf || attachment.contains("attachment")) {decisionHandler(.download);return}
        decisionHandler(r.canShowMIMEType ? .allow : .cancel)
    }
    func webView(_ webView:WKWebView,didCommit navigation:WKNavigation!){
        if rejectedView===webView{rejectedView=nil}
        if action != "verify",webView.url?.scheme=="https",webView.url?.host?.lowercased()=="fsso.cnki.net"{rememberSchoolLogin()}
        origin.stringValue=webView.url?.host ?? ""
    }
    func webView(_ webView:WKWebView,didFinish navigation:WKNavigation!){
        if webView===browser{
            checkSession(webView);probeTimer?.invalidate()
            probeTimer=Timer.scheduledTimer(withTimeInterval:3,repeats:true){[weak self,weak webView] timer in
                guard let self,let webView,self.completion != nil else{timer.invalidate();return};self.checkSession(webView)
            }
        }
        lastPage=webView.url;lastTitle=webView.title ?? "";origin.stringValue=webView.url?.host ?? ""
        if let popup=popups.first(where:{$0.contentView===webView}){popup.title=name+" · "+(webView.url?.host ?? "机构登录")}
        if ipLoginPending,let script=Self.pageObserver {
            webView.callAsyncJavaScript("return ("+script+")(vendor, action, mode)",arguments:["vendor":"cnki","action":"ipLogin","mode":"ip"],in:nil,in:.defaultClient){[weak self] result in
                if case .success(let raw)=result,(raw as? [String:Any])?["state"] as? String=="ipClicked"{
                    self?.ipLoginPending=false;self?.attemptedIP=true
                    self?.status.stringValue="已点击知网 IP 登录，请在网页核对识别到的机构。"
                }
            }
        }
    }
    func userContentController(_ controller:WKUserContentController,didReceive message:WKScriptMessage){
        let host=message.frameInfo.securityOrigin.host.lowercased()
        guard action != "verify",completion != nil,vendor=="cnki",message.name=="cnkiLoginStatus",
              message.body as? String=="sourceRejected",message.frameInfo.securityOrigin.protocol=="https",
              ["cnki.net","cnki.com.cn"].contains(where:{host==$0 || host.hasSuffix("."+$0)}),
              let view=message.webView,let w=view.window,rejectedView !== view else{return}
        rejectedView=view;awaitingUser=true
        let hint="知网提示「来源应用不正确(01)」。从知网首页重新进入；若首页已显示机构名称，可以直接检索。"
        status.stringValue=hint;owner.emit("paperStatus",["token":token,"message":hint])
        let alert=NSAlert()
        alert.messageText="知网未接受这次跳转";alert.informativeText=hint
        alert.addButton(withTitle:"回到知网首页")
        alert.addButton(withTitle:"留在当前页")
        if proxyKind.isEmpty{alert.addButton(withTitle:"在 Safari 打开首页")}
        alert.beginSheetModal(for:w){[weak self] choice in
            guard let self=self,self.completion != nil else{return}
            if choice == .alertFirstButtonReturn{self.openCNKIHome()}
            else if choice == .alertThirdButtonReturn{self.safari()}
        }
    }
    private func pageFailure(_ view:WKWebView,_ error:Error){
        let e=error as NSError
        guard e.code != NSURLErrorCancelled,completion != nil else{return}
        let host=(e.userInfo[NSURLErrorFailingURLErrorKey] as? URL)?.host ?? view.url?.host ?? name
        let message="无法打开 "+host+" · "+e.localizedDescription
        if action=="verify" && view===browser{finish(["state":"unknown","message":message]);return}
        status.stringValue=message;owner.emit("paperStatus",["token":token,"message":message])
        if let popup=popups.first(where:{$0.contentView===view}){popup.title=message}
    }
    func webView(_ webView:WKWebView,didFailProvisionalNavigation navigation:WKNavigation!,withError error:Error){pageFailure(webView,error)}
    func webView(_ webView:WKWebView,didFail navigation:WKNavigation!,withError error:Error){pageFailure(webView,error)}
    func webView(_ webView:WKWebView,runJavaScriptAlertPanelWithMessage message:String,initiatedByFrame frame:WKFrameInfo,completionHandler:@escaping()->Void){
        let alert=NSAlert();alert.messageText=frame.request.url?.host ?? name;alert.informativeText=message;alert.addButton(withTitle:"好")
        if let w=webView.window{alert.beginSheetModal(for:w){_ in completionHandler()}}else{completionHandler()}
    }
    func webView(_ webView:WKWebView,runJavaScriptConfirmPanelWithMessage message:String,initiatedByFrame frame:WKFrameInfo,completionHandler:@escaping(Bool)->Void){
        let alert=NSAlert();alert.messageText=frame.request.url?.host ?? name;alert.informativeText=message
        alert.addButton(withTitle:"继续");alert.addButton(withTitle:"取消")
        if let w=webView.window{alert.beginSheetModal(for:w){completionHandler($0 == .alertFirstButtonReturn)}}else{completionHandler(false)}
    }
    func webView(_ webView:WKWebView,createWebViewWith configuration:WKWebViewConfiguration,for action:WKNavigationAction,windowFeatures:WKWindowFeatures)->WKWebView?{
        let child=WKWebView(frame:.zero,configuration:configuration);child.navigationDelegate=self;child.uiDelegate=self
        let w=NSWindow(contentRect:NSRect(x:0,y:0,width:840,height:660),styleMask:[.titled,.closable,.resizable],backing:.buffered,defer:false)
        w.isReleasedWhenClosed=false;w.title=name+" · 登录与访问";w.delegate=self;w.contentView=child
        if vendor=="cnki" && sessionVisit {
            let accessory=NSTitlebarAccessoryViewController()
            accessory.view=button("前往目标",#selector(goTarget));accessory.layoutAttribute = .right
            w.addTitlebarAccessoryViewController(accessory)
        }
        popups.append(w);w.center();w.makeKeyAndOrderFront(nil);return child
    }
    func webViewDidClose(_ webView:WKWebView){popups.first(where:{$0.contentView===webView})?.close()}
    func webView(_ webView:WKWebView,navigationAction:WKNavigationAction,didBecome download:WKDownload){download.delegate=self}
    func webView(_ webView:WKWebView,navigationResponse:WKNavigationResponse,didBecome download:WKDownload){download.delegate=self}
    func download(_ download:WKDownload,decideDestinationUsing response:URLResponse,suggestedFilename:String,completionHandler:@escaping(URL?)->Void){
        guard canSave,pendingDownload==nil,PaperVPN.ready(service) else{completionHandler(nil);return}
        let file=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        pendingDownload=download;downloadFile=file
        if lastTitle.isEmpty{lastTitle=(suggestedFilename as NSString).deletingPathExtension}
        deadline=Date().addingTimeInterval(120);status.stringValue="正在下载并检查 PDF…";completionHandler(file)
    }
    func downloadDidFinish(_ download:WKDownload){
        guard download===pendingDownload,let file=downloadFile else{return}
        pendingDownload=nil;downloadFile=nil;defer{try? FileManager.default.removeItem(at:file)}
        guard PaperVPN.ready(service) else{status.stringValue="所选 VPN 已断开，请重新连接后下载。";return}
        accept(file,label:proposedTitle.isEmpty ? lastTitle:proposedTitle)
    }
    func download(_ download:WKDownload,didFailWithError error:Error,resumeData:Data?){
        if download===pendingDownload{pendingDownload=nil;if let file=downloadFile{try? FileManager.default.removeItem(at:file)};downloadFile=nil;status.stringValue="下载未完成，可在此页重试。"}
    }
}
