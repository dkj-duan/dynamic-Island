import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Database, FolderOpen } from "lucide-react";

export function StorageSettings({
  canSwitch,
  onChanged,
}: {
  canSwitch: boolean;
  onChanged: () => Promise<void>;
}) {
  const [directory, setDirectory] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const desktop = isTauri();
  useEffect(() => {
    if (!desktop) return;
    let active = true;
    void invoke<string>("get_data_directory")
      .then((value) => {
        if (active) setDirectory(value);
      })
      .catch(() => {
        if (active) setMessage("无法读取数据目录");
      });
    return () => {
      active = false;
    };
  }, [desktop]);
  async function chooseDirectory(existing: boolean) {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择数据存放目录",
      });
      if (!selected) return;
      setBusy(true);
      const result = await invoke<string>(
        existing ? "use_existing_data_directory" : "set_data_directory",
        {
          directory: selected,
        },
      );
      setDirectory(result);
      try {
        await onChanged();
        setMessage(
          existing
            ? "已切换到已有数据，原目录数据保留。"
            : "数据已复制到新目录，原目录保留备份。",
        );
      } catch {
        setMessage("数据目录已切换，但设置同步失败，请重启应用。");
      }
    } catch (error) {
      setMessage(`切换失败：${String(error)}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-card storage-card">
      <div className="settings-card-heading">
        <span className="behavior-icon">
          <Database size={17} />
        </span>
        <div>
          <span className="card-kicker">DATA</span>
          <h2>数据存放位置</h2>
        </div>
      </div>
      <p>
        设置和邮箱账户信息保存在本机数据库中。邮箱授权码由 Windows
        凭据管理器保存。
      </p>
      <div className="storage-path">
        {desktop ? directory || "正在读取…" : "请在桌面应用中查看"}
      </div>
      <div className="storage-actions">
        <button
          className="status-refresh"
          disabled={!desktop || busy || !canSwitch}
          onClick={() => void chooseDirectory(false)}
        >
          <FolderOpen size={14} />
          {busy ? "处理中…" : "迁移到其他目录"}
        </button>
        <button
          className="status-refresh"
          disabled={!desktop || busy || !canSwitch}
          onClick={() => void chooseDirectory(true)}
        >
          使用已有数据
        </button>
      </div>
      <p className="storage-hint">
        迁移会复制并校验数据，不覆盖已有数据库。使用已有数据时，原目录的数据保留。
      </p>
      {message && (
        <p role="status" className="storage-hint">
          {message}
        </p>
      )}
    </section>
  );
}
