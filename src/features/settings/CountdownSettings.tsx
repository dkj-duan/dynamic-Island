import { SettingsCard } from "./SettingsCard";
import { TimeSelect } from "./TimeSelect";
import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import { Clock3, Hourglass, Plus } from "lucide-react";
import {
  MAX_COUNTDOWNS,
  defaultCountdowns,
  formatDurationSeconds,
  type CountdownItem,
  type CountdownKind,
  type CountdownSettings as CountdownSettingsValue,
} from "../../domain/countdown";
import {
  loadCountdowns,
  saveCountdowns,
} from "../../services/countdownRepository";
import { t } from "../../services/i18n";

type Draft = {
  id: string | null;
  label: string;
  kind: CountdownKind;
  targetTime: string;
  minutes: string;
  seconds: string;
};

function draftFor(item?: CountdownItem): Draft {
  if (!item) {
    return {
      id: null,
      label: "",
      kind: "target",
      targetTime: "18:00",
      minutes: "",
      seconds: "00",
    };
  }
  if (item.kind === "target") {
    return {
      id: item.id,
      label: item.label,
      kind: "target",
      targetTime: item.targetTime ?? "18:00",
      minutes: "",
      seconds: "00",
    };
  }
  const seconds = item.durationSeconds ?? 60;
  return {
    id: item.id,
    label: item.label,
    kind: "duration",
    targetTime: "18:00",
    minutes: String(Math.floor(seconds / 60)),
    seconds: String(seconds % 60).padStart(2, "0"),
  };
}

