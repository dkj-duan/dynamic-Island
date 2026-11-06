# Windows 灵动岛技术架构

## 目标与当前状态

在 Windows 10/11 上提供苹果风格的桌面灵动岛：顶部常驻的透明小窗负责状态展示与快捷操作，独立设置窗口负责配置。当前已实现双窗口、托盘、六页灵动岛、媒体与歌词、系统状态与音频设备切换、邮件验证码、AI 额度、番茄钟/喝水/倒计时、本地存储与迁移。插件运行时尚未实现。

## 技术选型

- Tauri 2：桌面容器、窗口、托盘、单实例与前后端通信；Windows 使用 WebView2。
- React 19、TypeScript、Vite：界面与构建；设置页使用 Ant Design，灵动岛使用自有样式与 CSS 动画。
- Rust：Windows 系统接口、媒体、IMAP、SQLite、凭据与后台轮询。
- SQLite（rusqlite，bundled）：设置与业务数据；Windows 凭据管理器保存邮箱授权码；DPAPI 加密 AI 密钥。

## 分层与依赖方向

1. `src/domain`：与 UI、运行时无关的领域类型与纯逻辑（番茄钟、喝水、倒计时、额度、显示优先级、设置校验与迁移）。
2. `src/features`：按功能组织界面。`island` 渲染灵动岛（计时、音乐、邮件、喝水、AI 额度、设备六页），`settings` 管理设置交互，`mail`/`ai`/`water`/`stats` 提供数据 hooks。
3. `src/services`：Tauri 命令封装、设置/数据仓库、显示与主题适配、i18n。
4. `src-tauri/src`：平台层。前端不直接调用 Windows API，只通过命令与事件交互。

依赖方向为界面 → 领域/服务 → Tauri 边界。领域层不得依赖 UI 或 Tauri。

## 窗口与运行时

- `main`：设置窗口，启动居中，关闭即隐藏；单实例再次启动时显示该窗口。
- `island`：360×320 CSS 视口的透明、无边框、置顶窗口，通过 URL `?window=island` 选择界面。
- 灵动岛 WebView 尺寸固定，展开/收起由 CSS 动画完成。收起后通过原生窗口区域（`set_island_panel_bounds`）限制绘制与命中范围，透明区域点击穿透；展开前恢复区域。
- 高分辨率屏幕按逻辑宽度分级缩放 WebView（1.0–1.4），布局仍按 360×320 CSS 像素计算。
- 托盘提供显示设置、输出设备子菜单、开机自启动与退出；设备列表变化时重建菜单。
- 开机自启动使用 `tauri-plugin-autostart`，启动参数 `--autostart` 使应用只显示灵动岛、不弹设置窗口。
- Windows 使用 `tauri-plugin-single-instance`，避免两个进程写入不同数据库。

## 系统集成

### 媒体与歌词

通过 Global System Media Transport Controls 读取当前会话、曲目与封面，并发送播放/暂停、上一首、下一首请求。部分播放器（如网易云）暴露会话却拒绝控制请求，此时回退到系统媒体按键再试一次，仍失败则向界面返回具体原因。歌词按歌名、歌手与时长查询网易云音乐与 LRCLIB；封面来自网易云 CDN 并校验协议、体积与格式。切歌时旧请求不得覆盖新歌曲。网易云客户端不提供系统时间轴时，只读本机播放事件日志或已验证版本的时间轴作为回退。

### 系统状态与音频设备

- Core Audio：默认输出设备音量/静音、默认输出与默认输入设备；WMI：显示器亮度；Win32：交流电与电池；WinRT：已连接蓝牙设备及电量。
- 灵动岛每秒轮询系统状态、每三秒轮询设备状态，按快照比较变化；启动时先建立基线，不提示已有状态。
- 状态采集在后台线程执行，不阻塞窗口线程；失败时保留上一份快照，避免误报断开。
- 设备页通过 `get_audio_devices` 获取输出与输入端点，`set_audio_device` 切换默认设备。枚举使用公开的 Core Audio 接口；切换使用未公开的 `IPolicyConfig`（Win10/11 通用），同时设置 Console/Multimedia/Communications 三个角色，失败会向界面返回错误。
- 设备列表不滚动：按数量收缩行高，超过阈值后折成多列，面板高度计入提示条与顶部横幅。

### 邮箱

账户以独立 ID 存储于 SQLite；授权码保存在当前 Windows 用户凭据管理器，并与邮箱地址、服务器及端口绑定。后台以 TLS 连接 IMAP，使用只读 `EXAMINE` 与 `BODY.PEEK`，按 UIDVALIDITY/UID 记录检查位置；首次添加以现有邮件为基线。检查间隔约 8 秒，连接按账户复用，失效时丢弃缓存并重连一次。每次读取限制响应大小；验证码按本地规则从纯文本提取。邮件正文与验证码不持久化，提醒仅在内存保留约 5 分钟。

