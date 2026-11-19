import Cocoa

enum LocalCodex {
    private static let pathPreference = "localCodexExecutable"
    private static let setupHint = "请在这台 Mac 安装最新版 Codex CLI（npm install -g @openai/codex），运行 codex login 登录自己的账号，然后刷新模型。也可以点「定位 Codex」选择已安装的程序。"

    private static func candidates(inApp url: URL) -> [URL] {
        ["Contents/Resources/codex-cli/bin/codex", "Contents/Resources/codex",
         "Contents/MacOS/codex"].map { url.appendingPathComponent($0) }
    }
    private static func resolve(_ path: URL) -> URL? {
        let fm = FileManager.default
        let entry = path.resolvingSymlinksInPath()
        guard ["codex", "codex.js"].contains(path.lastPathComponent),
              (try? entry.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true,
              fm.isExecutableFile(atPath: entry.path) else { return nil }
        if entry.pathExtension == "js" {
            #if arch(arm64)
            let arch = "arm64", triple = "aarch64"
            #else
            let arch = "x64", triple = "x86_64"
            #endif
            let root = entry.deletingLastPathComponent().deletingLastPathComponent()
            let vendor = triple + "-apple-darwin"
            for prefix in ["node_modules/@openai/codex-darwin-" + arch + "/vendor/", "vendor/"] {
                for suffix in ["/bin/codex", "/codex/codex"] {
                    let binary = root.appendingPathComponent(prefix + vendor + suffix)
                    if fm.isExecutableFile(atPath: binary.path) { return binary }
                }
            }
            // Keep the installation's bin directory on PATH for the npm launcher's node.
            return path
        }
        return entry
    }
    static func executable() throws -> URL {
        if let saved = UserDefaults.standard.string(forKey: pathPreference),
           let url = resolve(URL(fileURLWithPath: saved)) { return url }
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let dirs = (ProcessInfo.processInfo.environment["PATH"] ?? "").components(separatedBy: ":")
            + [home + "/.npm-global/bin", home + "/.local/bin", home + "/.volta/bin", "/opt/homebrew/bin", "/usr/local/bin"]
        var paths = dirs.filter { $0.hasPrefix("/") }.map { URL(fileURLWithPath: $0).appendingPathComponent("codex") }
        if let app = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.openai.codex") {
            paths += candidates(inApp: app)
        }
        for dir in ["/Applications", home + "/Applications"] {
            for name in ["Codex.app", "ChatGPT.app"] { paths += candidates(inApp: URL(fileURLWithPath: dir + "/" + name)) }
        }
        for path in paths { if let url = resolve(path) { return url } }
        throw ServiceIssue.message("未找到本机 Codex。" + setupHint)
    }
    static func chooseExecutable() throws -> Bool {
        let panel = NSOpenPanel()
        panel.title = InterfaceLanguage.text("选择 Codex CLI 可执行文件或包含 Codex 的 App")
        panel.showsHiddenFiles = true
        guard panel.runModal() == .OK, let url = panel.url else { return false }
        let paths = url.pathExtension.lowercased() == "app" ? candidates(inApp: url) : [url]
        guard let path = paths.first(where: { resolve($0) != nil }) else { throw ServiceIssue.message("所选位置没有可执行的 Codex CLI。") }
        UserDefaults.standard.set(path.path, forKey: pathPreference)
        return true
    }
    private static func process() throws -> Process {
        let proc = Process(), binary = try executable()
        proc.executableURL = binary
        var env = ProcessInfo.processInfo.environment
        env["PATH"] = [binary.deletingLastPathComponent().path, "/opt/homebrew/bin", "/usr/local/bin", env["PATH"] ?? "/usr/bin:/bin"].joined(separator: ":")
        proc.environment = env
        return proc
    }
    private static func execute(_ proc: Process, seconds: Int,cancel:ModelCancellation?=nil) throws {
        let finished = DispatchSemaphore(value: 0)
        proc.terminationHandler = { _ in finished.signal() }
        try proc.run();cancel?.attach{if proc.isRunning{proc.terminate()}}
        if finished.wait(timeout: .now() + .seconds(seconds)) == .timedOut {
            if proc.isRunning { proc.terminate() }
            throw ServiceIssue.message("本机 Codex 在 \(seconds) 秒内未返回，请检查网络与登录状态后重试。")
        }
    }
    static func models() throws -> [String] {
        let proc = try process(), fm = FileManager.default
        let file = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        guard fm.createFile(atPath: file.path, contents: nil, attributes: [.posixPermissions: 0o600]) else {
            throw ServiceIssue.message("无法创建模型目录临时文件。")
        }
        defer { try? fm.removeItem(at: file) }
        let output = try FileHandle(forWritingTo: file)
        defer { try? output.close() }
        proc.currentDirectoryURL = fm.temporaryDirectory
        proc.arguments = ["debug", "models"]
        proc.standardInput = FileHandle.nullDevice
        proc.standardOutput = output
        proc.standardError = FileHandle.nullDevice
        func visibleModels(at url: URL) -> [String] {
            guard let data = try? Data(contentsOf: url),
                  let catalog = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let rows = catalog["models"] as? [[String: Any]] else { return [] }
            return rows.filter { $0["visibility"] as? String == "list" }
                .compactMap { $0["slug"] as? String }.filter { !$0.isEmpty }
        }
        let completed = (try? execute(proc, seconds: 25)) != nil
        if completed, proc.terminationStatus == 0 {
            let ids = visibleModels(at: file)
            if !ids.isEmpty { return ids }
        }
        let codexHome = ProcessInfo.processInfo.environment["CODEX_HOME"].map { URL(fileURLWithPath: $0) }
            ?? fm.homeDirectoryForCurrentUser.appendingPathComponent(".codex")
        let cached = visibleModels(at: codexHome.appendingPathComponent("models_cache.json"))
        if !cached.isEmpty { return cached }
        throw ServiceIssue.message("此 Codex 未返回模型目录。可更新 CLI 后刷新，或在「编辑」中填写模型 ID。")

    }

