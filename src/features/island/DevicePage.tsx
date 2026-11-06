import type { CSSProperties, ReactNode } from "react";
import { Check, Headphones, LoaderCircle, Mic, Volume2 } from "lucide-react";
import type { AudioDevice } from "../../domain/systemNotices";
import { t } from "../../services/i18n";
import { deviceLayout } from "./deviceLayout";
import type { useAudioDevices } from "./useAudioDevices";

type Props = {
  deviceState: ReturnType<typeof useAudioDevices>;
};

function DeviceGroup({
  label,
  icon,
  devices,
  emptyLabel,
  switching,
  onSelect,
}: {
  label: string;
  icon: ReactNode;
  devices: AudioDevice[];
  emptyLabel: string;
  switching: string;
  onSelect: (device: AudioDevice) => void;
}) {
  return (
    <div className="device-group" role="group" aria-label={label}>
      <div className="device-group-head">
        {icon}
        <span>{label}</span>
        {devices.length > 0 && (
          <em className="device-group-count">{devices.length}</em>
        )}
      </div>
      <div className="device-rows">
        {devices.length === 0 ? (
          <span className="device-empty">{emptyLabel}</span>
        ) : (
          devices.map((device) => (
            <button
              key={device.id}
              type="button"
              className={`device-row ${device.isDefault ? "is-default" : ""}`}
              disabled={switching !== ""}
              aria-pressed={device.isDefault}
              aria-label={`${device.name}${device.isDefault ? ` · ${t("默认")}` : ""}`}
              title={device.name}
              onClick={() => onSelect(device)}
            >
              <span className="device-row-mark" aria-hidden="true">
                {device.isDefault && <Check size={12} />}
              </span>
              <span className="device-row-name">{device.name}</span>
              {switching === device.id ? (
                <LoaderCircle
                  className="device-spinner"
                  size={12}
                  aria-hidden="true"
                />
              ) : (
                device.isDefault && (
                  <em className="device-row-tag">{t("默认")}</em>
                )
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export function DevicePage({ deviceState }: Props) {
  const { devices, failed, switching, feedback, refresh, switchDevice } =
    deviceState;
  const select = (device: AudioDevice) => void switchDevice(device);

  if (devices === null) {
    return (
      <div className="device-view">
        <div className={`device-state ${failed ? "is-error" : ""}`}>
          {failed ? (
            <Headphones size={17} aria-hidden="true" />
          ) : (
            <LoaderCircle
              className="device-spinner"
              size={17}
              aria-hidden="true"
            />
          )}
          <span>{failed ? t("读取音频设备失败") : t("正在读取音频设备…")}</span>
          {failed && (
            <button type="button" onClick={() => void refresh()}>
              {t("重试")}
            </button>
          )}
        </div>
      </div>
    );
  }

  const layout = deviceLayout(devices);

  return (
    <div className="device-view">
      <div
        className="device-groups"
        data-columns={layout.columns}
        style={
          {
            "--device-columns": layout.columns,
            "--device-row-h": `${layout.rowHeight}px`,
            "--device-font": `${layout.fontSize}px`,
          } as CSSProperties
        }
      >
        <DeviceGroup
          label={t("输出设备")}
          icon={<Volume2 size={12} aria-hidden="true" />}
          devices={devices.filter((device) => device.direction === "output")}
          emptyLabel={t("未找到输出设备")}
          switching={switching}
          onSelect={select}
        />
        <DeviceGroup
          label={t("输入设备")}
          icon={<Mic size={12} aria-hidden="true" />}
          devices={devices.filter((device) => device.direction === "input")}
          emptyLabel={t("未找到输入设备")}
          switching={switching}
          onSelect={select}
        />
      </div>
      <span
        className={`device-hint ${feedback?.error ? "is-error" : ""}`}
        role="status"
      >
        {feedback?.text ??
          (failed ? t("读取设备失败，请重试") : t("点击设备即可切换默认设备"))}
      </span>
    </div>
  );
}
