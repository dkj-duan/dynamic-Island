# Dynamic Island for Windows

Windows 灵动岛项目，包含计时、媒体信息和系统状态提醒。

## 开发

需安装 Node.js、Rust 和 Tauri Windows 开发前置组件（包括 WebView2 与 Microsoft C++ 构建工具），详见 [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)。

```powershell
npm ci
npm run tauri dev
```

只预览界面可运行 `npm run dev`；`npm run build` 检查并构建前端，`cargo check --manifest-path src-tauri/Cargo.toml` 检查 Rust。

桌面应用启动后显示屏幕顶部灵动岛和设置窗口。点击灵动岛展开面板，可选择 1、5、25 分钟，或输入自定义分钟和秒数（1 秒至 999 分 59 秒）。在设置页可选鼠标离开后 1、3、5、10 或 15 秒自动收起，也可关闭。计时结束后岛上持续显示动画，点击“知道了”或“再计一次”停止提示；当前不发出声音，退出应用后计时不保留。调整设置后点击“保存设置”，可同步到灵动岛。关闭设置窗口会将其隐藏。浏览器预览不会保存设置。插件加载尚未实现；灵动岛目前固定在主屏幕顶部，尚未实现全屏避让和多屏配置。设计及后续计划见 [技术架构](docs/architecture.md)，质量检查见 [开发规范](docs/development.md)。

音乐页读取 Windows 当前媒体会话，显示曲名和艺人，并提供上一首、播放/暂停、下一首控制。当前会话没有可用曲目时会显示空状态。

系统音量、显示器亮度、电源连接及蓝牙连接状态变化时会短暂提示。亮度依赖显示器和驱动提供 WMI 数据，外接显示器可能不支持；蓝牙设备电量仅在 Windows 提供数据时显示。启动时建立状态基线，不提示已有状态。
