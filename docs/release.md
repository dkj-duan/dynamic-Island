# 发布流程

## 版本号

版本号保存在三处，必须保持一致：

- `package.json` 的 `version`
- `src-tauri/Cargo.toml` 的 `[package] version`
- `src-tauri/tauri.conf.json` 的 `version`

每次发布前同步这三处，并在 `CHANGELOG.md` 中补充对应版本的内容。

## 本地构建

```powershell
npm ci
npm run check
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri build
```

NSIS 安装包输出到 `src-tauri/target/release/bundle/nsis/`。安装包未签名，Windows SmartScreen 可能提示未知发布者；正式分发需要代码签名证书。

## 通过 GitHub Actions 发布

1. 确认三处版本号与 `CHANGELOG.md` 已更新并提交。
2. 推送标签（与版本号一致，例如 `v0.1.0`）：

   ```powershell
   git tag v0.1.0
   git push origin v0.1.0
   ```

3. `.github/workflows/release.yml` 会在 `windows-latest` 上执行检查、构建 NSIS 安装包，并创建一个**草稿** Release。工作流会校验标签版本与 `package.json` 是否一致。
4. 在 GitHub Releases 页面检查产物与说明后手动发布。

当前不提供自动更新（无 updater 配置），升级需要重新下载安装包。签名与更新源确定后再调整工作流。

## 回滚

- 若发布说明或产物有误，先取消发布草稿或删除对应 Release 与标签，修复后重新打标签。
- 不要对已发布的标签强制推送；版本号只增不复用。
