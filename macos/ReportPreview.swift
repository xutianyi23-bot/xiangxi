// Copyright © 2026 徐天翼（笔名：鸡腿堡）
// SPDX-License-Identifier: GPL-3.0-only
import Cocoa
import Quartz
import UniformTypeIdentifiers

// Xcode's system shim may not have an installed interpreter. Prefer an explicit installation.
func researchPython() throws -> URL {
    for p in ["/opt/homebrew/bin/python3","/usr/local/bin/python3","/usr/bin/python3"] where FileManager.default.isExecutableFile(atPath:p){return URL(fileURLWithPath:p)}
    throw ServiceIssue.message("请安装 Python 3 以使用此功能。")
}
func runResource(_ name:String,_ args:[String],_ input:Data)throws->Data{
    guard let script=Bundle.main.url(forResource:name,withExtension:"py") else{throw ServiceIssue.message("缺少处理组件。")}
    let p=Process(),pipe=Pipe(),out=Pipe(),err=Pipe()
    p.executableURL=try researchPython();p.arguments=["-I",script.path]+args;p.standardInput=pipe;p.standardOutput=out;p.standardError=err
    try p.run()
    DispatchQueue.global().async{try? pipe.fileHandleForWriting.write(contentsOf:input);try? pipe.fileHandleForWriting.close()}
    let result=out.fileHandleForReading.readDataToEndOfFile(),error=err.fileHandleForReading.readDataToEndOfFile();p.waitUntilExit()
    guard p.terminationStatus==0 else{throw ServiceIssue.message(String(decoding:error.prefix(1000),as:UTF8.self))}
    return result
}
extension Workspace {
    func reportURL(_ name:String)throws->URL{
        let file=name as NSString
        guard file.lastPathComponent==name,file.pathExtension=="pptx",UUID(uuidString:file.deletingPathExtension) != nil else{throw ServiceIssue.message("汇报模板文件名无效。")}
        return dataFolder.appendingPathComponent("DeckTemplates").appendingPathComponent(name)
    }
    func pickDeckTemplate(_ id:String)throws{
        let panel=NSOpenPanel();panel.allowedFileTypes=["pptx","potx"]
        guard panel.runModal() == .OK,let src=panel.url else{emit("batchRPC",["requestID":id,"value":NSNull()] as [String:Any]);return}
        guard (try src.resourceValues(forKeys:[.fileSizeKey]).fileSize ?? 0)<32_000_000 else{throw ServiceIssue.message("请选择小于 32 MB 的模板。")}
        let name=UUID().uuidString+".pptx",dest=try reportURL(name)
        let test=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString+".pptx")
        defer{try? FileManager.default.removeItem(at:test)}
        _=try runResource("template_deck",[src.path,test.path],JSONSerialization.data(withJSONObject:[["title":"标题","points":["正文"]]]))
        try FileManager.default.createDirectory(at:dest.deletingLastPathComponent(),withIntermediateDirectories:true);try FileManager.default.copyItem(at:src,to:dest)
        emit("batchRPC",["requestID":id,"value":["name":src.lastPathComponent,"file":name]] as [String:Any])
    }
    func renderReport(_ msg:[String:Any],to url:URL)throws{
        let slides=msg["slides"] as? [[String:Any]] ?? []
        if let file=msg["templateFile"] as? String,!file.isEmpty {
            let tmp=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString+".pptx")
            defer{try? FileManager.default.removeItem(at:tmp)}
            _=try runResource("template_deck",[try reportURL(file).path,tmp.path],JSONSerialization.data(withJSONObject:slides))
            try Data(contentsOf:tmp).write(to:url,options:.atomic);return
        }
        guard let base=Bundle.main.url(forResource:"ReportBase",withExtension:"pptx") else{throw ServiceIssue.message("缺少汇报版式。")}
        try writeReportDeck(slides,appearance:msg["appearance"] as? [String:Any] ?? [:],template:base,to:url)
    }
    func windowWillClose(_ note:Notification){
        guard let w=note.object as? NSWindow,let u=reportPreviews.removeValue(forKey:ObjectIdentifier(w)) else{return}
        reportWindows.removeAll{$0===w};try? FileManager.default.removeItem(at:u)
    }
    func previewReport(_ msg:[String:Any])throws{
        let u=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString+".pptx")
        try renderReport(msg,to:u)
        let rect=NSRect(x:0,y:0,width:890,height:560)
        let w=NSWindow(contentRect:rect,styleMask:[.titled,.closable,.resizable],backing:.buffered,defer:false)
        guard let preview=QLPreviewView(frame:rect,style:.normal) else{throw ServiceIssue.message("系统预览不可用。")}
        preview.previewItem=u as NSURL;preview.autostarts=true;w.contentView=preview;w.title=msg["name"] as? String ?? "汇报预览";w.isReleasedWhenClosed=false
        w.delegate=self;reportPreviews[ObjectIdentifier(w)]=u
        reportWindows.append(w);w.center();w.makeKeyAndOrderFront(nil)
    }
}
