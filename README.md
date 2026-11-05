# Dynamic Island for Windows

把 macOS 灵动岛带到 Windows 桌面：番茄钟、喝水、音乐与歌词、邮件验证码和 AI 额度，都收进屏幕顶部一枚始终置顶的胶囊里。

_A dynamic island for Windows 10/11 — pomodoro, water, media & lyrics, mail codes and AI quota in one always-on-top capsule._

Tauri 2 · Rust · React 19 · TypeScript · WebView2 · [MIT License](LICENSE)

![展开后的音乐页](docs/screenshots/island-music.png)

## 功能

**灵动岛**

- 收起态按内容自适应宽度，悬停或点击展开；可设置鼠标离开后「立即 / 1 / 3 / 5 / 10 / 15 秒」收起。
- 空闲时自定义显示哪些组件：时钟、喝水进度、番茄进度、常驻额度环、正在播放，可勾选并在预览里拖动排序。
- 展开后按页展示计时器、音乐、邮件、喝水、AI 额度，可用两侧箭头、底部圆点或拖动面板标题切换。
- 常驻置顶、可拖动并记住位置；岛始终为深色，浅色 / 深色主题只作用于设置窗口。
- 按屏幕逻辑宽度自动分级字号与面板尺寸，适配 2K / 4K 与 Windows 缩放。

**设置窗口**

- 外观：主题（跟随系统 / 浅色 / 深色）、语言（简体中文 / English）、桌面实时预览、闲时组件管理。
- 交互：展开方式、自动收起、恢复默认位置、音乐页的「岛上歌词」开关。
- 番茄钟 / 喝水：3D 主视觉卡片、可配置参数与近 30 天统计图表。
- AI 额度、邮箱提醒、状态提醒、数据与存储、关于。

## 截图

### 灵动岛

<table>
  <tr>
    <td><img src="docs/screenshots/island-idle.png" alt="收起：闲时"><br><sub>收起：闲时组件（时钟 · 喝水 · 番茄 · 额度 · 音乐）</sub></td>
    <td><img src="docs/screenshots/island-timer.png" alt="展开：计时器"><br><sub>展开：番茄钟</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/island-music.png" alt="展开：音乐"><br><sub>展开：音乐与同步歌词</sub></td>
    <td><img src="docs/screenshots/island-water.png" alt="展开：喝水"><br><sub>展开：喝水进度与一键记录</sub></td>
  </tr>
</table>

<img src="docs/screenshots/island-ai.png" alt="展开：AI 额度" width="348">
<br><sub>展开：AI 额度（多账户切换 · 环内百分比 · 重置时间）</sub>

### 设置窗口

<img src="docs/screenshots/settings-appearance.png" alt="设置：外观" width="900">

<details>
<summary>更多设置页截图</summary>

<img src="docs/screenshots/settings-interaction.png" alt="设置：交互" width="900">

<img src="docs/screenshots/settings-pomodoro.png" alt="设置：番茄钟" width="900">

<img src="docs/screenshots/settings-water.png" alt="设置：喝水" width="900">

<img src="docs/screenshots/settings-ai.png" alt="设置：AI 额度" width="900">

</details>

## 快速开始

### 环境要求

