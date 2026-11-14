import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { t } from "../../services/i18n";
import {
  deviceChanges,
  systemChanges,
  notificationSource,
  shouldShowNotificationFlash,
  nextMessageAttention,
  acknowledgeMessageAttention,
  type AppNoticeItem,
  type BluetoothStatus,
  type SystemNotice,
  type SystemStatus,
  type NotificationSource,
  type MessageAttention,
} from "../../domain/systemNotices";
import type {
  NotificationSourceId,
  NotificationSourceSettings,
} from "../../domain/settings";

export type DeviceSnapshot = {
  brightness: number | null;
  bluetooth: BluetoothStatus[] | null;
};

/** The notification page shows the latest forwarded toast only, as detail. */
const NOTIFICATION_HISTORY = 1;

/** Sources with a local session watcher: their reminders carry an attention badge. */
const MESSAGE_SOURCES = ["wechat", "qq"] as const;
type MessageKey = (typeof MESSAGE_SOURCES)[number];

type MessageMaps = Record<MessageKey, AppNoticeItem[]>;
type AttentionMap = Record<MessageKey, MessageAttention>;
type ArrivalMap = Record<MessageKey, number>;

function emptyMessages(): MessageMaps {
  return { wechat: [], qq: [] };
}
function emptyAttention(): AttentionMap {
  return { wechat: null, qq: null };
}
function emptyArrival(): ArrivalMap {
  return { wechat: 0, qq: 0 };
}

