import Cocoa

enum InterfaceLanguage {
    static let codes=["zh-Hans","zh-Hant","en","de","es","ja","ko","fr","pt","it","ru"]
    static var extra=[String:String]()
    static var code="zh-Hans"
    private static let entries:[String:[String]]={
        guard let url=Bundle.main.url(forResource:"interface-catalogue",withExtension:"js",subdirectory:"web"),
              let catalog=try? String(contentsOf:url,encoding:.utf8),
              let start=catalog.firstIndex(of:"["),let end=catalog.lastIndex(of:"]"),
              let rows=try? JSONDecoder().decode([[String]].self,from:Data(catalog[start...end].utf8)) else{return [:]}
        return rows.reduce(into:[:]){ if $1.count>=7{$0[$1[0]]=$1} }
    }()
    static func text(_ key:String)->String {
        if let value=extra[key]{return value}
        guard code != codes[0],let i=codes.firstIndex(of:code),let row=entries[key],row.indices.contains(i) else{return key}
        return row[i]
    }
}

extension Workspace {
    func configureMenus(){
        let bar=NSMenu()
        func submenu(_ title:String,_ entries:[(String,Selector,String)]){
            let item=NSMenuItem();bar.addItem(item)
            let menu=NSMenu(title:InterfaceLanguage.text(title));item.submenu=menu
            for (name,action,key) in entries{menu.addItem(withTitle:InterfaceLanguage.text(name),action:action,keyEquivalent:key)}
        }
        submenu("相析",[("退出相析",#selector(NSApplication.terminate(_:)),"q")])
        submenu("编辑",[("撤销",Selector(("undo:")),"z"),("剪切",#selector(NSText.cut(_:)),"x"),("复制",#selector(NSText.copy(_:)),"c"),("粘贴",#selector(NSText.paste(_:)),"v"),("全选",#selector(NSText.selectAll(_:)),"a")])
        NSApp.mainMenu=bar
    }
}
