import Cocoa
import CoreText
import ImageIO

func writeProjectPDF(_ msg:[String:Any],to url:URL)throws{
    let bytes=NSMutableData()
    var bounds=CGRect(x:0,y:0,width:595,height:842)
    guard let consumer=CGDataConsumer(data:bytes),let pdf=CGContext(consumer:consumer,mediaBox:&bounds,nil) else{throw ServiceIssue.message("无法创建 PDF。")}
    let text=NSMutableAttributedString(),area=CGRect(x:48,y:52,width:499,height:738)
    var page=0
    func begin(){
        page+=1;pdf.beginPDFPage(nil);pdf.textMatrix = .identity
        let footer=NSAttributedString(string:String(page),attributes:[.font:NSFont.systemFont(ofSize:9)])
        pdf.textPosition=CGPoint(x:290,y:26);CTLineDraw(CTLineCreateWithAttributedString(footer),pdf)
    }
    func flush()throws{
        guard text.length>0 else{return}
        let setter=CTFramesetterCreateWithAttributedString(text),path=CGPath(rect:area,transform:nil)
        var offset=0
        while offset<text.length{
            let frame=CTFramesetterCreateFrame(setter,CFRange(location:offset,length:0),path,nil),range=CTFrameGetVisibleStringRange(frame)
            guard range.length>0 else{throw ServiceIssue.message("PDF 分页失败。")}
            begin();CTFrameDraw(frame,pdf);pdf.endPDFPage();offset+=range.length
        }
        text.mutableString.setString("")
    }
    let images=msg["images"] as? [[String:Any]] ?? []
    for row in msg["paragraphs"] as? [[String:Any]] ?? []{
        if let i=row["image"] as? Int,i>0,i<=images.count,let raw=images[i-1]["data"] as? String,let data=Data(base64Encoded:raw),let src=CGImageSourceCreateWithData(data as CFData,nil),let image=CGImageSourceCreateImageAtIndex(src,0,nil){
            try flush();begin();let scale=min(area.width/CGFloat(image.width),area.height/CGFloat(image.height))
            pdf.draw(image,in:CGRect(x:area.minX,y:area.maxY-CGFloat(image.height)*scale,width:CGFloat(image.width)*scale,height:CGFloat(image.height)*scale));pdf.endPDFPage();continue
        }
        let style=row["style"] as? String ?? "",heading=style=="Title" || style.hasPrefix("Heading")
        let font=NSFont.systemFont(ofSize:style=="Title" ? 22:heading ? 15:11,weight:heading ? .semibold:.regular)
        let paragraph=NSMutableParagraphStyle();paragraph.lineSpacing=3;paragraph.paragraphSpacing=7
        let content=(row["runs"] as? [[String:Any]] ?? []).map{run in
            if let note=run["footnote"] as? Int{return "[\(note)]"}
            return run["text"] as? String ?? ""
        }.joined()
        text.append(NSAttributedString(string:content+"\n",attributes:[.font:font,.paragraphStyle:paragraph,.foregroundColor:NSColor.black]))
    }
    if let notes=msg["notes"] as? [String],!notes.isEmpty{
        text.append(NSAttributedString(string:"\n"+InterfaceLanguage.text("注释")+"\n",attributes:[.font:NSFont.boldSystemFont(ofSize:14)]))
        for (i,note) in notes.enumerated(){text.append(NSAttributedString(string:"[\(i+1)] "+note+"\n",attributes:[.font:NSFont.systemFont(ofSize:10)]))}
    }
    try flush();pdf.closePDF();guard page>0 else{throw ServiceIssue.message("没有可导出的内容。")}
    try (bytes as Data).write(to:url,options:.atomic)
}
