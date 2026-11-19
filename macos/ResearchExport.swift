import Cocoa
import UniformTypeIdentifiers

private func xmlText(_ text:String)->String {
    String(text.unicodeScalars.filter{$0.value>=32 || [9,10,13].contains($0.value)})
        .replacingOccurrences(of:"&",with:"&amp;").replacingOccurrences(of:"<",with:"&lt;").replacingOccurrences(of:">",with:"&gt;")
}
private let wordNS="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
private let officeRel="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
func writeResearchWord(_ msg:[String:Any],to dest:URL)throws {
    let fm=FileManager.default,base=fm.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try fm.createDirectory(at:base,withIntermediateDirectories:true)
    defer{try? fm.removeItem(at:base)}
    func write(_ name:String,_ content:String)throws{
        let url=base.appendingPathComponent(name);try fm.createDirectory(at:url.deletingLastPathComponent(),withIntermediateDirectories:true)
        try ("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"+content).write(to:url,atomically:true,encoding:.utf8)
    }
    let paragraphs=msg["paragraphs"] as? [[String:Any]] ?? [],notes=msg["notes"] as? [String] ?? [],images=msg["images"] as? [[String:Any]] ?? []
    guard !paragraphs.isEmpty else{throw ServiceIssue.message("稿件正文为空。")}
    var doc="",rels="",foot="<w:footnote w:type=\"separator\" w:id=\"-1\"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:type=\"continuationSeparator\" w:id=\"0\"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>"
    let two=msg["columns"] as? Int==2,w=two ? 2857500:5715000,font=msg["font"] as? String=="sans" ? "Arial":"Times New Roman"
    for (i,n) in notes.enumerated(){foot+="<w:footnote w:id=\"\(i+1)\"><w:p><w:r><w:rPr><w:vertAlign w:val=\"superscript\"/></w:rPr><w:footnoteRef/></w:r><w:r><w:t xml:space=\"preserve\"> \(xmlText(n))</w:t></w:r></w:p></w:footnote>"}
    for (i,bytes) in images.enumerated(){
        guard let png=Data(base64Encoded:bytes["data"] as? String ?? ""),png.starts(with:[137,80,78,71]) else{throw ServiceIssue.message("图像数据无效。")}
        let url=base.appendingPathComponent("word/media/image\(i+1).png");try fm.createDirectory(at:url.deletingLastPathComponent(),withIntermediateDirectories:true);try png.write(to:url)
        rels+="<Relationship Id=\"img\(i+1)\" Type=\"\(officeRel)/image\" Target=\"media/image\(i+1).png\"/>"
    }
    for p in paragraphs{
        if let id=p["image"] as? Int,(1...max(1,images.count)).contains(id),id<=images.count{
            let pixels=images[id-1],h=Int(Double(w)*Double(pixels["height"] as? Int ?? 236)/Double(max(1,pixels["width"] as? Int ?? 610)))
            doc+="<w:p><w:r><w:drawing><wp:inline><wp:extent cx=\"\(w)\" cy=\"\(h)\"/><wp:docPr id=\"\(id)\" name=\"Figure \(id)\"/><a:graphic><a:graphicData uri=\"http://schemas.openxmlformats.org/drawingml/2006/picture\"><pic:pic><pic:nvPicPr><pic:cNvPr id=\"\(id)\" name=\"Figure \(id)\"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed=\"img\(id)\"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"\(w)\" cy=\"\(h)\"/></a:xfrm><a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>"
            continue
        }
        let style=p["style"] as? String ?? "",bold=["Title","Heading1","Heading2"].contains(style),size=style=="Title" ? 36:style=="Heading1" ? 28:style=="Heading2" ? 24:style=="Small" ? 19:22
        let outline=style=="Heading1" ? "<w:outlineLvl w:val=\"0\"/>":style=="Heading2" ? "<w:outlineLvl w:val=\"1\"/>":""
        doc+="<w:p><w:pPr><w:spacing w:after=\"120\"/>"+outline+"</w:pPr>"
        for run in p["runs"] as? [[String:Any]] ?? []{
            let sup=run["sup"] as? Bool==true || run["footnote"] != nil
            doc+="<w:r><w:rPr><w:rFonts w:ascii=\"\(font)\" w:hAnsi=\"\(font)\" w:eastAsia=\"宋体\"/>"+(bold ? "<w:b/>":"")+"<w:sz w:val=\"\(size)\"/>"+(sup ? "<w:vertAlign w:val=\"superscript\"/>":"")+"</w:rPr>"
            if let n=run["footnote"] as? Int,n>0,n<=notes.count{doc+="<w:footnoteReference w:id=\"\(n)\"/>"}else{doc+="<w:t xml:space=\"preserve\">"+xmlText(run["text"] as? String ?? "")+"</w:t>"}
            doc+="</w:r>"
        };doc+="</w:p>"
    }
    let relNS="http://schemas.openxmlformats.org/package/2006/relationships"
    try write("[Content_Types].xml","<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Default Extension=\"png\" ContentType=\"image/png\"/><Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/><Override PartName=\"/word/footnotes.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml\"/></Types>")
    try write("_rels/.rels","<Relationships xmlns=\"\(relNS)\"><Relationship Id=\"doc\" Type=\"\(officeRel)/officeDocument\" Target=\"word/document.xml\"/></Relationships>")
    try write("word/document.xml","<w:document xmlns:w=\"\(wordNS)\" xmlns:r=\"\(officeRel)\" xmlns:wp=\"http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing\" xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" xmlns:pic=\"http://schemas.openxmlformats.org/drawingml/2006/picture\"><w:body>\(doc)<w:sectPr><w:pgSz w:w=\"11906\" w:h=\"16838\"/><w:pgMar w:top=\"1440\" w:bottom=\"1440\" w:left=\"1440\" w:right=\"1440\"/><w:cols w:num=\"\(two ? 2:1)\" w:space=\"480\"/></w:sectPr></w:body></w:document>")
    try write("word/footnotes.xml","<w:footnotes xmlns:w=\"\(wordNS)\">\(foot)</w:footnotes>")
    try write("word/_rels/document.xml.rels","<Relationships xmlns=\"\(relNS)\">\(rels)<Relationship Id=\"notes\" Type=\"\(officeRel)/footnotes\" Target=\"footnotes.xml\"/></Relationships>")
    let tmp=base.appendingPathComponent("output.zip"),zip=Process();zip.executableURL=URL(fileURLWithPath:"/usr/bin/zip");zip.currentDirectoryURL=base
    zip.arguments=["-qr",tmp.path,"[Content_Types].xml","_rels","word"];try zip.run();zip.waitUntilExit()
    guard zip.terminationStatus==0 else{throw ServiceIssue.message("Word 文件打包失败。")};try Data(contentsOf:tmp).write(to:dest,options:.atomic)
}
extension Workspace{
    func exportResearch(_ msg:[String:Any])throws{
        let word=msg["format"] as? String=="docx",panel=NSSavePanel(),ext=msg["format"] as? String=="pdf" ? "pdf":word ? "docx":(msg["format"] as? String=="pptx" ? "pptx":"html")
        let name=(msg["name"] as? String ?? "研究报告").replacingOccurrences(of:"/",with:"-")
        panel.prompt=InterfaceLanguage.text("保存");panel.nameFieldStringValue=String(name.prefix(110))+"."+ext;panel.allowedContentTypes=[UTType(filenameExtension:ext)!]
        guard panel.runModal() == .OK,let url=panel.url else{return}
        if ext=="pdf"{try writeProjectPDF(msg,to:url)}else if ext=="pptx"{try renderReport(msg,to:url)}else if word,let raw=msg["templateDocument"] as? String,!raw.isEmpty,let bytes=Data(base64Encoded:raw){try writeTemplatedThesis(msg,template:bytes,to:url)}else if word{try writeResearchWord(msg,to:url)}else if let html=msg["html"] as? String {try html.write(to:url,atomically:true,encoding:.utf8)}
        emit("providerNotice","已导出 "+url.lastPathComponent)
    }
}