    static func run(model:String,instruction:String,input:String,image:String?=nil,cancel:ModelCancellation?=nil) throws -> (String,Int?) {
        let fm=FileManager.default
        let folder=fm.temporaryDirectory.appendingPathComponent("research-model-"+UUID().uuidString)
        try fm.createDirectory(at:folder,withIntermediateDirectories:true,attributes:[.posixPermissions:0o700])
        defer {try? fm.removeItem(at:folder)}
        let source=folder.appendingPathComponent("request"),events=folder.appendingPathComponent("events"),answer=folder.appendingPathComponent("answer")
        try Data(input.utf8).write(to:source);fm.createFile(atPath:events.path,contents:nil)
        let diagnostic=folder.appendingPathComponent("diagnostic")
        fm.createFile(atPath:diagnostic.path,contents:nil)
        let errors=try FileHandle(forWritingTo:diagnostic)
        defer{try? errors.close()}
        let src=try FileHandle(forReadingFrom:source),out=try FileHandle(forWritingTo:events)
        defer{try? src.close();try? out.close()}
        let proc=try process()
        proc.currentDirectoryURL=folder
        var args=["exec","--ephemeral","--ignore-user-config","--ignore-rules","--skip-git-repo-check","--sandbox","read-only",
                  "-c","approval_policy=\"never\"","-c","web_search=\"disabled\"","-c","project_doc_max_bytes=0",
                  "-c","developer_instructions="+(String(data:try JSONEncoder().encode(instruction),encoding:.utf8) ?? "\"\"")]
        for feature in ["shell_tool","unified_exec","apps","plugins","remote_plugin","multi_agent","computer_use","image_generation","hooks"]{
            args += ["--disable",feature]
        }
        if model != "默认模型"{args += ["--model",model]}
        if let image,let data=Data(base64Encoded:image){let file=folder.appendingPathComponent("sketch.jpg");try data.write(to:file);args+=["--image",file.path]}
        proc.arguments=args+["--json","-o",answer.path,"-"]
        proc.standardInput=src;proc.standardOutput=out;proc.standardError=errors
        try execute(proc, seconds:100,cancel:cancel)
        let rows=(try String(contentsOf:events,encoding:.utf8)).split(separator:"\n").compactMap {
            try? JSONSerialization.jsonObject(with:Data($0.utf8)) as? [String:Any]
        }
        guard proc.terminationStatus==0,let text=try? String(contentsOf:answer,encoding:.utf8),
              !text.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty else{
            let detail=rows.last(where:{$0["type"] as? String=="error"})?["message"] as? String
            let log=(try? String(contentsOf:diagnostic,encoding:.utf8)) ?? ""
            if log.contains("unknown feature") || log.contains("unexpected argument") || log.contains("unrecognized subcommand"){
                throw ServiceIssue.message("所定位的 Codex CLI 版本不支持此调用，请更新 CLI，或在模型页重新定位。")
            }
            if log.contains("unable to open database file") || log.contains("Operation not permitted"){
                throw ServiceIssue.message("本机 Codex 缺少运行权限，请检查 Codex 工作目录的读写权限。")
            }
            throw ServiceIssue.message("本机 Codex 调用失败。"+(detail.map{String($0.prefix(260))} ?? "请确认本机 CLI 为最新版且已运行 codex login，并检查所选模型权限及网络。"))
        }
        let usage=rows.last(where:{$0["type"] as? String=="turn.completed"})?["usage"] as? [String:Int]
        let tokens=usage?["input_tokens"].flatMap{n in usage?["output_tokens"].map{n+$0}}
        return (text,tokens)
    }
}