function newId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function CountdownSettings() {
  const desktop = isTauri();
  const [settings, setSettings] =
    useState<CountdownSettingsValue>(defaultCountdowns);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void loadCountdowns().then((stored) => {
      if (active) setSettings(stored);
    });
    return () => {
      active = false;
    };
  }, []);

  async function persist(next: CountdownSettingsValue) {
    setBusy(true);
    setError("");
    try {
      await saveCountdowns(next);
      setSettings(next);
      setStatus(t("已保存"));
      if (isTauri()) {
        void emitTo("island", "countdowns-changed").catch(() => {});
      }
    } catch (value) {
      setError(typeof value === "string" ? value : t("保存失败，请重试"));
    } finally {
      setBusy(false);
    }
  }

  function startAdd() {
    setDraft(draftFor());
    setError("");
    setStatus("");
  }

  function startEdit(item: CountdownItem) {
    setDraft(draftFor(item));
    setError("");
    setStatus("");
  }

  async function submit() {
    if (!draft) return;
    const label = draft.label.trim();
    if (!label) {
      setError(t("请输入名称"));
      return;
    }
    let item: CountdownItem;
    const id = draft.id ?? newId();
    if (draft.kind === "target") {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.targetTime)) {
        setError(t("请输入有效时间，例如 18:00"));
        return;
      }
      item = {
        id,
        label,
        kind: "target",
        targetTime: draft.targetTime,
        durationSeconds: null,
      };
    } else {
      const minutes = Number(draft.minutes || "0");
      const seconds = Number(draft.seconds || "0");
      if (
        !/^\d{0,3}$/.test(draft.minutes) ||
        !/^\d{0,2}$/.test(draft.seconds) ||
        seconds > 59 ||
        (minutes === 0 && seconds === 0)
      ) {
        setError(t("请输入有效时长（秒数为 0–59）"));
        return;
      }
      item = {
        id,
        label,
        kind: "duration",
        targetTime: null,
        durationSeconds: minutes * 60 + seconds,
      };
    }
    const exists = settings.items.some((entry) => entry.id === id);
    const items = exists
      ? settings.items.map((entry) => (entry.id === id ? item : entry))
      : [...settings.items, item];
    if (items.length > MAX_COUNTDOWNS) {
      setError(t("最多添加 8 个倒计时"));
      return;
    }
    await persist({
      ...settings,
      items,
      islandId: settings.islandId ?? (items.length === 1 ? id : null),
    });
    setDraft(null);
  }

  async function remove(item: CountdownItem) {
    if (!window.confirm(t("确定删除这个倒计时？"))) return;
    await persist({
      ...settings,
      items: settings.items.filter((entry) => entry.id !== item.id),
      islandId: settings.islandId === item.id ? null : settings.islandId,
    });
    setDraft((current) => (current?.id === item.id ? null : current));
  }

  const islandItem = settings.items.find(
    (item) => item.id === settings.islandId,
  );

  return (
    <div className="settings-stack">
      <SettingsCard>
        <div className="card-head">
          <h2>{t("倒计时")}</h2>
          <button
            className="btn btn-primary"
            onClick={startAdd}
            disabled={
              !desktop || busy || settings.items.length >= MAX_COUNTDOWNS
            }
          >
            <Plus size={13} />
            {t("添加倒计时")}
          </button>
        </div>
        <p className="card-desc">
          {t("用于下班、午休或任意时长；空闲胶囊只显示选中的一条。")}
        </p>
        <p className="card-hint">
          {islandItem
            ? `${t("空闲胶囊显示")} ${islandItem.label}`
            : t("空闲胶囊不显示倒计时")}
          {islandItem && (
            <button
              className="btn btn-quiet"
              disabled={!desktop || busy}
              onClick={() => void persist({ ...settings, islandId: null })}
            >
              {t("取消显示")}
            </button>
          )}
        </p>
        {settings.items.length === 0 ? (
          <p className="form-note">
            {t("还没有倒计时。添加下班时间或固定时长，选中后显示在空闲胶囊。")}
          </p>
        ) : (
          <div className="settings-list">
            {settings.items.map((item) => (
              <div className="settings-list-row" key={item.id}>
                <span className="settings-list-icon" aria-hidden="true">
                  {item.kind === "target" ? (
                    <Clock3 size={15} />
                  ) : (
                    <Hourglass size={15} />
                  )}
                </span>
                <div className="settings-list-copy">
                  <strong>{item.label}</strong>
                  <small>
                    {item.kind === "target"
                      ? `${t("目标时间")} ${item.targetTime}`
                      : `${t("时长")} ${formatDurationSeconds(item.durationSeconds ?? 0)}`}
                  </small>
                </div>
                <label className="countdown-island-radio">
                  <input
                    type="radio"
                    name="countdown-island"
                    checked={settings.islandId === item.id}
                    disabled={!desktop || busy}
                    onChange={() =>
                      void persist({ ...settings, islandId: item.id })
                    }
                  />
                  <span>{t("显示在岛上")}</span>
                </label>
                <button
                  className="btn btn-quiet"
                  disabled={!desktop || busy}
                  onClick={() => startEdit(item)}
                >
                  {t("编辑")}
                </button>
                <button
                  className="btn btn-quiet btn-danger"
                  disabled={!desktop || busy}
                  onClick={() => void remove(item)}
                >
                  {t("删除")}
                </button>
              </div>
            ))}
          </div>
        )}
        {draft && (
          <form
            className="countdown-editor"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <div className="card-head">
              <h3>{draft.id ? t("编辑倒计时") : t("添加倒计时")}</h3>
            </div>
            <label className="field">
              <span>{t("名称")}</span>
              <input
                value={draft.label}
                maxLength={24}
                disabled={!desktop || busy}
                placeholder={t("例如：下班、午休")}
                onChange={(event) =>
                  setDraft({ ...draft, label: event.target.value })
                }
                autoFocus
              />
            </label>
            <div
              className="segmented"
              role="group"
              aria-label={t("倒计时类型")}
            >
              {(["target", "duration"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  disabled={!desktop || busy}
                  aria-pressed={draft.kind === kind}
                  className={draft.kind === kind ? "active" : ""}
                  onClick={() => setDraft({ ...draft, kind })}
                >
                  {kind === "target" ? t("目标时间") : t("时长")}
                </button>
              ))}
            </div>
            {draft.kind === "target" ? (
              <div className="field">
                <span>{t("目标时间")}</span>
                <TimeSelect
                  value={draft.targetTime}
                  disabled={!desktop || busy}
                  onChange={(value) =>
                    setDraft({ ...draft, targetTime: value })
                  }
                />
              </div>
            ) : (
              <div className="field-row">
                <label className="field">
                  <span>{t("分钟")}</span>
                  <input
                    inputMode="numeric"
                    maxLength={3}
                    value={draft.minutes}
                    disabled={!desktop || busy}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        minutes: event.target.value.replace(/\D/g, ""),
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span>{t("秒")}</span>
                  <input
                    inputMode="numeric"
                    maxLength={2}
                    value={draft.seconds}
                    disabled={!desktop || busy}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        seconds: event.target.value.replace(/\D/g, ""),
                      })
                    }
                  />
                </label>
              </div>
            )}
            <div className="btn-row">
              <button
                className="btn btn-primary"
                type="submit"
                disabled={!desktop || busy}
              >
                {t("保存")}
              </button>
              <button
                className="btn btn-quiet"
                type="button"
                disabled={busy}
                onClick={() => setDraft(null)}
              >
                {t("取消")}
              </button>
            </div>
          </form>
        )}
        <p className="card-hint" role="status">
          {error || status}
        </p>
      </SettingsCard>
    </div>
  );
}
