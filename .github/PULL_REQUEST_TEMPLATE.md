## 改动内容

<!-- 说明改了什么，以及为什么需要这次改动。关联 Issue：Closes # -->

## 用户可见效果

<!-- 界面、交互或数据上的变化；无用户可见变化时写“无”。 -->

## 验证

- [ ] `npm run check`
- [ ] `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
- [ ] `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml`
- [ ] 在真实 Windows 桌面验证（Windows 版本 / 分辨率 / 缩放：）

## 检查清单

- [ ] 没有提交密钥、授权码、真实邮件内容、数据库、日志或未脱敏截图。
- [ ] 配置或数据库结构变更包含版本迁移与失败测试。
- [ ] 外部数据经过校验，网络请求限制超时、响应大小与重定向。
- [ ] UI 改动附脱敏截图；未验证的路径已在描述中说明。
- [ ] 同步更新了相关文档与 `CHANGELOG.md`（如适用）。
