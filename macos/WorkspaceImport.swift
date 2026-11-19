import Cocoa
import PDFKit
import UniformTypeIdentifiers

let importTypes:Set<String>=["pdf","docx","txt","md","csv","tsv","json","tex","rtf","doc","pptx","xlsx","png","jpg","jpeg","heic","tif","tiff"]
private let fileLimit=64*1024*1024
private func visitZIP(_ url:URL,_ visit:@escaping (String,Int64)->Bool,_ consume:@escaping (String,Data)->Bool)throws{
    var error:NSError?
    guard WorkspaceZIP(url,visit,consume,&error) else{throw error ?? ServiceIssue.message("无法读取 ZIP。") as NSError}
}
private func usablePath(_ path:String)->Bool{
    !path.hasPrefix("/") && !path.contains("\\") && !path.split(separator:"/").contains(where:{$0.hasPrefix(".") || $0=="__MACOSX"})
}
private final class DocumentText:NSObject,XMLParserDelegate{
    var pieces=[String](),capture=false
    func parser(_ parser:XMLParser,didStartElement name:String,namespaceURI:String?,qualifiedName:String?,attributes:[String:String]){capture=name=="t" || name=="v"}
    func parser(_ parser:XMLParser,foundCharacters text:String){if capture{pieces.append(text)}}
    func parser(_ parser:XMLParser,didEndElement name:String,namespaceURI:String?,qualifiedName:String?){if capture{pieces.append(" ");capture=false}}
}
private final class SpreadsheetText:NSObject,XMLParserDelegate {
    let shared:[String]
    var strings=[String](),rows=[String](),cells=[String]()
    private var token="",value="",reference="",kind="",inText=false
    init(_ shared:[String]=[]){self.shared=shared}
    func parser(_ parser:XMLParser,didStartElement name:String,namespaceURI:String?,qualifiedName:String?,attributes:[String:String]){
        switch name {
        case "row":cells=[]
        case "si":value=""
        case "c":value="";reference=attributes["r"] ?? "";kind=attributes["t"] ?? ""
        case "t","v":token="";inText=true
        default:break
        }
    }
    func parser(_ parser:XMLParser,foundCharacters text:String){if inText{token+=text}}
    func parser(_ parser:XMLParser,didEndElement name:String,namespaceURI:String?,qualifiedName:String?){
        switch name {
        case "t","v":value+=token;inText=false
        case "si":strings.append(value)
        case "c":
            let display:String
            if kind=="s",let i=Int(value),shared.indices.contains(i){display=shared[i]}else{display=value}
            if !display.isEmpty{cells.append(reference+"="+display)}
        case "row":if !cells.isEmpty{rows.append(cells.joined(separator:"\t"))}
        default:break
        }
    }
}
private func officeText(_ url:URL)throws->String {
    let sheet=url.pathExtension.lowercased()=="xlsx",sharedPath="xl/sharedStrings.xml"
    let pattern=sheet ? #"^xl/worksheets/sheet[0-9]+\.xml$"# : #"^ppt/slides/slide[0-9]+\.xml$"#
    var entries=[String:Data](),size=0
    try visitZIP(url,{name,n in n>=0 && n<=16000000 && (name==sharedPath || name.range(of:pattern,options:.regularExpression) != nil)},{name,data in
        size+=data.count
        guard size<=64*1024*1024 else{return false}
        entries[name]=data;return true
    })
    var shared=[String]()
    if let data=entries.removeValue(forKey:sharedPath){
        let parser=XMLParser(data:data),reader=SpreadsheetText();parser.delegate=reader
        guard parser.parse() else{throw ServiceIssue.message("无法读取工作表。")};shared=reader.strings
    }
    var parts=[String]()
    for name in entries.keys.sorted(by:{$0.localizedStandardCompare($1) == .orderedAscending}){
        let parser=XMLParser(data:entries[name]!),body:String
        if sheet {
            let reader=SpreadsheetText(shared);parser.delegate=reader
            guard parser.parse() else{throw ServiceIssue.message("无法读取工作表。")};body=reader.rows.joined(separator:"\n")
        }else{
            let reader=DocumentText();parser.delegate=reader
            guard parser.parse() else{throw ServiceIssue.message("无法读取幻灯片。")};body=reader.pieces.joined()
        }
        if !body.isEmpty{parts.append(name+"\n"+body)}
    }
    return parts.joined(separator:"\n")
}
func workspaceText(_ url:URL)throws->String{
    switch url.pathExtension.lowercased(){
    case "pptx","xlsx":return try officeText(url)
    case "png","jpg","jpeg","heic","tif","tiff":return try recognizeLabel(url)
    case "rtf","doc":return try NSAttributedString(url:url,options:[.documentType:url.pathExtension.lowercased()=="rtf" ? NSAttributedString.DocumentType.rtf:.docFormat],documentAttributes:nil).string
    default:return try paperPages(url).joined(separator:"\n")
    }
}

final class ImportSession{
    private let lock=NSLock()
    private var stopped=false
    func stop(){lock.lock();stopped=true;lock.unlock()}
    var cancelled:Bool{lock.lock();defer{lock.unlock()};return stopped}

