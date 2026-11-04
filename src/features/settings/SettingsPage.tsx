import { useState, type ReactNode } from "react";
import {
  AppWindow,
  ChevronRight,
  CircleHelp,
  MousePointer2,
  Palette,
  TimerReset,
  Bell,
} from "lucide-react";
import type { AppearanceSettings } from "../../domain/settings";
import { StatusSettings } from "./StatusSettings";

type Page = "appearance" | "behavior" | "status" | "about";
interface Props {
  appearance: AppearanceSettings;
  onAppearanceChange: (value: AppearanceSettings) => void;
  preview: ReactNode;
  status: string;
  canEdit: boolean;
  canSave: boolean;
  onSave: () => void;
}

const navItems: { id: Page; label: string; icon: typeof Palette }[] = [
  { id: "appearance", label: "外观", icon: Palette },
  { id: "behavior", label: "交互与行为", icon: MousePointer2 },
  { id: "status", label: "状态提醒", icon: Bell },
  { id: "about", label: "应用信息", icon: CircleHelp },
];

export function SettingsPage({
  appearance,
  onAppearanceChange,
  preview,
  status,
  canEdit,
  canSave,
  onSave,
}: Props) {
  const [page, setPage] = useState<Page>("appearance");
  return (
    <div className="settings-shell">
      <aside className="settings-sidebar">
        <div className="settings-brand">
          <span className="settings-brand-mark">
            <AppWindow size={18} />
          </span>
          <span>
            灵动岛<small>DESKTOP COMPANION</small>
          </span>
        </div>
        <div className="settings-nav-caption">偏好设置</div>
        <nav aria-label="设置页面">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`settings-nav-item ${page === id ? "selected" : ""}`}
              onClick={() => setPage(id)}
            >
              <Icon size={16} strokeWidth={1.8} />
              <span>{label}</span>
              {page === id && (
                <ChevronRight size={14} className="nav-chevron" />
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="sidebar-status-dot" />
          灵动岛正在运行 <small>版本 0.1.0</small>
        </div>
      </aside>
      <main className="settings-main">
        <header className="settings-header">
          <div>
            <div className="settings-eyebrow">
              PREFERENCES /{" "}
              {page === "appearance"
                ? "APPEARANCE"
                : page === "behavior"
                  ? "BEHAVIOR"
                  : page === "status"
                    ? "STATUS"
                    : "ABOUT"}
            </div>
            <h1>
              {page === "appearance"
                ? "外观"
                : page === "behavior"
                  ? "交互与行为"
                  : page === "status"
                    ? "状态提醒"
                    : "应用信息"}
            </h1>
            <p>
              {page === "appearance"
                ? "让灵动岛自然融入你的桌面。"
                : page === "behavior"
                  ? "调整灵动岛响应鼠标和计时的方式。"
                  : page === "status"
                    ? "查看系统状态，并体验灵动岛提醒。"
                    : "关于灵动岛桌面工具。"}
            </p>
          </div>
          <div className="autosave-status" role="status">
            <span
              className={
                status.includes("失败") ? "status-error-dot" : "status-dot"
              }
            />
            {status}
          </div>
        </header>
        {page === "appearance" && (
          <>
            <section className="appearance-preview-card">
              <div className="card-topline">
                <div>
                  <span className="card-kicker">预览</span>
                  <h2>桌面胶囊</h2>
                </div>
                <span className="preview-live">
                  <i />
                  实时预览
                </span>
              </div>
              {preview}
              <div className="preview-caption">
                <span>顶部居中</span>
                <span>黑色 · 极简</span>
              </div>
            </section>
            <section className="settings-card">
              <div className="settings-card-heading">
                <div>
                  <span className="card-kicker">PERSONALIZE</span>
                  <h2>胶囊样式</h2>
                </div>
              </div>
              <label className="preference-row">
                <span>
                  <strong>胶囊大小</strong>
                  <small>调整默认状态下的显示宽度</small>
                </span>
                <span className="range-control">
                  <input
                    aria-label="胶囊大小"
                    type="range"
                    disabled={!canEdit}
                    min="0.8"
                    max="1.2"
                    step="0.05"
                    value={appearance.scale}
                    onChange={(e) =>
                      onAppearanceChange({
                        ...appearance,
                        scale: Number(e.target.value),
                      })
                    }
                  />
                  <output>{Math.round(appearance.scale * 100)}%</output>
                </span>
              </label>
              <label className="preference-row">
                <span>
                  <strong>显示当前时间</strong>
                  <small>在胶囊收起时显示数字时钟</small>
                </span>
                <input
                  className="toggle-input"
                  type="checkbox"
                  disabled={!canEdit}
                  checked={appearance.showClock}
                  onChange={(e) =>
                    onAppearanceChange({
                      ...appearance,
                      showClock: e.target.checked,
                    })
                  }
                />
              </label>
            </section>
          </>
        )}
        {page === "behavior" && (
          <section className="settings-card behavior-card">
            <div className="settings-card-heading">
              <div className="behavior-icon">
                <TimerReset size={17} />
              </div>
              <div>
                <span className="card-kicker">INTERACTION</span>
                <h2>鼠标离开后自动收起</h2>
                <p>展开灵动岛后，鼠标移出卡片区域，经过设定时间后自动折叠。</p>
              </div>
            </div>
            <div
              className="delay-options"
              role="group"
              aria-label="自动收起等待时间"
            >
              {[
                { value: 0, label: "关闭" },
                { value: 1, label: "1 秒" },
                { value: 3, label: "3 秒" },
                { value: 5, label: "5 秒" },
                { value: 10, label: "10 秒" },
                { value: 15, label: "15 秒" },
              ].map((option) => (
                <button
                  key={option.value}
                  disabled={!canEdit}
                  aria-pressed={appearance.autoCollapseSeconds === option.value}
                  className={
                    appearance.autoCollapseSeconds === option.value
                      ? "active"
                      : ""
                  }
                  onClick={() =>
                    onAppearanceChange({
                      ...appearance,
                      autoCollapseSeconds: option.value,
                    })
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="behavior-hint">
              <MousePointer2 size={15} />
              <span>
                计时器继续运行，只有面板会收起。把鼠标移回胶囊即可重新展开。
              </span>
            </div>
          </section>
        )}
        {page === "status" && <StatusSettings />}
        {page === "about" && (
          <section className="settings-card about-card">
            <div className="about-mark">
              <AppWindow size={24} />
            </div>
            <h2>灵动岛</h2>
            <p>为 Windows 桌面打造的轻量状态与快捷操作入口。</p>
            <div className="about-version">
              版本 <span>0.1.0</span>
            </div>
          </section>
        )}
        <footer className="settings-footer">
          <span>{status}</span>
          <button disabled={!canSave} onClick={onSave}>
            立即保存
          </button>
        </footer>
      </main>
    </div>
  );
}
