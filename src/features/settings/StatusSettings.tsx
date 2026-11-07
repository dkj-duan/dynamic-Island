import { Button, List, Tag, Typography } from "antd";
import {
  AudioOutlined,
  BellOutlined,
  BulbOutlined,
  CustomerServiceOutlined,
  ReloadOutlined,
  SoundOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { useEffect, useState } from "react";
import { isTauri, invoke } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import type {
  AudioDevice,
  BluetoothStatus,
  SystemNotice,
  SystemStatus,
} from "../../domain/systemNotices";
import { Section } from "./ui/Section";
import { t } from "../../services/i18n";
import {
  audioSwitchMessage,
  switchDefaultAudioDevice,
} from "../../services/audioDevices";

type DeviceStatus = {
  brightness: number | null;
  bluetooth: BluetoothStatus[] | null;
};
type Result<T> =
  { state: "loading" } | { state: "error" } | { state: "ready"; value: T };

export function StatusSettings() {
  const desktop = isTauri();
  const [system, setSystem] = useState<Result<SystemStatus>>({
    state: "loading",
  });
  const [devices, setDevices] = useState<Result<DeviceStatus>>({
    state: "loading",
  });
  const [audio, setAudio] = useState<Result<AudioDevice[]>>({
    state: "loading",
  });
  const [switching, setSwitching] = useState("");
  const [audioMessage, setAudioMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const [previewMessage, setPreviewMessage] = useState("");

  useEffect(() => {
    if (!desktop) return;
    let active = true;
    void invoke<SystemStatus>("get_system_status")
      .then((value) => {
        if (active) setSystem({ state: "ready", value });
      })
      .catch(() => {
        if (active) setSystem({ state: "error" });
      });
    void invoke<DeviceStatus>("get_device_status")
      .then((value) => {
        if (active) setDevices({ state: "ready", value });
      })
      .catch(() => {
        if (active) setDevices({ state: "error" });
      });
    void invoke<AudioDevice[]>("get_audio_devices")
      .then((value) => {
        if (active) setAudio({ state: "ready", value });
      })
      .catch(() => {
        if (active) setAudio({ state: "error" });
      });
    return () => {
      active = false;
    };
  }, [desktop, revision]);

  function refresh() {
    setSystem({ state: "loading" });
    setDevices({ state: "loading" });
    setAudio({ state: "loading" });
    setAudioMessage("");
    setRevision((value) => value + 1);
  }

  async function switchDevice(device: AudioDevice) {
    if (!desktop || switching || device.isDefault) return;
    setSwitching(device.id);
    setAudioMessage("");
    try {
      const list = await switchDefaultAudioDevice(device);
      setAudio({ state: "ready", value: list });
      setAudioMessage(audioSwitchMessage(device.direction));
    } catch (error) {
      setAudioMessage(audioSwitchMessage(device.direction, error));
    } finally {
      setSwitching("");
    }
  }

  async function preview(notice: SystemNotice) {
    try {
      await emitTo("island", "system-notice-preview", notice);
      setPreviewMessage(t("演示已发送到屏幕顶部的灵动岛。"));
    } catch {
      setPreviewMessage(t("演示发送失败，请确认灵动岛正在运行。"));
    }
  }

  const systemText = (format: (value: SystemStatus) => string) =>
    !desktop
      ? t("请在桌面应用中查看")
      : system.state === "loading"
        ? t("正在读取…")
        : system.state === "error"
          ? t("读取失败")
          : format(system.value);
  const deviceText = (format: (value: DeviceStatus) => string) =>
    !desktop
      ? t("请在桌面应用中查看")
      : devices.state === "loading"
        ? t("正在读取…")
        : devices.state === "error"
          ? t("读取失败")
          : format(devices.value);

  const rows = [
    {
      icon: <SoundOutlined />,
      title: t("音量"),
      description: t("系统音量或静音状态变化"),
      status: systemText((value) =>
        value.volume === null
          ? t("当前输出设备不可读取")
          : value.muted
            ? t("已静音")
            : `${t("当前")} ${value.volume}%`,
      ),
      notice: {
        kind: "volume",
        label: t("演示 · 音量"),
        value: "65%",
      } as SystemNotice,
    },
    {
      icon: <BulbOutlined />,
      title: t("屏幕亮度"),
      description: t("需显示器与驱动提供亮度数据"),
      status: deviceText((value) =>
        value.brightness === null
          ? t("当前显示器未提供")
          : `${t("当前")} ${value.brightness}%`,
      ),
      notice: {
        kind: "brightness",
        label: t("演示 · 亮度"),
        value: "75%",
      } as SystemNotice,
    },
    {
      icon: <ThunderboltOutlined />,
      title: t("电源与电池"),
      description: t("接通或断开电源时显示电量"),
      status: systemText((value) =>
        value.battery === null
          ? t("未检测到电池")
          : `${value.charging ? t("充电中") : value.onAc ? t("已接通电源") : t("使用电池")} · ${value.battery}%`,
      ),
      notice: {
        kind: "power",
        label: t("演示 · 充电中"),
        value: "80%",
      } as SystemNotice,
    },
    {
      icon: <BellOutlined />,
      title: t("蓝牙设备"),
      description: t("连接或断开时显示名称与电量"),
      status: deviceText((value) =>
        value.bluetooth === null
          ? t("暂不可读取")
          : value.bluetooth.length
            ? `${value.bluetooth.length} ${t("台设备已连接")}`
            : t("未检测到设备"),
      ),
      notice: {
        kind: "bluetooth",
        label: t("演示 · 蓝牙耳机"),
        value: "已连接",
      } as SystemNotice,
    },
  ];

  return (
    <div className="antd-stack status-page">
      <Section
        title={t("当前状态")}
        description={t("状态发生变化时，灵动岛会短暂显示对应提示。")}
        extra={
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={refresh}
            disabled={!desktop}
            title={t("刷新状态")}
            aria-label={t("刷新状态")}
          />
        }
      >
        <div className="status-grid">
          {rows.map((row) => (
            <div
              className="status-tile"
              key={row.title}
              title={row.description}
            >
              <div className="status-tile-head">
                <span className="antd-list-icon">{row.icon}</span>
                <strong>{row.title}</strong>
                <Button
                  type="link"
                  size="small"
                  disabled={!desktop}
                  onClick={() => void preview(row.notice)}
                >
                  {t("演示")}
                </Button>
              </div>
              <span className="status-tile-value">{row.status}</span>
            </div>
          ))}
        </div>
        <Typography.Text type="secondary" className="antd-hint">
          {previewMessage || t("演示使用示例数据，不会修改系统设置。")}
        </Typography.Text>
      </Section>

      <Section
        title={t("音频设备")}
        description={t(
          "点击设备即可设为默认播放或录音设备；托盘菜单也可以切换输出。",
        )}
        extra={
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={refresh}
            disabled={!desktop || switching !== ""}
            title={t("刷新")}
            aria-label={t("刷新")}
          />
        }
      >
        {!desktop ? (
          <Typography.Text type="secondary">
            {t("请在桌面应用中查看")}
          </Typography.Text>
        ) : audio.state === "loading" ? (
          <Typography.Text type="secondary">
            {t("正在读取音频设备…")}
          </Typography.Text>
        ) : audio.state === "error" ? (
          <Typography.Text type="secondary">
            {t("读取音频设备失败")}
          </Typography.Text>
        ) : (
          <div className="antd-device-groups">
            {(["output", "input"] as const).map((direction) => {
              const items = audio.value.filter(
                (device) => device.direction === direction,
              );
              return (
                <div className="antd-device-group" key={direction}>
                  <Typography.Text strong className="antd-device-group-title">
                    {t(direction === "output" ? "输出设备" : "输入设备")}
                  </Typography.Text>
                  {items.length === 0 ? (
                    <Typography.Text type="secondary">
                      {t(
                        direction === "output"
                          ? "未找到输出设备"
                          : "未找到输入设备",
                      )}
                    </Typography.Text>
                  ) : (
                    <List
                      dataSource={items}
                      renderItem={(device) => (
                        <List.Item
                          className={`antd-device-row ${device.isDefault ? "is-default" : ""}`}
                          onClick={() => void switchDevice(device)}
                          actions={[
                            device.isDefault ? (
                              <Tag key="tag" color="blue">
                                {t("默认")}
                              </Tag>
                            ) : null,
                          ].filter(Boolean)}
                        >
                          <div className="antd-list-row">
                            <span className="antd-list-icon">
                              {device.direction === "input" ? (
                                <AudioOutlined />
                              ) : (
                                <CustomerServiceOutlined />
                              )}
                            </span>
                            <div className="antd-list-copy">
                              <strong>{device.name}</strong>
                              <small>
                                {device.isDefault
                                  ? t("当前默认设备")
                                  : t(
                                      device.direction === "input"
                                        ? "点击切换为默认录音设备"
                                        : "点击切换为默认输出设备",
                                    )}
                              </small>
                            </div>
                            {switching === device.id && <ReloadOutlined spin />}
                          </div>
                        </List.Item>
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
        <Typography.Text type="secondary" className="antd-hint">
          {audioMessage}
        </Typography.Text>
      </Section>
    </div>
  );
}