    let root=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    var files=[String:URL](),rows=[[String:String]](),skipped=[String](),bytes=0
    deinit{try? FileManager.default.removeItem(at:root)}
    func scan(_ selected:[URL])throws{
        let fm=FileManager.default
        try fm.createDirectory(at:root,withIntermediateDirectories:true)
        var seen=Set<URL>()
        func stage(_ path:String,_ size:Int,_ write:(URL)throws->Void)throws{
            guard usablePath(path),importTypes.contains((path as NSString).pathExtension.lowercased()) else{skipped.append(path);return}
            guard size<=fileLimit,bytes+size<=1024*1024*1024,files.count<5000 else{skipped.append(path+"（超出导入容量）");return}
            let id=UUID().uuidString,ext=(path as NSString).pathExtension.lowercased(),url=root.appendingPathComponent(id+"."+ext)
            try write(url);files[id]=url;bytes+=size;rows.append(["id":id,"path":path,"title":(path as NSString).lastPathComponent])
        }
        func ingest(_ url:URL,_ relative:String)throws{
            if cancelled{throw ServiceIssue.message("已终止导入。")}
            let values=try url.resourceValues(forKeys:[.isRegularFileKey,.isSymbolicLinkKey,.fileSizeKey])
            guard values.isRegularFile==true,values.isSymbolicLink != true,seen.insert(url.standardizedFileURL).inserted else{return}
            if url.pathExtension.lowercased()=="zip"{
                var failure:Error?
                try visitZIP(url,{name,n in
                    if self.cancelled || !usablePath(name){return false}
                    guard n>=0,n<=fileLimit,self.bytes+Int(n)<=1024*1024*1024,self.files.count<5000,importTypes.contains((name as NSString).pathExtension.lowercased()) else{self.skipped.append(relative+"/"+name);return false};return true
                },{name,data in do{try stage(relative+"/"+name,data.count){try data.write(to:$0)};return true}catch{failure=error;return false}})
                if let failure{throw failure}
            }else{try stage(relative,values.fileSize ?? 0){try fm.copyItem(at:url,to:$0)}}
        }
        for url in selected{
            if (try? url.resourceValues(forKeys:[.isDirectoryKey]).isDirectory)==true{
                guard let en=fm.enumerator(at:url,includingPropertiesForKeys:[.isRegularFileKey,.isSymbolicLinkKey,.fileSizeKey],options:[.skipsHiddenFiles,.skipsPackageDescendants]) else{skipped.append(url.lastPathComponent);continue}
                for case let child as URL in en{try ingest(child,url.lastPathComponent+"/"+String(child.path.dropFirst(url.path.count+1)))}
            }else{try ingest(url,url.lastPathComponent)}
        }
    }
}
extension Workspace{
    func importRPC(_ op:String,_ msg:[String:Any],_ request:String)throws{
        func reply(_ value:Any){emit("batchRPC",["requestID":request,"value":value])}
        if op=="chooseWorkspace"{
            let panel=NSOpenPanel();panel.prompt=InterfaceLanguage.text("打开");panel.canChooseDirectories=true;panel.canChooseFiles=true;panel.allowsMultipleSelection=true;panel.allowedContentTypes=[.folder,.zip];panel.title=InterfaceLanguage.text("选择已有课题的文件夹或 ZIP 压缩包")
            guard panel.runModal() == .OK else{reply(["cancelled":true]);return}
            let selected=panel.urls,session=ImportSession(),id=UUID().uuidString;importSessions["scan."+request]=session
            DispatchQueue.global(qos:.userInitiated).async{
                do{try session.scan(selected);DispatchQueue.main.async{self.importSessions.removeValue(forKey:"scan."+request);if session.cancelled{reply(["cancelled":true]);return};self.importSessions[id]=session;reply(["session":id,"files":session.rows,"skipped":session.skipped,"name":selected.first?.deletingPathExtension().lastPathComponent ?? ""])}}catch{DispatchQueue.main.async{self.importSessions.removeValue(forKey:"scan."+request);self.emit("batchRPC",["requestID":request,"error":error.localizedDescription])}}
            };return
        }
        guard let key=msg["session"] as? String,let s=importSessions[key] else{throw ServiceIssue.message("导入会话已关闭，请重新选择资料。")}
        if op=="discardWorkspace"{importSessions.removeValue(forKey:key);reply(true);return}
        if op=="commitWorkspace"{
            let ids=msg["ids"] as? [String] ?? [];var result=[String:String](),copied=[URL]()
            try FileManager.default.createDirectory(at:referenceFolder,withIntermediateDirectories:true)
            do{for id in Set(ids){guard let src=s.files[id] else{throw ServiceIssue.message("导入文件已变化。")}
                let filename=src.lastPathComponent,url=try referenceURL(filename,in:referenceFolder)
                if !FileManager.default.fileExists(atPath:url.path){try FileManager.default.copyItem(at:src,to:url);copied.append(url)};result[id]=filename
            }}catch{for url in copied{try? FileManager.default.removeItem(at:url)};throw error}
            reply(result);return
        }
        guard let id=msg["id"] as? String,let file=s.files[id] else{throw ServiceIssue.message("未找到导入文件。")}
        DispatchQueue.global(qos:.userInitiated).async{do{let text=try workspaceText(file);DispatchQueue.main.async{reply(text)}}catch{DispatchQueue.main.async{self.emit("batchRPC",["requestID":request,"error":error.localizedDescription])}}}
    }
}
