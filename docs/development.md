# 开发与质量规范

## 环境要求

- Windows 10/11（建议开启系统还原或使用可回滚的测试账户）。
- Node.js 20+ 与 npm；Rust stable（MSVC toolchain）。
- [Tauri 2 Windows 前置依赖](https://v2.tauri.app/start/prerequisites/)，包括 Microsoft C++ Build Tools、Windows SDK 与 WebView2 运行时。
- 真实桌面验收需要可用的媒体播放器、音频设备；邮箱与 AI 额度功能需要你自己的账户。

## 初始化与运行

```powershell
npm ci
npm run tauri dev
```

`npm run tauri dev` 会同时启动 Vite（固定 `127.0.0.1:1420`）与 Rust 后端。端口被占用时会直接失败；先结束旧的 dev 进程，不要让 Vite 换端口，否则 `devUrl` 不匹配会导致空白窗口。

`npm run dev` 只是浏览器预览，不涉及透明窗口、真实媒体、凭据或本机服务，不能作为功能验收依据。

## 常用命令

| 命令                                              | 作用                                              |
| ------------------------------------------------- | ------------------------------------------------- |
| `npm run tauri dev`                               | 启动桌面应用（Vite + Rust）                       |
| `npm run dev`                                     | 仅浏览器预览样式                                  |
| `npm run check`                                   | Prettier 检查、ESLint、Vitest、`tsc` 与 Vite 构建 |
| `npm run format`                                  | 格式化前端与文档                                  |
| `npm run tauri build`                             | 构建 NSIS 安装包                                  |
| `cargo fmt --manifest-path src-tauri/Cargo.toml`  | 格式化 Rust                                       |
| `cargo test --manifest-path src-tauri/Cargo.toml` | Rust 单元测试                                     |

## 代码约定

- 前端使用严格 TypeScript。组件不直接调用 Windows API，平台能力经 `src/services` 与 Tauri 命令访问。
- 领域逻辑放 `src/domain`，保持纯函数与可测试；UI 与功能放 `src/features`，Windows 能力与存储放 `src-tauri/src`。
- 外部数据（网络响应、IMAP、本机服务输出）先校验再使用；限制重定向、响应大小与超时。
- Rust 使用 `cargo fmt` 与 Clippy。平台错误应返回给调用者，不在业务代码中静默忽略。
- 配置与 SQLite 结构带版本号；读取失败时禁止覆盖原配置。结构变更必须提供迁移与失败测试。
- 不提交密钥、`node_modules`、构建产物、数据库或日志。依赖变更同时提交 npm 与 Cargo 锁文件。
- 新依赖需要说明用途并尽量选择维护活跃的库；不要为假设中的需求提前引入依赖。

## 提交前检查

```powershell
npm run check
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

GitHub Actions 在 `windows-latest` 上运行同一组检查（见 `.github/workflows/quality.yml`）。

## 手工验收

以下改动必须在真实 Windows 桌面验证，不能只看浏览器预览或构建通过：

- 窗口、字体、透明区域、点击穿透、DPI 缩放与展开/收起动画。
- 浅色/深色设置页、1080p 与 2K 逻辑分辨率、最小胶囊尺寸与展开布局。
- 媒体播放、控制、进度、歌词与切歌竞态；真实播放器的限制要如实显示。
- 邮件账户检查、验证码识别与凭据读取；不要用真实邮箱内容做公开截图或日志。
- 音频设备枚举与默认设备切换：测试后恢复原来的默认设备。
- AI 额度只展示服务实际返回值；失败与无额度不能显示为满额。

调试时避免留下持久化副作用：临时修改设置或数据后要恢复，并确认数据库与默认设备已复原。

## 文档与截图

- 功能变化时同步更新 README、`docs/architecture.md` 与本文件；发布相关变更更新 `CHANGELOG.md`。
- 截图放在 `docs/screenshots/`，使用真实桌面窗口；出现账户名、余额、邮箱、设备名或个人路径时必须先脱敏。
- 相对链接必须指向仓库内真实文件；提交前检查 Markdown 渲染与图片尺寸。

## 已知依赖告警

当前稳定版 `imap` 依赖的 `imap-proto 0.10.2` 在现用 Rust 编译器下有未来兼容性警告。升级 Rust 或邮件依赖时应检查该警告，并重新验收网易邮箱的 IMAP ID 握手。

## 发布

版本号以 `package.json`、`src-tauri/Cargo.toml` 与 `src-tauri/tauri.conf.json` 为准，三处需一致。发布步骤见[发布流程](release.md)。
