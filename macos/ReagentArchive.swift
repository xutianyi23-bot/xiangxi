import AppKit
import ImageIO
import Vision
import UniformTypeIdentifiers

private let labelImages = ["png","jpg","jpeg","heic","heif","tif","tiff","bmp"]
private let labelAudio = ["m4a","mp3","wav","aiff","aif","caf","mp4","aac"]

private let labelQueue:OperationQueue = {
    let queue=OperationQueue();queue.maxConcurrentOperationCount=2;queue.qualityOfService = .userInitiated
    return queue
}()

func reagentImages(in selection:[URL])->[URL]{
    var seen=Set<URL>(),images=[URL]()
    func add(_ url:URL){
        guard labelImages.contains(url.pathExtension.lowercased()),(try? url.resourceValues(forKeys:[.isRegularFileKey]).isRegularFile)==true else{return}
        if seen.insert(url.resolvingSymlinksInPath().standardizedFileURL).inserted{images.append(url)}
    }
    for url in selection {
        if (try? url.resourceValues(forKeys:[.isDirectoryKey]).isDirectory)==true{
            if let files=FileManager.default.enumerator(at:url,includingPropertiesForKeys:[.isRegularFileKey],options:[.skipsHiddenFiles,.skipsPackageDescendants]){
                for case let file as URL in files{add(file)}
            }
        }else{add(url)}
    }
    return images.sorted{$0.path.localizedStandardCompare($1.path) == .orderedAscending}
}

func recognizeLabel(_ url: URL) throws -> String {
    let request=VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages=["zh-Hans","en-US"]
    request.usesLanguageCorrection=false
    guard let src=CGImageSourceCreateWithURL(url as CFURL,nil) else {throw ServiceIssue.message("无法打开此图片。")}
    let options:[CFString:Any]=[kCGImageSourceCreateThumbnailFromImageAlways:true,kCGImageSourceCreateThumbnailWithTransform:true,kCGImageSourceThumbnailMaxPixelSize:4600]
    guard let image=CGImageSourceCreateThumbnailAtIndex(src,0,options as CFDictionary) else {throw ServiceIssue.message("无法读取标签图片。")}
    return try labelText(image,request)
}

private func labelText(_ image:CGImage,_ request:VNRecognizeTextRequest) throws -> String {
    try VNImageRequestHandler(cgImage:image).perform([request])
    let text=(request.results ?? []).compactMap{$0.topCandidates(1).first?.string}.joined(separator:"\n")
    guard !text.isEmpty else {throw ServiceIssue.message("未识别到标签文字，可以手动填写。")}
    return text
}

extension Workspace {
    private func emitReagentRPC(_ id:String,_ result:[String:Any]){
        DispatchQueue.main.async{self.cancellableRequests.removeValue(forKey:id);self.emit("batchRPC",result.merging(["requestID":id]){_,v in v})}
    }
    func reagentFile(_ name:String)throws->URL {
        let path=name as NSString
        guard path.lastPathComponent==name,UUID(uuidString:path.deletingPathExtension) != nil,
              (labelImages+labelAudio).contains(path.pathExtension.lowercased()) else {throw ServiceIssue.message("试剂附件名称无效。")}
        return dataFolder.appendingPathComponent("Reagents",isDirectory:true).appendingPathComponent(name)
    }
    func reagentAction(_ op:String,_ msg:[String:Any]) throws {
        let context=msg.filter{["project","system","id"].contains($0.key)}
        func reply(_ event:String,_ result:[String:Any]){
            DispatchQueue.main.async {self.emit(event,context.merging(result){_,new in new})}
        }
        if op=="importReagent" {
            let image=msg["kind"] as? String=="image",panel=NSOpenPanel()
            panel.title=InterfaceLanguage.text(image ? "选择试剂照片或文件夹（可多选）":"选择试剂录音")
            panel.allowsMultipleSelection=image;panel.canChooseDirectories=image;panel.canChooseFiles=true
            panel.allowedContentTypes=(image ? labelImages:labelAudio).compactMap{UTType(filenameExtension:$0)}+(image ? [.folder]:[])
            guard panel.runModal() == .OK else{return}
            let selected=panel.urls
            DispatchQueue.global(qos:.userInitiated).async{
                let files=image ? reagentImages(in:selected):selected
                if files.isEmpty{DispatchQueue.main.async{self.emit("providerNotice","没有找到支持的试剂图片。")};return}
                var items=[[String:Any]]()
                for src in files{
                    let key=UUID().uuidString,name=key+"."+src.pathExtension.lowercased()
                    do{
                        let dst=try self.reagentFile(name)
                        try FileManager.default.createDirectory(at:dst.deletingLastPathComponent(),withIntermediateDirectories:true)
                        try FileManager.default.copyItem(at:src,to:dst)
                        items.append(["id":key,"file":name,"title":src.lastPathComponent])
                    }catch{items.append(["id":key,"title":src.lastPathComponent,"error":error.localizedDescription])}
                }
                reply("reagentFiles",["items":items])
            }
            return
        }
        if op=="readReagentPhoto",let request=msg["requestID"] as? String {
            let file=try reagentFile(msg["file"] as? String ?? "")
            guard labelImages.contains(file.pathExtension.lowercased()) else{throw ServiceIssue.message("请选择试剂照片。")}
            let vision=msg["vision"] as? Bool==true
            let stop=ModelCancellation();cancellableRequests[request]=stop
            labelQueue.addOperation {
                do{
                    if stop.isCancelled{throw CancellationError()}
                    let value:String
                    if vision{value=try reagentPhotoJPEG(file,cancel:stop)}
                    else{
                        let image=try reagentPhotoPixels(file,maxSize:3200,cancel:stop)
                        let ocr=VNRecognizeTextRequest();ocr.recognitionLevel = .accurate
                        ocr.recognitionLanguages=["zh-Hans","en-US"];ocr.usesLanguageCorrection=false
                        stop.attach{ocr.cancel()}
                        if stop.isCancelled{throw CancellationError()}
                        value=try labelText(image,ocr)
                    }
                    self.emitReagentRPC(request,["value":value])
                }catch{self.emitReagentRPC(request,["error":error.localizedDescription])}
            }
            return
        }
        if op=="openReagentFile" {
            guard NSWorkspace.shared.open(try reagentFile(msg["file"] as? String ?? "")) else {throw ServiceIssue.message("无法打开试剂附件。")}
            return
        }
        do {
            let file=try reagentFile(msg["file"] as? String ?? "")
            if labelImages.contains(file.pathExtension) {
                labelQueue.addOperation {
                    do {reply("reagentRecognized",["text":try recognizeLabel(file)])}
                    catch {reply("reagentRecognized",["error":error.localizedDescription])}
                }
            } else {
                guard transcription==nil else {throw ServiceIssue.message("另一个录音正在识别，可稍后重新识别。")}
                let job=MeetingTranscription();transcription=job
                job.run(file){text,error in self.transcription=nil;reply("reagentRecognized",["text":text,"error":error])}
            }
        }catch{reply("reagentRecognized",["error":error.localizedDescription])}
    }
}
