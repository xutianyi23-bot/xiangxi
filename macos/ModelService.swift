import Foundation
import Security

enum ServiceIssue: Error, LocalizedError {
    case message(String)
    var errorDescription: String? { if case let .message(text) = self { return text }; return nil }
}

struct ModelService {
    let id: String
    let name: String
    let base: URL
    let format: String
    let models: [String]

    init(_ settings: [String: Any]) throws {
        guard let id = settings["id"] as? String, UUID(uuidString: id) != nil,
              let name = settings["name"] as? String,
              let raw = settings["base"] as? String, let base = URL(string: raw),
              let host = base.host?.lowercased(), !host.isEmpty,
              base.user == nil, base.password == nil, base.query == nil, base.fragment == nil,
              base.absoluteString=="codex://local" || base.scheme == "https" || (base.scheme == "http" && ["localhost","127.0.0.1","::1","[::1]"].contains(host)),
              let format = settings["format"] as? String, ["chat","responses","anthropic","codexCLI"].contains(format),
              (format=="codexCLI") == (base.absoluteString=="codex://local"),
              let models = settings["models"] as? [String] else {
            throw ServiceIssue.message("服务商配置无效。请检查协议和 API 地址。")
        }
        self.id = id; self.name = name; self.base = base; self.format = format; self.models = models
    }

    // Bind each key to the complete configured destination, including any gateway path.
    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "studio.xiangxi.beta.providers",
         kSecAttrAccount as String: id + "|" + base.absoluteString]
    }
    func credential() throws -> String {
        var read = query
        read[kSecReturnData as String] = true
        var result: CFTypeRef?
        let status = SecItemCopyMatching(read as CFDictionary, &result)
        if status == errSecItemNotFound { return "" }
        guard status == errSecSuccess, let bytes = result as? Data, let text = String(data: bytes, encoding: .utf8) else {
            throw ServiceIssue.message("无法读取此服务商的钥匙串密钥（\(status)）。")
        }
        return text
    }
    func setCredential(_ value: String) throws {
        let data = Data(value.utf8)
        var status = SecItemUpdate(query as CFDictionary, [kSecValueData as String:data] as CFDictionary)
        if status == errSecItemNotFound {
            var item = query
            item[kSecValueData as String] = data
            item[kSecAttrLabel as String] = "相析 · " + name
            status = SecItemAdd(item as CFDictionary, nil)
        }
        guard status == errSecSuccess else { throw ServiceIssue.message("钥匙串操作失败（\(status)）。") }
    }

    func request(model: String, instruction: String, input: String, key: String,image:String?=nil,outputBudget:Int=2048) throws -> URLRequest {
        guard models.contains(model) else { throw ServiceIssue.message("所选模型已移除，请重新选择。") }
        let endpoint: String
        var body: [String: Any]
        switch format {
        case "anthropic":
            endpoint = "messages"
            body = ["model":model, "max_tokens":outputBudget, "system":instruction, "messages":[["role":"user","content":input]]]
        case "responses":
            endpoint = "responses"
            body = ["model":model, "instructions":instruction, "input":input, "store":false]
        default:
            endpoint = "chat/completions"
            body = ["model":model, "messages":[["role":"system","content":instruction],["role":"user","content":input]]]
        }
        if let image {
            let uri="data:image/jpeg;base64,"+image
            switch format {
            case "anthropic":body["messages"]=[["role":"user","content":[["type":"image","source":["type":"base64","media_type":"image/jpeg","data":image]],["type":"text","text":input]]]] as [[String:Any]]
            case "responses":body["input"]=[["role":"user","content":[["type":"input_text","text":input],["type":"input_image","image_url":uri]]]] as [[String:Any]]
            default:body["messages"]=[["role":"system","content":instruction],["role":"user","content":[["type":"text","text":input],["type":"image_url","image_url":["url":uri]]]]] as [[String:Any]]
            }
        }
        var req = URLRequest(url: base.appendingPathComponent(endpoint))
        req.httpMethod = "POST"; req.timeoutInterval = 90
        req.setValue("application/json", forHTTPHeaderField:"Content-Type")
        if format == "anthropic" {
            req.setValue("2023-06-01", forHTTPHeaderField:"anthropic-version")
            if !key.isEmpty { req.setValue(key, forHTTPHeaderField:"x-api-key") }
        } else if !key.isEmpty { req.setValue("Bearer "+key, forHTTPHeaderField:"Authorization") }
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        return req
    }

    func output(_ bytes: Data) throws -> String {
        guard let json = try JSONSerialization.jsonObject(with: bytes) as? [String:Any] else { throw ServiceIssue.message("模型返回格式无效。") }
        let choices=json["choices"] as? [[String:Any]]
        let incomplete=json["incomplete_details"] as? [String:Any]
        if json["stop_reason"] as? String=="max_tokens" || choices?.first?["finish_reason"] as? String=="length" || incomplete?["reason"] as? String=="max_output_tokens" {
            throw ServiceIssue.message("输出达到长度上限，需缩短生成片段。")
        }
        var text = ""
        switch format {
        case "anthropic":
            let parts = json["content"] as? [[String:Any]] ?? []
            text = parts.filter { $0["type"] as? String == "text" }.compactMap { $0["text"] as? String }.joined()
        case "responses":
            for item in json["output"] as? [[String:Any]] ?? [] where item["type"] as? String == "message" {
                for part in item["content"] as? [[String:Any]] ?? [] where part["type"] as? String == "output_text" {
                    text += part["text"] as? String ?? ""
                }
            }
        default:
            let choices = json["choices"] as? [[String:Any]]
            let message = choices?.first?["message"] as? [String:Any]
            text = message?["content"] as? String ?? ""
        }
        guard !text.isEmpty else { throw ServiceIssue.message("模型未返回文本，请核对协议和模型 ID。") }
        return text
    }
}

final class ModelTransport: NSObject, URLSessionTaskDelegate {
    lazy var session = URLSession(configuration: .ephemeral, delegate: self, delegateQueue: nil)
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

func modelTokens(_ bytes:Data) -> Int? {
    guard let json=try? JSONSerialization.jsonObject(with:bytes) as? [String:Any],
          let usage=json["usage"] as? [String:Any] else{return nil}
    if let total=usage["total_tokens"] as? Int,total>=0{return total}
    guard let input=usage["input_tokens"] as? Int,let output=usage["output_tokens"] as? Int else{return nil}
    return input+output+(usage["cache_creation_input_tokens"] as? Int ?? 0)+(usage["cache_read_input_tokens"] as? Int ?? 0)
}
