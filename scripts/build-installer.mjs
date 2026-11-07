#!/usr/bin/env node
/**
 * 打包 Windows 安装包，并可先把版本号写入三处配置。
 *
 * 用法:
 *   node scripts/build-installer.mjs <版本号>     # 例: 0.2.0
 *   npm run installer -- <版本号>
 *
 * 版本号会同步写入:
 *   - src-tauri/tauri.conf.json  (应用运行时读取的版本)
 *   - package.json               (npm 元数据)
 *   - src-tauri/Cargo.toml       ([package] 版本，保持一致)
 *
 * 脚本会先停掉正在运行的 dev 会话 (它们会锁住构建目录和端口)，
 * 然后执行 `npm run tauri build`，最后输出安装包路径。
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(
    "用法: npm run installer -- <版本号>    例如: npm run installer -- 0.2.0",
  );
  process.exit(1);
}

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

/** Reads the config so the finished installer path can be reported. */
const tauriConfPath = path.join(root, "src-tauri", "tauri.conf.json");
const tauriConf = JSON.parse(readFileSync(tauriConfPath, "utf8"));
const productName = tauriConf.productName ?? "app";

/** Stops a running dev session: it locks the cargo build dir and port 1420. */
function stopDevSession() {
  console.log("• 停止正在运行的 dev 会话（如有）…");
  spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      [
        "Get-Process dynamic-island,cargo -ErrorAction SilentlyContinue | Stop-Process -Force",
        "(Get-NetTCPConnection -LocalPort 1420 -State Listen -ErrorAction SilentlyContinue)" +
          ".OwningProcess | Select-Object -Unique | ForEach-Object { Stop-Process -Id $_ -Force }",
      ].join("; "),
    ],
    { stdio: "inherit", shell: true },
  );
}

/** Replaces the first `pattern` match in `file`; a no-op is fine when that
 *  match already carries the requested version. */
function setVersion(file, pattern, replacement, version, label) {
  const full = path.join(root, file);
  if (!existsSync(full)) fail(`${file} 不存在`);
  const before = readFileSync(full, "utf8");
  const match = before.match(pattern);
  if (!match) fail(`${label} 版本号字段未找到 (${file})`);
  if (match[0].endsWith(version)) {
    console.log(`✓ ${label} 已是 ${version} (${file})`);
    return;
  }
  const after = before.replace(pattern, replacement);
  if (after === before) fail(`${label} 版本号替换失败 (${file})`);
  writeFileSync(full, after);
  console.log(`✓ ${label} → ${version} (${file})`);
}

stopDevSession();

console.log(`• 写入版本号 ${version}…`);
setVersion(
  path.join("src-tauri", "tauri.conf.json"),
  /("version"\s*:\s*")[^"]+/,
  `$1${version}`,
  version,
  "tauri.conf.json",
);
setVersion(
  "package.json",
  /("version"\s*:\s*")[^"]+/,
  `$1${version}`,
  version,
  "package.json",
);
setVersion(
  path.join("src-tauri", "Cargo.toml"),
  /^(version\s*=\s*")[^"]+/m,
  `$1${version}`,
  version,
  "Cargo.toml",
);

console.log("• 开始打包（release 构建 + NSIS 安装包，可能需要几分钟）…");
const build = spawnSync("npm", ["run", "tauri", "build"], {
  stdio: "inherit",
  shell: true,
  cwd: root,
});
if (build.status !== 0) fail(`打包失败 (exit ${build.status})`);

const installer = path.join(
  root,
  "src-tauri",
  "target",
  "release",
  "bundle",
  "nsis",
  `${productName}_${version}_x64-setup.exe`,
);
if (!existsSync(installer)) fail(`未找到安装包: ${installer}`);

// NSIS leaves build journals behind; the installer is the deliverable.
rmSync(`${installer}.log`, { force: true });

console.log(`\n✔ 安装包已生成:\n  ${installer}\n`);
console.log("提示: 版本号改动尚未提交，确认无误后自行 git 提交。");
