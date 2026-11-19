import Foundation

@main struct ModelProtocols {
    static func main() throws {
        let id = UUID().uuidString
        for format in ["chat","responses","anthropic"] {
            let service = try ModelService(["id":id,"name":"本地测试","base":"http://127.0.0.1:11434/v1","format":format,"models":["sample"]])
            let req = try service.request(model:"sample",instruction:"规则",input:"日程",key:"test-value")
            let json = try JSONSerialization.jsonObject(with:req.httpBody!) as! [String:Any]
            precondition(json["model"] as? String == "sample")
            let vision=try service.request(model:"sample",instruction:"draw",input:"sketch",key:"test-value",image:"c2tldGNo",outputBudget:6000)
            let imageJSON=try JSONSerialization.jsonObject(with:vision.httpBody!) as! [String:Any]
            let list=imageJSON[format=="responses" ? "input":"messages"] as! [[String:Any]]
            let content=list.last!["content"] as! [[String:Any]]
            let type=format=="responses" ? "input_image":format=="anthropic" ? "image":"image_url"
            precondition(content.contains(where:{$0["type"] as? String==type}))
            let reply: [String:Any]
            switch format {
            case "responses":
                precondition(req.url!.path == "/v1/responses" && json["input"] as? String == "日程")
                reply = ["output":[["type":"message","content":[["type":"output_text","text":"成功"]]]]]
            case "anthropic":
                precondition(req.url!.path == "/v1/messages" && req.value(forHTTPHeaderField:"x-api-key") == "test-value")
                reply = ["content":[["type":"text","text":"成功"]]]
            default:
                precondition(req.url!.path == "/v1/chat/completions" && req.value(forHTTPHeaderField:"Authorization") == "Bearer test-value")
                reply = ["choices":[["message":["content":"成功"]]]]
            }
            let text = try service.output(JSONSerialization.data(withJSONObject:reply))
            precondition(text == "成功")
            precondition((try? service.request(model:"removed",instruction:"",input:"",key:"")) == nil)
        }
        print("三种接口的请求路径、模型参数、响应解析与已删除模型拦截通过。")
    }
}