### AI 额度

支持 Codex（本机 CLI App Server）、Kimi Code（仅本机 HTTP 服务）、DeepSeek、MiniMax（中国区/国际区）与 OpenRouter。密钥经 DPAPI 用当前 Windows 用户加密后存入 `ai_accounts`；本地服务令牌同样加密。每两分钟刷新，常驻账户的额度显示在灵动岛；只展示服务实际返回的额度，失败或字段缺失时显示错误。

### 存储与迁移

- SQLite 位于可配置的数据目录，默认使用应用数据目录；位置索引写在应用配置目录的 `data-location.json`。
- 数据库 `PRAGMA user_version` 当前为 4：`settings`（键值 JSON）、`mail_accounts`、`ai_accounts`、`daily_stats`。
- 设置结构带版本（外观当前为 v12），读取时校验版本与字段；未知或未来版本报错而不是覆盖。
- 切换数据目录使用 SQLite 备份、完整性检查与原子更新索引；不覆盖目标目录已有文件，旧目录保留。
- 数据库连接与迁移失败时不静默重建，避免覆盖用户数据。

## 前端结构

- `src/main.tsx` 按窗口 URL 选择 `IslandWindow` 或设置界面。
- 灵动岛状态主要包括：展开状态、当前页、计时器、番茄进度、喝水、计次、媒体、邮件、AI 额度与系统状态。
- 设置窗口使用 Ant Design 组件与各设置页；修改通过仓库层保存并广播事件。

### 事件

| 事件                                                        | 方向          | 用途                   |
| ----------------------------------------------------------- | ------------- | ---------------------- |
| `appearance-changed`                                        | 设置 → 灵动岛 | 外观/语言/闲时组件更新 |
| `pomodoro-changed` / `water-changed` / `countdowns-changed` | 设置 → 灵动岛 | 配置同步               |
| `mail-accounts-changed` / `ai-accounts-changed`             | 设置 → 灵动岛 | 账户列表同步           |
| `ai-quota-updated`                                          | Rust → 两窗口 | 额度刷新结果           |
| `daily-stats-changed`                                       | Rust → 两窗口 | 喝水/番茄统计更新      |
| `autostart-changed`                                         | Rust → 设置   | 自启动状态变化         |
| `system-notice-preview`                                     | 设置 → 灵动岛 | 演示系统提示           |
| `island-lyrics-changed`                                     | 灵动岛 → 设置 | 岛上歌词开关           |

## 命令面

Tauri 命令按模块注册，主要包括：

- 窗口/托盘：`open_settings`、`show_settings_window`、`quit_app`、`set_island_expanded`、`set_island_panel_bounds`、`apply_island_scale`、`start_island_drag`、`reset_island_position`、`set_window_theme`、`get_system_theme`。
- 自启动：`get_autostart`、`set_autostart`、`is_autostart_launch`。
- 媒体：`get_media_state`、`get_media_artwork`、`control_media`、`seek_media`；歌词 `lyrics::get_lyrics`。
- 系统与音频：`system_status::get_system_status`、`system_status::get_device_status`、`get_audio_devices`、`set_audio_device`。
- 邮件：`mail::list_mail_accounts`、`add_mail_account`、`remove_mail_account`、`poll_mail`、`get_mail_monitor_status`、`copy_mail_code`。
- AI：`ai_quota::list_ai_accounts`、`add_ai_account`、`remove_ai_account`、`pin_ai_account`、`query_ai_quota`。
- 存储：`load/save_*` 系列、`get_daily_stats`、`add_water`、`reset_water`、`record_pomodoro`、`get_data_directory`、`set_data_directory`、`use_existing_data_directory`。

## 安全与隐私边界

- 外部数据（网络响应、IMAP 邮件、本机服务输出）先校验再使用；限制重定向、响应大小与超时。
- 凭据不写入日志、不提交仓库；邮箱授权码只进凭据管理器，AI 密钥只以 DPAPI 密文入库。
- 所有网络请求发往固定可信域名；Kimi 只访问 `127.0.0.1`。详细清单见 README「数据与隐私」。
- 应用不包含遥测与自动更新检查。

## 验证

每个新功能在领域逻辑边界写单元测试；平台功能必须在真实 Windows 桌面手工验收：透明窗口、点击穿透、DPI、真实播放器、IMAP 账户与音频设备。依赖变更须提交 npm 与 Cargo 锁文件。

## 扩展设计（规划，尚未承诺稳定协议）

未来插件使用独立进程与版本化消息通信：清单声明 ID、协议版本、能力和入口；宿主管理启动、停止、超时、错误与重启。活动消息包含来源、稳定 ID、标题、摘要、优先级和时间；操作通过显式 action ID 往返。明确版本协商、资源限制与卸载流程后再发布 SDK。进程隔离不等于安全沙箱，运行第三方代码前必须确认来源与权限。
