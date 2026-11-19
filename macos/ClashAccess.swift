// Copyright © 2026 徐天翼（笔名：鸡腿堡）
// SPDX-License-Identifier: GPL-3.0-only
import Cocoa
import Network
import SystemConfiguration

extension Workspace {
    func clashAccess(_ op:String,_ msg:[String:Any])throws{
        let workspace=NSWorkspace.shared
        let clients=[("FlClash","com.follow.clash"),("ClashX","com.west2online.ClashX"),("ClashX Pro","com.west2online.ClashXPro")]
        let client=clients.compactMap{name,id in workspace.urlForApplication(withBundleIdentifier:id).map{(name,$0)}}.first
        if op=="openClash"{
            guard let (_,url)=client else{throw ServiceIssue.message("未找到已安装的 Clash 客户端。")}
            workspace.openApplication(at:url,configuration:NSWorkspace.OpenConfiguration()){_,error in
                if let error{self.emit("error",error.localizedDescription)}
            };return
        }
        guard let id=msg["requestID"] as? String else{return}
        if op=="clashDefaults"{
            let settings=SCDynamicStoreCopyProxies(nil) as? [String:Any] ?? [:]
            var value=["client":client?.0 ?? ""]
            for (prefix,kind) in [("HTTP","http"),("SOCKS","socks5")] {
                guard settings[prefix+"Enable"] as? Int==1,let host=settings[prefix+"Proxy"] as? String,
                      ["127.0.0.1","localhost"].contains(host.lowercased()),let port=settings[prefix+"Port"] as? Int,(1...65535).contains(port) else{continue}
                value["kind"]=kind;value["port"]=String(port);break
            }
            emit("batchRPC",["requestID":id,"value":value] as [String:Any]);return
        }
        guard let raw=msg["port"] as? String,let n=UInt16(raw),n>0,let port=NWEndpoint.Port(rawValue:n) else{
            emit("batchRPC",["requestID":id,"error":"请填写有效的代理端口。"]);return
        }
        let socket=NWConnection(host:"127.0.0.1",port:port,using:.tcp)
        var finished=false
        func finish(_ message:String){
            guard !finished else{return};finished=true;socket.stateUpdateHandler=nil;socket.cancel()
            self.emit("batchRPC",["requestID":id,"value":message])
        }
        socket.stateUpdateHandler={state in
            switch state{case .ready:finish("本机端口可连接。");case .failed:finish("无法连接该端口。");default:break}
        }
        socket.start(queue:.main)
        DispatchQueue.main.asyncAfter(deadline:.now()+3){finish("无法连接该端口。")}
    }
}
