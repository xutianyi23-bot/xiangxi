# 相析

相析是一款面向生化环材研究生的科研工作站。在一个课题下建立多个实验体系，把每个体系的文献、导师讨论、实验方案、分组对照和结果放在一起。工作站支持 AI 阅读论文、试剂照片归档，以及生成流程图和机理图。

## 下载

- [macOS 通用版](https://github.com/xutianyi23-bot/xiangxi/releases/tag/v1.0.0-beta.1) 支持 macOS 13 及以上的 Intel 和 Apple 芯片 Mac。
- [Windows x64 修复版](https://github.com/xutianyi23-bot/xiangxi/releases/tag/v1.0.0.3-windows-beta) 面向 Windows 10 / 11 x64，需要 .NET Framework 4.8 和 Microsoft Edge WebView2 Runtime。

## 从源码构建

在仓库根目录运行对应命令。两个构建脚本都将安装包写入 `build/`。

| 平台 | 开发环境 | 构建命令 |
| --- | --- | --- |
| macOS | Xcode 命令行工具（包含 macOS SDK、Swift 和 Clang） | `bash scripts/build.sh` |
| Windows x64 | Python 3、.NET Framework C# 编译器 | `python scripts/build_windows.py` |

`macos/` 和 `windows/` 是两个平台的原生实现，`web/` 是共用界面，`tests/` 包含测试。模型服务和账户由使用者自行配置。

## 版权和许可

© 2026 徐天翼（笔名：鸡腿堡）

相析的项目源码采用 [GNU 通用公共许可证第 3 版（GPL-3.0-only）](LICENSE.md)。可按该许可证使用、修改和分发，包括商业使用。向他人分发修改版时，须按同一许可证向接收者提供相应源码，并保留适用的版权与许可声明。

第三方组件适用各自的许可证。用户导入的论文、模板及研究数据依各自的授权使用。