private func archiveCommand(_ executable:String,_ args:[String],in folder:URL)throws {
    let process=Process();process.executableURL=URL(fileURLWithPath:executable);process.arguments=args;process.currentDirectoryURL=folder
    try process.run();process.waitUntilExit()
    guard process.terminationStatus==0 else{throw ServiceIssue.message("Office 文件处理失败。")}
}
func writeReportDeck(_ slides:[[String:Any]],appearance:[String:Any]=[:],template:URL,to destination:URL)throws{
    let fm=FileManager.default,dir=fm.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    guard !slides.isEmpty else{throw ServiceIssue.message("汇报没有幻灯片。")}
    try fm.createDirectory(at:dir,withIntermediateDirectories:true);defer{try? fm.removeItem(at:dir)}
    try archiveCommand("/usr/bin/unzip",["-q",template.path],in:dir)
    func url(_ name:String)->URL{dir.appendingPathComponent(name)}
    let base=try String(contentsOf:url("ppt/slides/slide1.xml"),encoding:.utf8)
    let input=appearance["accent"] as? String ?? "",accent=input.range(of:"^[A-Fa-f0-9]{6}$",options:.regularExpression) != nil ? input:"205946"
    let size=max(18,min(30,appearance["fontSize"] as? Int ?? 24))*100
    var ids="",relationships="",types=""
    for (index,item) in slides.enumerated(){
        let n=index+1,title=xmlText(item["title"] as? String ?? ""),points=item["points"] as? [String] ?? []
        let paragraphs=points.map{"<a:p><a:pPr><a:spcAft><a:spcPts val=\"1000\"/></a:spcAft></a:pPr><a:r><a:rPr sz=\"\(size)\"/><a:t>"+xmlText($0)+"</a:t></a:r></a:p>"}.joined()
        let xml=base.replacingOccurrences(of:"val=\"205946\"",with:"val=\"\(accent)\"").replacingOccurrences(of:"<a:p><a:r><a:t>WORKSPACE_POINT</a:t></a:r></a:p>",with:paragraphs).replacingOccurrences(of:"<a:t>WORKSPACE_TITLE</a:t>",with:"<a:rPr sz=\"3400\" b=\"1\"><a:solidFill><a:srgbClr val=\"\(accent)\"/></a:solidFill></a:rPr><a:t>"+title+"</a:t>")
        try xml.write(to:url("ppt/slides/slide\(n).xml"),atomically:true,encoding:.utf8)
        if n>1{
            try fm.copyItem(at:url("ppt/slides/_rels/slide1.xml.rels"),to:url("ppt/slides/_rels/slide\(n).xml.rels"))
            ids+="<p:sldId id=\"\(255+n)\" r:id=\"slide\(n)\"/>"
            relationships+="<Relationship Id=\"slide\(n)\" Type=\"\(officeRel)/slide\" Target=\"slides/slide\(n).xml\"/>"
            types+="<Override PartName=\"/ppt/slides/slide\(n).xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.slide+xml\"/>"
        }
    }
    for (path,end,addition) in [("ppt/presentation.xml","</p:sldIdLst>",ids),("ppt/_rels/presentation.xml.rels","</Relationships>",relationships),("[Content_Types].xml","</Types>",types)]{
        let file=url(path),str=try String(contentsOf:file,encoding:.utf8)
        try str.replacingOccurrences(of:end,with:addition+end).write(to:file,atomically:true,encoding:.utf8)
    }
    let packed=url("deck.zip");try archiveCommand("/usr/bin/zip",["-qr",packed.path,"[Content_Types].xml","_rels","ppt","docProps"],in:dir)
    try Data(contentsOf:packed).write(to:destination,options:.atomic)
}

