// Copyright © 2026 徐天翼（笔名：鸡腿堡）
// SPDX-License-Identifier: GPL-3.0-only
import Cocoa
import Security

extension Workspace{
    func mailInbox(_ op:String,_ msg:[String:Any],_ id:String)throws{
        guard let host=msg["host"] as? String,host.range(of:"^[a-zA-Z0-9.-]+$",options:.regularExpression) != nil,
              let user=msg["user"] as? String,!user.isEmpty,let port=msg["port"] as? String,let n=UInt16(port),n>0 else{throw ServiceIssue.message("邮箱服务器、账号或端口无效。")}
        let key:[String:Any]=[kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:"studio.xiangxi.beta.imap",kSecAttrAccount as String:user+"@"+host.lowercased()+":"+port]
        if op=="mailCredential"{
            let alert=NSAlert();alert.messageText="保存邮箱客户端授权码";alert.informativeText=user+" · "+host+":"+port
            let password=NSSecureTextField(frame:NSRect(x:0,y:0,width:330,height:26));alert.accessoryView=password;alert.window.initialFirstResponder=password
            alert.addButton(withTitle:"存入钥匙串");alert.addButton(withTitle:"取消")
            guard alert.runModal() == .alertFirstButtonReturn else{emit("batchRPC",["requestID":id,"value":false] as [String:Any]);return}
            guard !password.stringValue.isEmpty else{throw ServiceIssue.message("请输入客户端授权码。")}
            let bytes=Data(password.stringValue.utf8)
            var status=SecItemUpdate(key as CFDictionary,[kSecValueData as String:bytes] as CFDictionary)
            if status==errSecItemNotFound{var item=key;item[kSecValueData as String]=bytes;status=SecItemAdd(item as CFDictionary,nil)}
            guard status==errSecSuccess else{throw ServiceIssue.message("钥匙串保存失败。")}
            emit("batchRPC",["requestID":id,"value":true] as [String:Any]);return
        }
        var query=key;query[kSecReturnData as String]=true;var raw:CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary,&raw)==errSecSuccess,let value=raw as? Data,let secret=String(data:value,encoding:.utf8) else{throw ServiceIssue.message("请先为这个邮箱保存授权码。")}
        let request=try JSONSerialization.data(withJSONObject:["host":host,"port":port,"user":user,"secret":secret,"epoch":msg["epoch"] ?? "","cursor":msg["cursor"] ?? 0])
        DispatchQueue.global(qos:.utility).async{
            do{let data=try runResource("mail_reader",[],request),result=try JSONSerialization.jsonObject(with:data)
                DispatchQueue.main.async{self.emit("batchRPC",["requestID":id,"value":result])}
            }catch{DispatchQueue.main.async{self.emit("batchRPC",["requestID":id,"error":error.localizedDescription])}}
        }
    }
}
