// Copyright © 2026 徐天翼（笔名：鸡腿堡）
// SPDX-License-Identifier: GPL-3.0-only
import Cocoa
import ImageIO
import UniformTypeIdentifiers

private func labelPixels(_ url:URL,_ maxSize:Int)->CGImage? {
    guard let source=CGImageSourceCreateWithURL(url as CFURL,nil) else{return nil}
    let options:[CFString:Any]=[kCGImageSourceCreateThumbnailFromImageAlways:true,kCGImageSourceCreateThumbnailWithTransform:true,kCGImageSourceThumbnailMaxPixelSize:maxSize,kCGImageSourceShouldCacheImmediately:true]
    guard let image=CGImageSourceCreateThumbnailAtIndex(source,CGImageSourceGetPrimaryImageIndex(source),options as CFDictionary),
          let sample=CGContext(data:nil,width:64,height:64,bitsPerComponent:8,bytesPerRow:64,space:CGColorSpaceCreateDeviceGray(),bitmapInfo:0) else{return nil}
    sample.draw(image,in:CGRect(x:0,y:0,width:64,height:64))
    guard let data=sample.data else{return nil}
    let pixels=UnsafeBufferPointer(start:data.assumingMemoryBound(to:UInt8.self),count:4096)
    guard let low=pixels.min(),let high=pixels.max(),Int(high)-Int(low)>3 else{return nil}
    return image
}

func reagentPhotoPixels(_ url:URL,maxSize:Int=2400,cancel:ModelCancellation?=nil)throws->CGImage {
    if let image=labelPixels(url,maxSize){return image}
    if ["heic","heif"].contains(url.pathExtension.lowercased()){
        // Some ImageIO configurations return a valid-sized, entirely black HEIC thumbnail.
        // Use a locally installed software decoder when available.
        let tmp=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString,isDirectory:true)
        try FileManager.default.createDirectory(at:tmp,withIntermediateDirectories:true)
        defer{try? FileManager.default.removeItem(at:tmp)}
        let output=tmp.appendingPathComponent("label.png")
        for tool in ["heif-dec","heif-convert","magick","ffmpeg","tiled-heic"] {
            let executable=tool=="tiled-heic" ? "ffmpeg":tool
            for prefix in ["/opt/homebrew/bin/","/usr/local/bin/"] where FileManager.default.isExecutableFile(atPath:prefix+executable) {
                let process=Process();process.executableURL=URL(fileURLWithPath:prefix+executable)
                if cancel?.isCancelled==true{throw CancellationError()}
                switch tool {
                case "tiled-heic":
                    guard let script=Bundle.main.url(forResource:"reagent_heic",withExtension:"py"),let python=try? researchPython() else{continue}
                    process.executableURL=python;process.arguments=["-I",script.path,url.path,output.path,prefix+executable]
                case "magick":process.arguments=[url.path+"[0]","-auto-orient","-thumbnail","\(maxSize)x\(maxSize)>",output.path]
                case "ffmpeg":process.arguments=["-nostdin","-v","error","-y","-i",url.path,"-frames:v","1",output.path]
                default:process.arguments=[url.path,output.path]
                }
                process.standardError=FileHandle.nullDevice;process.standardOutput=FileHandle.nullDevice
                try? FileManager.default.removeItem(at:output)
                guard (try? process.run()) != nil else{continue}
                cancel?.attach{if process.isRunning{process.terminate()}}
                process.waitUntilExit()
                if cancel?.isCancelled==true{throw CancellationError()}
                if process.terminationStatus==0,let image=labelPixels(output,maxSize){return image}
            }
        }
    }
    throw ServiceIssue.message("照片未能解码为可读图像。可导入 JPEG 或 PNG 版本，或手动录入。")
}

func reagentPhotoJPEG(_ url:URL,cancel:ModelCancellation?=nil)throws->String {
    let image=try reagentPhotoPixels(url,cancel:cancel)
    let data=NSMutableData()
    guard let dest=CGImageDestinationCreateWithData(data,UTType.jpeg.identifier as CFString,1,nil) else{throw ServiceIssue.message("无法准备标签照片。")}
    CGImageDestinationAddImage(dest,image,[kCGImageDestinationLossyCompressionQuality:0.9] as CFDictionary)
    guard CGImageDestinationFinalize(dest) else{throw ServiceIssue.message("无法编码标签照片。")}
    return (data as Data).base64EncodedString()
}
