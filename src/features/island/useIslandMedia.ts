import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { lyricAt, parseLyrics } from "../../domain/lyrics";
import { t } from "../../services/i18n";

export type MediaState = {
  title: string;
  artist: string;
  playing: boolean;
  positionSeconds: number | null;
  durationSeconds: number | null;
  canSeek: boolean;
};

export function useIslandMedia() {
  const [media, setMedia] = useState<MediaState | null>(null);
  const mediaSample = useRef(Date.now());
  const lastMedia = useRef<MediaState | null>(null);
  const mediaMissingSince = useRef<number | null>(null);
  const [mediaNow, setMediaNow] = useState(Date.now);
  const [lyrics, setLyrics] = useState<{
    key: string;
    text: string;
    synced: boolean;
  } | null>(null);
  const [lyricsError, setLyricsError] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [seekPreview, setSeekPreview] = useState<number | null>(null);
  const [artwork, setArtwork] = useState<{
    key: string;
    src: string | null;
  } | null>(null);
  const mediaKey = media ? JSON.stringify([media.title, media.artist]) : "";
  const mediaArtwork = artwork?.key === mediaKey ? artwork.src : null;
  useEffect(() => {
    if (!media?.title || !media.artist) return;
    let active = true;
    const key = JSON.stringify([media.title, media.artist]);
    void invoke<{ text: string; synced: boolean }>("get_lyrics", {
      title: media.title,
      artist: media.artist,
      duration: media.durationSeconds,
    })
      .then((value) => {
        if (active) setLyrics({ key, ...value });
      })
      .catch((error: unknown) => {
        if (active) setLyricsError({ key, message: String(error) });
      });
    return () => {
      active = false;
    };
  }, [media?.title, media?.artist, media?.durationSeconds]);
  useEffect(() => {
    if (!media?.playing) return;
    const timer = window.setInterval(() => setMediaNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [media?.playing]);
  const mediaPosition =
    media?.positionSeconds == null
      ? null
      : Math.min(
          media.durationSeconds ?? Infinity,
          media.positionSeconds +
            (media.playing
              ? Math.max(0, mediaNow - mediaSample.current) / 1000
              : 0),
        );
  const currentLyrics = lyrics?.key === mediaKey ? lyrics : null;
  const currentLyric =
    currentLyrics?.synced && mediaPosition !== null
      ? lyricAt(parseLyrics(currentLyrics.text), mediaPosition)
      : null;
  useEffect(() => {
    if (!mediaKey) return;
    let active = true;
    let retry: number | undefined;
    const [title, artist] = JSON.parse(mediaKey) as [string, string];
    async function refreshArtwork() {
      let src: string | null = null;
      try {
        src = await invoke<string | null>("get_media_artwork", {
          title,
          artist,
        });
      } catch {
        /* retry later */
      }
      if (!active) return;
      setArtwork({ key: mediaKey, src });
      if (!src) retry = window.setTimeout(() => void refreshArtwork(), 15_000);
    }
    void refreshArtwork();
    return () => {
      active = false;
      window.clearTimeout(retry);
    };
  }, [mediaKey]);
  const [mediaError, setMediaError] = useState("");
  // Consecutive polls without any media session. A session that vanishes for
  // a moment between tracks comes back within the grace window, so a long
  // media-less stretch only means nothing is playing at all and the polling
  // can slow down until the next session appears.
  const mediaMisses = useRef(0);
  useEffect(() => {
    let active = true;
    let timeout: number | undefined;
    const refresh = async () => {
      try {
        const state = await invoke<MediaState | null>("get_media_state");
        if (!active) return;
        mediaSample.current = Date.now();
        setMediaNow(mediaSample.current);
        applyMediaState(state);
        mediaMisses.current = state?.title ? 0 : mediaMisses.current + 1;
      } catch (error) {
        console.error("Unable to read Windows media session", error);
      } finally {
        if (active) {
          const delay = mediaMisses.current < 15 ? 2000 : 4000;
          timeout = window.setTimeout(() => void refresh(), delay);
        }
      }
    };
    void refresh();
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, []);
  function applyMediaState(state: MediaState | null) {
    const next = state?.title ? state : null;
    if (next) {
      lastMedia.current = next;
      mediaMissingSince.current = null;
      setMedia(next);
      return;
    }
    if (!lastMedia.current) {
      setMedia(null);
      return;
    }
    // Players often report no session for a moment between tracks. Keep the
    // previous track for a short grace period instead of flashing "no media".
    if (mediaMissingSince.current === null) {
      mediaMissingSince.current = Date.now();
    } else if (Date.now() - mediaMissingSince.current >= 5000) {
      lastMedia.current = null;
      mediaMissingSince.current = null;
      setMedia(null);
    }
  }
  async function refreshMedia() {
    try {
      const state = await invoke<MediaState | null>("get_media_state");
      mediaSample.current = Date.now();
      setMediaNow(mediaSample.current);
      applyMediaState(state);
    } catch {
      /* the 2s poll retries */
    }
  }
  async function controlMedia(action: "previous" | "toggle" | "next") {
    const previous = media;
    // Flip the button before the player answers, then reconcile.
    if (action === "toggle" && previous) {
      setMedia({ ...previous, playing: !previous.playing });
      mediaSample.current = Date.now();
      setMediaNow(mediaSample.current);
    }
    try {
      const applied = await invoke<boolean>("control_media", { action });
      if (!applied) throw new Error(t("播放器未响应此操作"));
      setMediaError("");
      window.setTimeout(() => void refreshMedia(), 120);
      window.setTimeout(() => void refreshMedia(), 600);
    } catch (error) {
      if (action === "toggle") setMedia(previous);
      setMediaError(
        typeof error === "string" && error
          ? error
          : error instanceof Error
            ? error.message
            : t("媒体控制失败"),
      );
    }
  }
  async function seekMedia(positionSeconds: number) {
    try {
      const applied = await invoke<boolean>("seek_media", { positionSeconds });
      if (!applied) throw new Error("Seek unsupported");
      setMediaError("");
      const state = await invoke<MediaState | null>("get_media_state");
      mediaSample.current = Date.now();
      setMediaNow(mediaSample.current);
      applyMediaState(state);
    } catch {
      setMediaError(t("当前播放器暂不支持调整进度"));
    } finally {
      setSeekPreview(null);
    }
  }
  // One lyric line for the music page: the synced line when there is one,
  // otherwise the reason there is not (interlude, no progress, lookup failed).
  function lyricLine(): { text: string; active: boolean } {
    if (currentLyric) return { text: currentLyric, active: true };
    if (currentLyrics?.synced) {
      if (mediaPosition === null)
        return { text: t("暂无播放进度，无法同步歌词"), active: false };
      if (currentLyric === "") return { text: t("♪ 间奏"), active: false };
      return { text: t("♪ 前奏"), active: false };
    }
    if (currentLyrics) return { text: t("暂无同步歌词"), active: false };
    if (lyricsError?.key === mediaKey)
      return { text: lyricsError.message, active: false };
    return { text: t("正在查找歌词…"), active: false };
  }
  const lyric = lyricLine();
  return {
    media,
    mediaKey,
    mediaArtwork,
    artwork,
    mediaPosition,
    currentLyric,
    lyric,
    seekPreview,
    setSeekPreview,
    mediaError,
    controlMedia,
    seekMedia,
  };
}
