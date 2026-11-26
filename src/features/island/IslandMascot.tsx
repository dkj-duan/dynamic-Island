import { memo } from "react";
import type { MascotReaction } from "../../domain/mascotReaction";
import type { IslandMascotId } from "../../domain/settings";
import classicIdle from "../../assets/mascot/idle.png";
import classicListening from "../../assets/mascot/listening.png";
import classicWater from "../../assets/mascot/water.png";
import classicCelebrate from "../../assets/mascot/celebrate.png";
import classicAttention from "../../assets/mascot/attention.png";
import goldenIdle from "../../assets/mascot/golden/idle.webp";
import goldenListening from "../../assets/mascot/golden/listening.webp";
import goldenWater from "../../assets/mascot/golden/water.webp";
import goldenCelebrate from "../../assets/mascot/golden/celebrate.webp";
import goldenAttention from "../../assets/mascot/golden/attention.webp";
import goldenListeningMotion from "../../assets/mascot/golden/listening-motion.webp";
import goldenWaterMotion from "../../assets/mascot/golden/water-motion.webp";
import goldenCelebrateMotion from "../../assets/mascot/golden/celebrate-motion.webp";
import goldenAttentionMotion from "../../assets/mascot/golden/attention-motion.webp";

type MascotPose = MascotReaction | "listening";

const mascotArt: Record<IslandMascotId, Record<"idle" | MascotPose, string>> = {
  classic: {
    idle: classicIdle,
    listening: classicListening,
    water: classicWater,
    celebrate: classicCelebrate,
    attention: classicAttention,
  },
  golden: {
    idle: goldenIdle,
    listening: goldenListening,
    water: goldenWater,
    celebrate: goldenCelebrate,
    attention: goldenAttention,
  },
};

const goldenMotion = [
  { pose: "listening", src: goldenListeningMotion },
  { pose: "water", src: goldenWaterMotion },
  { pose: "celebrate", src: goldenCelebrateMotion },
  { pose: "attention", src: goldenAttentionMotion },
] as const;

export const IslandMascot = memo(function IslandMascot({
  mascot,
  pose,
  media = false,
  thumbnail = false,
}: {
  mascot: IslandMascotId;
  pose?: MascotPose | null;
  media?: boolean;
  thumbnail?: boolean;
}) {
  const art = mascotArt[mascot];
  if (thumbnail) {
    return (
      <img
        className="mascot-thumbnail"
        src={art.idle}
        alt=""
        draggable={false}
      />
    );
  }
  if (mascot === "golden") {
    return (
      <span
        className={
          media
            ? "idle-mascot golden-mascot media-mascot"
            : "idle-mascot golden-mascot"
        }
        data-pose={pose ?? "idle"}
        aria-hidden="true"
      >
        <img
          className="golden-mascot-frame"
          data-frame="idle"
          src={art.idle}
          alt=""
          draggable={false}
        />
        {/* Each strip is loaded once. CSS chooses its visible frame inside
            the same clip without swapping URLs or triggering React renders. */}
        {goldenMotion.map(({ pose, src }) => (
          <picture key={pose} className="golden-mascot-frame" data-frame={pose}>
            <source
              media="(prefers-reduced-motion: reduce)"
              srcSet={art[pose]}
            />
            <img
              className="golden-mascot-strip"
              src={src}
              alt=""
              draggable={false}
              decoding="async"
              fetchPriority="low"
            />
          </picture>
        ))}
      </span>
    );
  }
  return (
    <span
      className={`idle-mascot${media ? " media-mascot" : ""}${pose ? ` is-${pose}` : ""}`}
      aria-hidden="true"
    >
      <img src={art.idle} alt="" draggable={false} />
      {pose && (
        <img
          className="idle-mascot-pose"
          src={art[pose]}
          alt=""
          draggable={false}
        />
      )}
    </span>
  );
});
