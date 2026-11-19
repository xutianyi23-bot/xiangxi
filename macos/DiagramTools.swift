// Copyright © 2026 徐天翼（笔名：鸡腿堡）
// SPDX-License-Identifier: GPL-3.0-only
import Cocoa
import ImageIO
import UniformTypeIdentifiers

final class ModelCancellation {
    private let lock=NSLock()
    private var stopped=false
    private var operation:(()->Void)?
    var isCancelled:Bool {lock.lock();defer{lock.unlock()};return stopped}
    func attach(_ cancel:@escaping ()->Void){
        lock.lock();let already=stopped;if !already{operation=cancel};lock.unlock()
        if already{cancel()}
    }
    func cancel(){lock.lock();stopped=true;let f=operation;operation=nil;lock.unlock();f?()}
}

extension Workspace {
    func diagramImage(_ id:String)throws{
        let panel=NSOpenPanel();panel.allowedContentTypes=[.image];panel.allowsMultipleSelection=false
        guard panel.runModal() == .OK,let url=panel.url else{emit("batchRPC",["requestID":id,"value":NSNull()] as [String:Any]);return}
        let options:[CFString:Any]=[kCGImageSourceCreateThumbnailFromImageAlways:true,kCGImageSourceCreateThumbnailWithTransform:true,kCGImageSourceThumbnailMaxPixelSize:2400]
        guard let src=CGImageSourceCreateWithURL(url as CFURL,nil),let cg=CGImageSourceCreateThumbnailAtIndex(src,0,options as CFDictionary),
              let jpeg=NSBitmapImageRep(cgImage:cg).representation(using:.jpeg,properties:[.compressionFactor:0.88]) else{throw ServiceIssue.message("手稿图片无法读取。")}
        emit("batchRPC",["requestID":id,"value":["name":url.lastPathComponent,"jpeg":jpeg.base64EncodedString()] as [String:String]] as [String:Any])
    }
    func exportFigure(_ msg:[String:Any])throws{
        guard let format=msg["format"] as? String,["svg","drawio"].contains(format),
              let body=msg["body"] as? String,body.hasPrefix(format=="svg" ? "<svg":"<mxfile") else{throw ServiceIssue.message("图稿格式无效。")}
        let title=(msg["title"] as? String ?? "TOC").components(separatedBy:CharacterSet(charactersIn:"/:").union(.controlCharacters)).joined(separator:"-")
        let panel=NSSavePanel()
        panel.allowedContentTypes=[format=="svg" ? .svg:(UTType(filenameExtension:"drawio") ?? .xml)]
        panel.nameFieldStringValue=String(title.prefix(80))+"."+format
        if panel.runModal() == .OK,let url=panel.url{try body.write(to:url,atomically:true,encoding:.utf8)}
    }
    func exportDiagram(_ msg:[String:Any])throws{
        guard let svg=msg["svg"] as? String,svg.hasPrefix("<svg") else{return}
        let panel=NSSavePanel();panel.allowedContentTypes=[.svg];panel.nameFieldStringValue="研究绘图.svg"
        if panel.runModal() == .OK,let url=panel.url{try svg.write(to:url,atomically:true,encoding:.utf8)}
    }
}