export function useSystemNotice({
  notificationSeconds,
  sources,
}: {
  notificationSeconds: number;
  sources: Record<NotificationSourceId, NotificationSourceSettings>;
}) {
  const [notice, setNotice] = useState<SystemNotice | null>(null);
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [devices, setDevices] = useState<DeviceSnapshot | null>(null);
  const [notifications, setNotifications] = useState<AppNoticeItem[]>([]);
  const [messages, setMessages] = useState<MessageMaps>(emptyMessages);
  const [previewNotification, setPreviewNotification] =
    useState<AppNoticeItem | null>(null);
  const [messageAttention, setMessageAttention] =
    useState<AttentionMap>(emptyAttention);
  const [messageArrival, setMessageArrival] =
    useState<ArrivalMap>(emptyArrival);
  const notificationId = useRef(0);
  // The listeners register once, but the durations and preview gates follow
  // the settings, so the flash timer reads them through a per-render ref.
  const secondsRef = useRef(notificationSeconds);
  const sourceSettingsRef = useRef(sources);
  useLayoutEffect(() => {
    sourceSettingsRef.current = sources;
  }, [sources]);
  useEffect(() => {
    secondsRef.current = notificationSeconds;
  }, [notificationSeconds]);
  function flashSeconds(notice: SystemNotice): number {
    if (
      notice.kind === "notification" &&
      notice.source &&
      notice.source !== "system"
    ) {
      const perSource = sourceSettingsRef.current[notice.source];
      if (perSource) return Math.max(1, perSource.seconds) * 1000;
    }
    return notice.kind === "notification"
      ? Math.max(1, secondsRef.current) * 1000
      : 3000;
  }
  useEffect(() => {
    let active = true;
    let previous: SystemStatus | undefined;
    let previousBrightness: number | null = null;
    let previousDevices: BluetoothStatus[] | null = null;
    let dismissal: number | undefined;
    let reconcile: number | undefined;
    let current: SystemNotice | null = null;
    const pending: SystemNotice[] = [];
    const disposers: Array<() => void> = [];
    function advance() {
      current = pending.shift() ?? null;
      setNotice(current);
      if (current)
        dismissal = window.setTimeout(advance, flashSeconds(current));
    }
    function show(next: SystemNotice) {
      if (
        !current ||
        (next.kind === current.kind &&
          (next.kind === "volume" ||
            next.kind === "brightness" ||
            next.kind === "audio" ||
            next.kind === "notification"))
      ) {
        window.clearTimeout(dismissal);
        current = next;
        setNotice(next);
        dismissal = window.setTimeout(advance, flashSeconds(next));
      } else {
        if (
          next.kind === "volume" ||
          next.kind === "brightness" ||
          next.kind === "audio" ||
          next.kind === "notification"
        ) {
          const existing = pending.findIndex(
            (item) =>
              item.kind === next.kind &&
              (next.kind !== "notification" || item.source === next.source),
          );
          if (existing >= 0) pending.splice(existing, 1);
        }
        if (pending.length < 8) pending.push(next);
      }
    }
    function isMessageSource(source: NotificationSource): source is MessageKey {
      return (MESSAGE_SOURCES as readonly string[]).includes(source);
    }
    function showNotification(
      app: string,
      text: string,
      source: NotificationSource,
      preview = false,
    ) {
      notificationId.current += 1;
      const id = notificationId.current;
      const settings = isMessageSource(source)
        ? sourceSettingsRef.current[source]
        : undefined;
      if (shouldShowNotificationFlash(source, settings?.showText ?? true)) {
        show({
          kind: "notification",
          label: app,
          value: text,
          eventId: id,
          source,
        });
      }
      const item = { id, app, text, at: Date.now(), source };
      if (isMessageSource(source)) {
        setMessageArrival((current) => ({ ...current, [source]: id }));
        setMessageAttention((current) => ({
          ...current,
          [source]: nextMessageAttention(current[source], { id, preview }),
        }));
      }
      if (preview) {
        setPreviewNotification(item);
      } else {
        setPreviewNotification(null);
        if (isMessageSource(source)) {
          setMessages((current) => ({
            ...current,
            [source]: [item, ...current[source]].slice(0, NOTIFICATION_HISTORY),
          }));
        } else {
          // A real system notification clears attention that only a preview
          // had raised; watched arrivals keep theirs until acknowledged.
          setMessageAttention((current) => {
            const next = { ...current };
            for (const key of MESSAGE_SOURCES) {
              if (next[key]?.preview) {
                next[key] = acknowledgeMessageAttention(next[key], null);
              }
            }
            return next;
          });
          setNotifications((list) =>
            [item, ...list].slice(0, NOTIFICATION_HISTORY),
          );
        }
      }
    }
    // The Rust side samples in the background and pushes changes as events;
    // these appliers stay shared with the reconciliation reads below so the
    // notice diffs always run against the last state this window saw.
    function applySystem(state: SystemStatus) {
      setSystem(state);
      systemChanges(previous, state).forEach(show);
      previous = state;
    }
    function applyDevices(state: DeviceSnapshot) {
      setDevices(state);
      if (state.brightness !== null) {
        if (
          previousBrightness !== null &&
          state.brightness !== previousBrightness
        )
          show({
            kind: "brightness",
            label: t("亮度"),
            value: `${state.brightness}%`,
          });
        previousBrightness = state.brightness;
      }
      deviceChanges(previousDevices, state.bluetooth).forEach(show);
      if (state.bluetooth !== null) previousDevices = state.bluetooth;
    }
    // Seeds the first snapshots and catches anything missed while the
    // webview was suspended or an event was dropped.
    async function refresh() {
      try {
        const state = await invoke<SystemStatus>("get_system_status");
        if (active) applySystem(state);
      } catch (error) {
        console.error("Unable to read system status", error);
      }
      try {
        const state = await invoke<DeviceSnapshot>("get_device_status");
        if (active) applyDevices(state);
      } catch (error) {
        console.error("Unable to read device status", error);
      }
    }
    void listen<SystemNotice>(
      "system-notice-preview",
      ({ payload }) => {
        if (!active) return;
        if (payload.kind === "notification") {
          showNotification(
            payload.label,
            payload.value,
            notificationSource(payload.label, payload.source),
            true,
          );
        } else {
          show(payload);
        }
      },
      { target: "island" },
    )
      .then((dispose) => {
        if (active) disposers.push(dispose);
        else dispose();
      })
      .catch((error) =>
        console.error("Unable to listen for notice previews", error),
      );
    // Forwarded desktop toasts arrive as their own transient kind; each one
    // also joins the session history for the notification page.
    void listen<{ app: string; text: string; source?: string }>(
      "app-notification",
      ({ payload }) => {
        if (!active) return;
        showNotification(
          payload.app,
          payload.text,
          notificationSource(payload.app, payload.source),
        );
      },
      { target: "island" },
    )
      .then((dispose) => {
        if (active) disposers.push(dispose);
        else dispose();
      })
      .catch((error) =>
        console.error("Unable to listen for notice previews", error),
      );
    // Register the status listeners first: a change pushed between app start
    // and this registration is not replayed, so the initial read below must
    // happen after they are in place to see that change as the baseline.
    void Promise.all([
      listen<SystemStatus>("system-status-changed", ({ payload }) => {
        if (active) applySystem(payload);
      }),
      listen<DeviceSnapshot>("device-status-changed", ({ payload }) => {
        if (active) applyDevices(payload);
      }),
    ])
      .then((registered) => {
        if (!active) {
          registered.forEach((dispose) => dispose());
          return;
        }
        disposers.push(...registered);
        void refresh();
        reconcile = window.setInterval(() => void refresh(), 60_000);
      })
      .catch((error) => console.error("Unable to listen for status", error));
    return () => {
      active = false;
      disposers.forEach((dispose) => dispose());
      window.clearInterval(reconcile);
      window.clearTimeout(dismissal);
    };
  }, []);
  function clearNotifications() {
    setNotifications([]);
    setPreviewNotification((current) =>
      current?.source === "system" ? null : current,
    );
  }
  function clearMessages(source: MessageKey) {
    setMessages((current) => ({ ...current, [source]: [] }));
    setPreviewNotification((current) =>
      current?.source === source ? null : current,
    );
    setMessageAttention((current) => ({
      ...current,
      [source]: acknowledgeMessageAttention(current[source], null),
    }));
  }
  function acknowledgeMessages(source: MessageKey, id: number | null) {
    setMessageAttention((current) => ({
      ...current,
      [source]: acknowledgeMessageAttention(current[source], id),
    }));
  }
  function clearOpenedMessages(source: MessageKey, throughId: number) {
    setMessages((current) => ({
      ...current,
      [source]: current[source].filter((item) => item.id > throughId),
    }));
    setPreviewNotification((current) =>
      current?.source === source && current.id <= throughId ? null : current,
    );
    setMessageAttention((current) => ({
      ...current,
      [source]:
        current[source] && current[source].id <= throughId
          ? null
          : current[source],
    }));
  }
  const visibleNotifications =
    notice?.kind === "notification" &&
    previewNotification !== null &&
    previewNotification.id === notice.eventId &&
    previewNotification.source === "system"
      ? [previewNotification]
      : notifications;
  // A source's preview replaces its history list while the flash or the
  // attention badge still points at it, mirroring the system list above.
  function visibleMessagesFor(source: MessageKey): AppNoticeItem[] {
    const preview =
      previewNotification !== null &&
      previewNotification.source === source &&
      ((notice?.kind === "notification" &&
        previewNotification.id === notice.eventId) ||
        messageAttention[source]?.id === previewNotification.id ||
        messageAttention[source] === null ||
        messages[source].length === 0)
        ? [previewNotification]
        : null;
    return preview ?? messages[source];
  }
  const visibleMessages: MessageMaps = {
    wechat: visibleMessagesFor("wechat"),
    qq: visibleMessagesFor("qq"),
  };
  return {
    notice,
    system,
    devices,
    notifications: visibleNotifications,
    messages: visibleMessages,
    messageAttention,
    messageArrival,
    acknowledgeMessages,
    clearOpenedMessages,
    clearNotifications,
    clearMessages,
  };
}