- Windows 10 / 11（WebView2 运行时，Win11 已内置）
- Node.js 20+ 与 npm
- Rust stable 与 [Tauri 2 的 Windows 构建依赖](https://v2.tauri.app/start/prerequisites/)（含 Microsoft C++ Build Tools）

### 运行

```powershell
npm ci
npm run tauri dev
```

启动后屏幕顶部出现灵动岛，同时打开设置窗口。关闭设置窗口只是隐藏，可从灵动岛标题栏的设置图标重新打开。

### 构建安装包

```powershell
npm run tauri build
```

产物为 NSIS 安装包（`src-tauri/target/release/bundle/nsis`），安装时可选择目录；应用数据目录与安装目录相互独立。

### 其他命令

```powershell
npm run dev     # 仅浏览器预览，不涉及真实媒体、透明窗口与本地数据
npm run check   # prettier + eslint + vitest + tsc + vite build
```

## 使用说明

### 交互与外观

点击胶囊或悬停展开（在「设置 → 交互」里切换），拖动面板顶部可移动灵动岛，「恢复默认位置」会回到主屏顶部居中。展开面板每一页高度随内容自适应，「立即」表示鼠标离开面板就收起。调整设置后会立即同步到灵动岛。

### 番茄钟

专注 / 短休 / 长休三段可分别配置时长，达到设定轮数后下一次休息自动使用长休。只有自然结束的专注才计入统计，手动取消不计。今日完成数与近 30 天专注情况保存在本地，跨应用重启保留；但**正在倒计时的计时器本身不会在重启后恢复**。计时结束没有声音，岛上会保持提醒直到确认。

### 喝水

设置每日目标、每杯容量、提醒间隔与提醒时段。到达间隔且当天未达标时，灵动岛出现提醒与喝水动画；提醒只出现在岛上，不弹系统通知。展开喝水页可一键记录一杯或输入自定义毫升数，颜色随完成度从琥珀、天蓝过渡到绿色；设置页可查看近 30 天记录并单独重置今天。

### 音乐与歌词

读取 Windows 当前媒体会话，显示封面（播放时旋转）、曲名、艺人、同步歌词与可拖动进度，并提供上一首 / 播放暂停 / 下一首。歌词按歌名、歌手和时长向网易云音乐与 LRCLIB 查询；未找到、无时间戳或网络失败会分别提示，不会伪造同步结果。

「岛上歌词」开启时，收起胶囊显示歌名和当前歌词；关闭时把音乐放进闲时组件，只显示封面与音轨。没有媒体播放时，闲时音乐组件会轮播示例曲目作为占位展示，**并不是真实播放**。网易云客户端不提供系统时间轴时，会只读本地播放事件日志或已验证版本的时间轴作为回退，该进度不保证可以拖动。

### 邮箱提醒

支持网易 163 / 126、QQ、Gmail 和自定义 IMAP，仅使用 TLS，暂不支持需要 OAuth 的账户。应用在收件箱建立基线后约每 8 秒检查一次新邮件，不改动已读状态：识别到验证码时直接在收起胶囊上显示数字并提供复制，停留到复制或展开为止（最长 2 分钟）；普通邮件显示主题。验证码识别基于文本规则，可能有遗漏或误识别，请以邮件内容为准。

### AI 额度

支持多账户并选择一个常驻灵动岛，每两分钟自动刷新：

| 服务       | 数据来源                                               |
| ---------- | ------------------------------------------------------ |
| Codex      | 本机已登录的 Codex CLI（ChatGPT 周期额度，含重置时间） |
| Kimi Code  | 本机已启动并登录的本地服务（需端口与访问令牌）         |
| DeepSeek   | API 账户余额                                           |
| MiniMax    | Token Plan（中国区 / 国际区）                          |
| OpenRouter | 账户积分（需管理密钥）                                 |

订阅额度用同心圆环展示，单指标时百分比显示在环内；货币余额按金额显示，不推算百分比。只展示服务实际返回的数据，接口缺失或失败时显示错误，不假设满额。

### 系统状态提醒

音量、显示器亮度、电源连接和蓝牙连接发生变化时会短暂接管灵动岛，随后恢复原有内容。亮度依赖显示器与驱动提供的 WMI 数据，外接显示器可能不支持；蓝牙电量仅在 Windows 提供时显示。启动时先建立基线，不会提示已有状态；「设置 → 状态」可刷新读数或用示例数据演示。

## 数据与隐私

- 设置、邮箱账户、邮件游标、AI 账户与每日统计存放于 SQLite。
- 邮箱授权码保存在 Windows 凭据管理器，不写入数据库；AI 密钥与本地服务令牌经 Windows DPAPI 用当前用户身份加密后入库。
- 不保存邮件正文与验证码；邮件提醒仅在内存保留约 5 分钟。
- 「设置 → 数据与存储」可迁移数据目录或复用已有数据库，迁移不会覆盖目标目录中已有的数据库，原目录文件保留。复制数据库到其他 Windows 用户或电脑后，需要重新添加邮箱授权码。

## 已知限制

- 灵动岛停靠在主显示器顶部，可拖动，但尚无全屏避让与多屏分别摆放。
- 计时器运行状态不跨重启恢复（番茄统计会保留）。
- 只有 Codex 返回重置时间，其余服务的接口没有该字段，因此不显示。
- 插件机制尚未实现。
- 浏览器预览（`npm run dev`）只用于调样式，不保存设置，也不调用任何 Windows 能力。

## 开发

### 项目结构

```
src/features   两套窗口（island / main）的界面与交互
src/domain     纯业务逻辑（番茄钟、喝水、额度、显示优先级……）
src/services   Tauri 命令封装、存储与显示适配
src/styles     设计 token、灵动岛与设置页样式
src-tauri/src  Rust：窗口、媒体、歌词、IMAP、AI 额度、SQLite
docs/          架构与开发文档
```

### 提交前检查

```powershell
npm run check
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

窗口、字体、媒体与额度相关的改动还需要在真实 Windows 桌面上验收（透明区域、点击穿透、DPI 缩放、实际播放器）。

更多设计说明见 [技术架构](docs/architecture.md)，开发约定见 [开发规范](docs/development.md)。

## 第三方与许可

项目代码以 [MIT 许可](LICENSE)发布，Copyright (c) 2026 dkj。

- 网易云音乐时间轴适配参考了岛仔项目，许可见 [`src-tauri/DAOZAI-LICENSE.txt`](src-tauri/DAOZAI-LICENSE.txt)。
- AI 服务图标及其归属见 [`src/assets/ai/ATTRIBUTION.txt`](src/assets/ai/ATTRIBUTION.txt)。
- 其余第三方依赖的许可证以其各自仓库为准。
