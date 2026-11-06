import { Music2, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import type { useIslandMedia } from "./useIslandMedia";
import { IslandEmpty } from "./IslandParts";
import { formatMediaTime } from "./islandFormat";
import { t } from "../../services/i18n";

type Props = {
  mediaState: ReturnType<typeof useIslandMedia>;
};

export function MusicPage({ mediaState }: Props) {
  const {
    media,
    mediaArtwork,
    mediaPosition,
    lyric,
    seekPreview,
    setSeekPreview,
    mediaError,
    controlMedia,
    seekMedia,
  } = mediaState;
  return (
    <div className={`media-view ${media ? "" : "is-empty"}`}>
      {media ? (
        <>
          <div className="media-now">
            <div
              className={`media-disc ${mediaArtwork ? "has-art" : ""} ${mediaArtwork && media.playing ? "is-spinning" : ""}`}
            >
              {mediaArtwork ? (
                <img src={mediaArtwork} alt="" />
              ) : (
                <Music2 size={19} />
              )}
            </div>
            <div className="media-info">
              <strong title={media.title}>{media.title}</strong>
              <span className="media-byline">
                <span
                  className="media-byline-text"
                  title={media.artist || t("未知艺术家")}
                >
                  {media.artist || t("未知艺术家")}
                </span>
              </span>
            </div>
          </div>
          <div
            className={`music-lyric ${lyric.active ? "is-active" : ""}`}
            aria-live="off"
            title={lyric.text}
          >
            {lyric.text}
          </div>
          {media.durationSeconds != null && media.positionSeconds != null && (
            <div className="media-timeline">
              <span className="media-time-start">
                {formatMediaTime(
                  seekPreview ?? mediaPosition ?? media.positionSeconds,
                )}
              </span>
              {media.canSeek && media.durationSeconds > 0 ? (
                <input
                  className="media-seek"
                  type="range"
                  min={0}
                  max={media.durationSeconds}
                  step={1}
                  value={Math.min(
                    media.durationSeconds,
                    seekPreview ?? mediaPosition ?? media.positionSeconds,
                  )}
                  aria-label={t("调整播放进度")}
                  onChange={(event) =>
                    setSeekPreview(Number(event.currentTarget.value))
                  }
                  onPointerUp={(event) =>
                    void seekMedia(Number(event.currentTarget.value))
                  }
                  onKeyUp={(event) => {
                    if (
                      [
                        "ArrowLeft",
                        "ArrowRight",
                        "ArrowUp",
                        "ArrowDown",
                        "Home",
                        "End",
                        "PageUp",
                        "PageDown",
                      ].includes(event.key)
                    )
                      void seekMedia(Number(event.currentTarget.value));
                  }}
                  onPointerCancel={() => setSeekPreview(null)}
                />
              ) : (
                <div className="media-progress">
                  <span
                    style={{
                      width: `${Math.min(100, Math.max(0, ((mediaPosition ?? media.positionSeconds) / media.durationSeconds) * 100))}%`,
                    }}
                  />
                </div>
              )}
              <span className="media-time-end">
                {formatMediaTime(media.durationSeconds)}
              </span>
            </div>
          )}
          {(media.durationSeconds == null || media.positionSeconds == null) && (
            <div className="media-timeline is-unavailable">
              <span className="media-timeline-unavailable">
                {t("播放器未提供播放进度")}
              </span>
            </div>
          )}
          <div className="media-controls">
            <div className="media-transport">
              <button
                aria-label={t("上一首")}
                onClick={() => void controlMedia("previous")}
              >
                <SkipBack size={15} fill="currentColor" />
              </button>
              <button
                aria-label={media.playing ? t("暂停") : t("播放")}
                className="media-play"
                onClick={() => void controlMedia("toggle")}
              >
                <span
                  key={media.playing ? "pause" : "play"}
                  className="media-play-icon"
                >
                  {media.playing ? (
                    <Pause size={18} fill="currentColor" />
                  ) : (
                    <Play size={18} fill="currentColor" />
                  )}
                </span>
              </button>
              <button
                aria-label={t("下一首")}
                onClick={() => void controlMedia("next")}
              >
                <SkipForward size={15} fill="currentColor" />
              </button>
            </div>
          </div>
          {mediaError && (
            <span className="duration-error" role="alert">
              {mediaError}
            </span>
          )}
        </>
      ) : (
        <IslandEmpty
          tone="music"
          icon={<Music2 size={14} />}
          title={t("没有正在播放的媒体")}
          hint={t("开始播放音乐后，这里会显示曲目信息和控制按钮。")}
        />
      )}
    </div>
  );
}
