import Foundation
import Network

// A visit-scoped CONNECT endpoint for WebKit. TLS stays between WebKit and CNKI.
final class CampusRoute {
    private let queue=DispatchQueue(label:"studio.chemist.cnki.route")
    private var monitors=[NWPathMonitor](),listener:NWListener?,streams=[UUID:CampusStream]()
    private var stopped=false,started=false
    func start(_ completion:@escaping(Result<(UInt16,String),Error>)->Void){
        queue.async {
            var finished=false
            func report(_ result:Result<(UInt16,String),Error>){
                guard !finished else{return};finished=true
                self.monitors.forEach{$0.cancel()};self.monitors=[]
                DispatchQueue.main.async{completion(result)}
            }
            for type in [NWInterface.InterfaceType.wifi,.wiredEthernet] {
                let monitor=NWPathMonitor(requiredInterfaceType:type);self.monitors.append(monitor)
                monitor.pathUpdateHandler={path in
                    guard !self.started,!self.stopped,!finished,path.status == .satisfied,let iface=path.availableInterfaces.first(where:{$0.type==type}) else{return}
                    self.started=true
                    do{
                        let params=NWParameters.tcp
                        params.requiredLocalEndpoint = .hostPort(host:"127.0.0.1",port:.any)
                        let l=try NWListener(using:params);self.listener=l
                        l.newConnectionHandler={client in
                            guard !self.stopped,self.streams.count<64 else{client.cancel();return}
                            let id=UUID(),stream=CampusStream(client,iface,self.queue){self.streams.removeValue(forKey:id)}
                            self.streams[id]=stream;stream.start()
                        }
                        l.stateUpdateHandler={state in
                            switch state{
                            case .ready:if let port=l.port{report(.success((port.rawValue,iface.name)))}
                            case .failed:report(.failure(ServiceIssue.message("无法创建知网直连通道。")))
                            default:break
                            }
                        };l.start(queue:self.queue)
                    }catch{report(.failure(error))}
                };monitor.start(queue:self.queue)
            }
            self.queue.asyncAfter(deadline:.now()+5){
                if !finished{report(.failure(ServiceIssue.message("没有可用的 Wi-Fi 或有线网络，未转用代理。")))}
            }
        }
    }
    func stop(){queue.async{
        self.stopped=true;self.monitors.forEach{$0.cancel()};self.monitors=[]
        self.listener?.cancel();self.listener=nil
        Array(self.streams.values).forEach{$0.close()}
    }}
}
private final class CampusStream {
    let local:NWConnection,iface:NWInterface,queue:DispatchQueue,onClose:()->Void
    var remote:NWConnection?,header=Data(),closed=false,connected=false,halfClosed=0
    init(_ client:NWConnection,_ iface:NWInterface,_ queue:DispatchQueue,_ onClose:@escaping()->Void){
        self.local=client;self.iface=iface;self.queue=queue;self.onClose=onClose
    }
    func close(){guard !closed else{return};closed=true;remote?.stateUpdateHandler=nil;local.cancel();remote?.cancel();onClose()}
    func start(){
        local.start(queue:queue);readHeader()
        queue.asyncAfter(deadline:.now()+18){[weak self] in if self?.connected==false{self?.close()}}
    }
    func readHeader(){local.receive(minimumIncompleteLength:1,maximumLength:8192){data,_,eof,error in
        guard !self.closed,error==nil,let bytes=data,!bytes.isEmpty else{self.close();return}
        self.header.append(bytes)
        guard self.header.count<=16384 else{self.close();return}
        guard let end=self.header.range(of:Data("\r\n\r\n".utf8)) else{if eof{self.close()}else{self.readHeader()};return}
        let words=String(decoding:self.header[..<end.lowerBound],as:UTF8.self).components(separatedBy:"\r\n")[0].split(separator:" ")
        guard words.count==3,words[0]=="CONNECT" else{self.close();return}
        let hp=words[1].lowercased().split(separator:":",omittingEmptySubsequences:false)
        guard hp.count==2,hp[1]=="443",["cnki.net","cnki.com.cn"].contains(where:{hp[0]==Substring($0)||hp[0].hasSuffix("."+$0)}),hp[0].range(of:"^[a-z0-9.-]+$",options:.regularExpression) != nil else{self.close();return}
        let p=NWParameters.tcp;p.preferNoProxies=true;p.requiredInterface=self.iface
        let peer=NWConnection(host:NWEndpoint.Host(String(hp[0])),port:.https,using:p);self.remote=peer
        let initial=Data(self.header[end.upperBound...]);self.header.removeAll()
        peer.stateUpdateHandler={state in
            switch state{
            case .ready:
                guard !self.connected,let path=peer.currentPath,path.usesInterfaceType(self.iface.type) else{self.close();return}
                self.connected=true
                self.local.send(content:Data("HTTP/1.1 200 Connection Established\r\n\r\n".utf8),completion:.contentProcessed{err in
                    guard err==nil else{self.close();return}
                    peer.send(content:initial,completion:.contentProcessed{err in if err==nil{self.pump(self.local,peer)}else{self.close()}})
                    self.pump(peer,self.local)
                })
            case .failed,.cancelled:self.close()
            default:break
            }
        };peer.start(queue:self.queue)
    }}
    func pump(_ source:NWConnection,_ dest:NWConnection){
        guard !closed else{return};source.receive(minimumIncompleteLength:1,maximumLength:65536){data,_,eof,error in
            guard !self.closed,error==nil else{self.close();return}
            dest.send(content:data,contentContext:eof ? .finalMessage:.defaultMessage,isComplete:true,completion:.contentProcessed{error in
                if error != nil{self.close()}else if eof{self.halfClosed+=1;if self.halfClosed==2{self.close()}}else{self.pump(source,dest)}
            })
        }
    }
}
