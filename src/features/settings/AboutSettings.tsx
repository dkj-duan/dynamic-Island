import { SettingsCard } from "./SettingsCard";
import {
  Bell,
  Bot,
  Droplets,
  Mail,
  Music2,
  Palette,
  Timer,
} from "lucide-react";
import { t } from "../../services/i18n";
import appIcon from "../../assets/app-icon.png";
const aboutFeatures: { icon: typeof Palette; label: string; text: string }[] = [
  {
    icon: Timer,
    label: "计时器与番茄钟",
    text: "一键开始专注或休息，结束时灵动岛持续提醒。",
  },
  {
    icon: Music2,
    label: "音乐控制",
    text: "显示曲名、歌手与同步歌词，可直接切歌和暂停。",
  },
  {
    icon: Mail,
    label: "邮箱验证码",
    text: "新邮件验证码直接显示在岛上，一键复制。",
  },
  {
    icon: Bot,
    label: "AI 额度",
    text: "Codex、DeepSeek 等账户的余额与订阅额度常驻显示。",
  },
  {
    icon: Droplets,
    label: "喝水打卡",
    text: "记录每日饮水量，进度以圆环显示在灵动岛。",
  },
  {
    icon: Bell,
    label: "系统状态提醒",
    text: "音量、亮度、电源与蓝牙变化即时提示。",
  },
];

export function AboutSettings({ onStorage }: { onStorage: () => void }) {
  return (
    <>
      <SettingsCard>
        <div className="about-head">
          <span className="about-mark" aria-hidden="true">
            <img src={appIcon} alt="" />
          </span>
          <div>
            <h2>{t("灵动岛")}</h2>
            <p>{t("为 Windows 桌面打造的状态提醒与快捷操作入口。")}</p>
          </div>
        </div>
        <dl className="about-rows">
          <div>
            <dt>{t("版本")}</dt>
            <dd>0.1.0</dd>
          </div>
          <div>
            <dt>{t("技术栈")}</dt>
            <dd>Tauri 2 · React 19 · Rust</dd>
          </div>
          <div>
            <dt>{t("运行环境")}</dt>
            <dd>Windows 10/11 · WebView2</dd>
          </div>
          <div>
            <dt>{t("数据")}</dt>
            <dd>{t("本机 SQLite，凭据使用 Windows 用户加密")}</dd>
          </div>
          <div>
            <dt>{t("项目地址")}</dt>
            <dd>
              <a
                className="about-link"
                href="https://github.com/dkj-duan/dynamic-Island"
                target="_blank"
                rel="noreferrer"
              >
                github.com/dkj-duan/dynamic-Island
              </a>
            </dd>
          </div>
        </dl>
        <div className="button-row">
          <button
            className="btn btn-quiet"
            type="button"
            onClick={() => onStorage()}
          >
            {t("查看数据目录")}
          </button>
        </div>
      </SettingsCard>

      <SettingsCard>
        <div className="card-head">
          <h2>{t("主要功能")}</h2>
        </div>
        <div className="feature-grid">
          {aboutFeatures.map(({ icon: Icon, label, text }) => (
            <div className="feature-item" key={label}>
              <span className="feature-icon" aria-hidden="true">
                <Icon size={15} />
              </span>
              <div>
                <strong>{t(label)}</strong>
                <small>{t(text)}</small>
              </div>
            </div>
          ))}
        </div>
      </SettingsCard>
    </>
  );
}
