# 开发与质量规范

- 前端使用严格 TypeScript；组件不直接操作 Windows API，存储等边界封装在 service 中。外部数据先校验再使用。
- Rust 使用 `cargo fmt` 与 Clippy；平台错误应向调用者返回，不在业务代码中忽略。
- 配置格式带版本号；读取失败时禁止覆盖原配置。后续升级必须提供迁移和相应测试。当前官方 Store 插件负责文件存取，不保证本文之外的原子写入语义。
- 不提交密钥、`node_modules`、构建产物；依赖变更提交 npm 和 Cargo 锁文件。
- 对有业务价值的边界（校验、调度、迁移、故障恢复）编写测试；系统交互还需 Windows 手工验收。

提交前运行：

```powershell
npm ci
npm run check
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

`npm run format` 自动格式化前端和文档，`cargo fmt --manifest-path src-tauri/Cargo.toml` 格式化 Rust。GitHub Actions 在 Windows 上运行同一组检查；本地检查同样适用于未托管在 GitHub 的项目。
