import Foundation

enum WorkspaceBackup {
    static func drives() -> [[String:String]] {
        let keys:Set<URLResourceKey>=[.volumeIsInternalKey,.volumeIsLocalKey,.volumeIsReadOnlyKey,.volumeNameKey,.volumeUUIDStringKey,.volumeIsRemovableKey,.volumeIsEjectableKey]
        let volumes=FileManager.default.mountedVolumeURLs(includingResourceValuesForKeys:Array(keys),options:.skipHiddenVolumes) ?? []
        return volumes.compactMap { url in
            guard url.path.hasPrefix("/Volumes/"),let v=try? url.resourceValues(forKeys:keys),
                  v.volumeIsLocal==true,v.volumeIsReadOnly==false,
                  v.volumeIsInternal==false || v.volumeIsRemovable==true || v.volumeIsEjectable==true else{return nil}
            return ["id":v.volumeUUIDString ?? url.path,"name":v.volumeName ?? url.lastPathComponent,"path":url.path]
        }
    }

    static func attachments(_ projects:[[String:Any]])->[String:Set<String>]{
        var files=[String:Set<String>]()
        for project in projects {
            for r in project["reports"] as? [[String:Any]] ?? [] {
                let templates=([r["deckTemplate"]]+(r["deckVersions"] as? [[String:Any]] ?? []).map{$0["template"]})
                for case let t as [String:Any] in templates{if let file=t["file"] as? String{files["DeckTemplates",default:[]].insert(file)}}
            }
            for system in project["systems"] as? [[String:Any]] ?? [] {
                for paper in system["importedPapers"] as? [[String:Any]] ?? [] {
                    if let file=paper["file"] as? String{files["References",default:[]].insert(file)}
                }
                for target in system["paperTargets"] as? [[String:Any]] ?? [] {
                    for paper in target["corpus"] as? [[String:Any]] ?? [] {
                        if let file=paper["file"] as? String {files["References",default:[]].insert(file)}
                    }
                }
                var groups=system["experiments"] as? [[String:Any]] ?? []
                if let shared=system["sharedMeasurements"] as? [String:Any] {groups.append(shared)}
                for batch in groups {
                    for result in batch["results"] as? [[String:Any]] ?? [] {
                        if let file=result["file"] as? String {files["Measurements",default:[]].insert(file)}
                    }
                }
                for ref in system["references"] as? [[String:Any]] ?? [] {
                    for key in ["file","previousFile"] {if let name=ref[key] as? String,!name.isEmpty {files["References",default:[]].insert(name)}}
                }
                for item in system["reagentImports"] as? [[String:Any]] ?? [] {
                    if let name=item["file"] as? String,!name.isEmpty {files["Reagents",default:[]].insert(name)}
                }
                let meetings=(system["meetings"] as? [[String:Any]] ?? [])+(system["designMeetings"] as? [[String:Any]] ?? [])
                for meeting in meetings {
                    if let name=meeting["file"] as? String,!name.isEmpty {files["Recordings",default:[]].insert(name)}
                }
            }
        }
        return files
    }

    static func write(state:[String:Any],source:URL,destination:URL)throws->URL {
        let fm=FileManager.default
        let staging=fm.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try fm.createDirectory(at:staging,withIntermediateDirectories:false)
        defer {try? fm.removeItem(at:staging)}
        try JSONSerialization.data(withJSONObject:state).write(to:staging.appendingPathComponent("trial.json"))
        let files=attachments(state["projects"] as? [[String:Any]] ?? [])
        for (folder,names) in files {
            let output=staging.appendingPathComponent(folder)
            try fm.createDirectory(at:output,withIntermediateDirectories:false)
            for name in names {
                guard name==(name as NSString).lastPathComponent,name != ".",name != ".." else {throw CocoaError(.fileReadInvalidFileName)}
                let file=source.appendingPathComponent(folder).appendingPathComponent(name)
                guard try file.resourceValues(forKeys:[.isRegularFileKey,.isSymbolicLinkKey]).isRegularFile==true,
                      (try file.resourceValues(forKeys:[.isSymbolicLinkKey])).isSymbolicLink != true else {throw CocoaError(.fileReadCorruptFile)}
                try fm.copyItem(at:file,to:output.appendingPathComponent(name))
            }
        }
        let tmp=destination.appendingPathComponent(".工作站备份-"+UUID().uuidString+".zip")
        defer {try? fm.removeItem(at:tmp)}
        let zip=Process();zip.executableURL=URL(fileURLWithPath:"/usr/bin/ditto")
        zip.arguments=["-c","-k","--norsrc",staging.path,tmp.path];try zip.run();zip.waitUntilExit()
        guard zip.terminationStatus==0 else {throw CocoaError(.fileWriteUnknown)}
        let formatter=DateFormatter();formatter.locale=Locale(identifier:"en_US_POSIX");formatter.dateFormat="yyyy-MM-dd"
        let stem=formatter.string(from:Date())+"工作站备份"
        var index=1
        while true {
            let suffix=index==1 ? "" : "（"+String(index)+"）"
            let url=destination.appendingPathComponent(stem+suffix+".zip")
            do {try fm.moveItem(at:tmp,to:url);return url}
            catch let err as NSError where err.domain==NSCocoaErrorDomain && err.code==NSFileWriteFileExistsError {index+=1}
        }
    }
}
