# 贡献指南

感谢你愿意改进 Dynamic Island for Windows。这个项目面向 Windows 10/11 的桌面体验，涉及透明窗口、系统媒体、IMAP、音频设备与本地凭据，改动质量比改动数量更重要。

## 先讨论，再动手

- 小修复（错别字、样式细节、明确的 bug）可以直接提交 Pull Request。
- 新功能、窗口/布局重构、数据结构或依赖变更，请先开 Issue 说明场景、方案与取舍，避免做完后方向不一致。
- 安全漏洞不要走公开 Issue，请按 [安全策略](SECURITY.md) 私下报告。

## 开发环境

```powershell
npm ci
npm run tauri dev
```

环境要求、命令与调试注意事项见[开发规范](docs/development.md)。`npm run dev` 只是浏览器预览，不能验证 Windows 能力。

## 提交前

```powershell
npm run check
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

涉及窗口、样式、媒体、邮件、额度或音频设备的改动，还需要在真实 Windows 桌面手工验收，并在 PR 中写明验证方式。只有静态检查通过、没有实际验证的 UI 改动请明确说明。

## 代码与提交

- 遵循 `src/domain`（纯逻辑）、`src/features`（界面）、`src-tauri/src`（平台能力）的分层；前端不要直接调用 Windows API。
- 外部数据先校验再使用；网络请求限制超时、响应大小与重定向目标。
- 配置与数据库结构变更必须带版本、迁移和失败测试；读取失败时不得覆盖用户数据。
- 提交信息使用简短的英文祈使句，例如 `Fix island panel bounds on DPI change`；一个提交只做一件事。
- 提交前确认没有把密钥、授权码、真实邮件内容、数据库、日志或个人截图带入仓库。

## Pull Request

- 描述改动原因、用户可见效果与取舍；关联相关 Issue（如 `Closes #12`）。
- UI 改动附上脱敏后的截图或录屏，说明测试的分辨率、主题与缩放比例。
- 平台功能写明运行环境（Windows 版本、播放器、音频设备），并说明哪些路径没有验证。
- 不要提交格式化无关文件、构建产物或锁文件以外的生成物。

## 许可

提交代码即表示同意以本项目的 [MIT 许可](LICENSE) 发布你的贡献。第三方素材或代码必须在 PR 中注明来源与许可证。