extension Workspace{
    func pickThesisTemplate(_ id:String)throws{
        let panel=NSOpenPanel();panel.prompt=InterfaceLanguage.text("打开");panel.allowedContentTypes=["docx","txt","md"].compactMap{UTType(filenameExtension:$0)}
        guard panel.runModal() == .OK,let url=panel.url else{emit("batchRPC",["requestID":id,"value":["cancelled":true]] as [String:Any]);return}
        let bytes=try Data(contentsOf:url),docx=url.pathExtension.lowercased()=="docx"
        let text=docx ? try NSAttributedString(data:bytes,options:[.documentType:NSAttributedString.DocumentType.officeOpenXML],documentAttributes:nil).string : String(decoding:bytes,as:UTF8.self)
        emit("batchRPC",["requestID":id,"value":["name":url.lastPathComponent,"text":String(text.prefix(40000)),"document":docx ? bytes.base64EncodedString():""]] as [String:Any])
    }
}

func writeTemplatedThesis(_ msg:[String:Any],template:Data,to destination:URL)throws{
    let fm=FileManager.default,dir=fm.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let part=dir.appendingPathComponent("word/document.xml"),archive=dir.appendingPathComponent("thesis.docx")
    try fm.createDirectory(at:part.deletingLastPathComponent(),withIntermediateDirectories:true)
    defer{try? fm.removeItem(at:dir)}
    try template.write(to:archive);fm.createFile(atPath:part.path,contents:nil)
    let handle=try FileHandle(forWritingTo:part),unzip=Process()
    unzip.executableURL=URL(fileURLWithPath:"/usr/bin/unzip");unzip.arguments=["-p",archive.path,"word/document.xml"];unzip.standardOutput=handle
    try unzip.run();unzip.waitUntilExit();try handle.close()
    guard unzip.terminationStatus==0 else{throw ServiceIssue.message("Word 模板无法读取。")}
    let document=try XMLDocument(contentsOf:part,options:.nodePreserveAll)
    guard let body=try document.nodes(forXPath:"/*[local-name()='document']/*[local-name()='body']").first as? XMLElement else{throw ServiceIssue.message("Word 模板缺少正文。")}
    let page=body.children?.last(where:{$0.localName=="sectPr"});page?.detach()
    for node in body.children ?? []{node.detach()}
    for p in msg["paragraphs"] as? [[String:Any]] ?? []{
        let style=p["style"] as? String ?? "Normal",content=(p["runs"] as? [[String:Any]] ?? []).compactMap{$0["text"] as? String}.joined()
        let safeStyle=["Title","Heading1","Heading2","Normal"].contains(style) ? style:"Normal"
        let xml="<w:p xmlns:w=\"\(wordNS)\"><w:pPr><w:pStyle w:val=\"\(safeStyle)\"/></w:pPr><w:r><w:t xml:space=\"preserve\">\(xmlText(content))</w:t></w:r></w:p>"
        body.addChild(try XMLElement(xmlString:xml))
    }
    if let page{body.addChild(page)}
    try document.xmlData.write(to:part)
    try archiveCommand("/usr/bin/zip",["-q",archive.path,"word/document.xml"],in:dir)
    try Data(contentsOf:archive).write(to:destination,options:.atomic)
}
