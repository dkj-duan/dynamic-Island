import type { CSSProperties } from "react";
import type { MascotReaction } from "../../domain/mascotReaction";
import type { IslandMascotId } from "../../domain/settings";
import classic from "../../assets/mascot/peek/classic.webp";
import golden from "../../assets/mascot/peek/golden.webp";
import classicSide from "../../assets/mascot/peek/classic-side.webp";
import goldenSide from "../../assets/mascot/peek/golden-side.webp";

export type PeekAppearance = {
  mascot: IslandMascotId;
  pose: MascotReaction | "idle" | "listening";
};

const sheets = { classic, golden };
const sideSheets = { classic: classicSide, golden: goldenSide };
const frames = {
  idle: [0, 1, 2],
  attention: [0, 1, 0],
  listening: [3, 4, 5],
  water: [6, 7, 8],
  celebrate: [9, 10, 11],
} as const;

export function PeekMascot({
  mascot,
  pose,
  side,
}: PeekAppearance & { side?: "left" | "right" | null }) {
  const [first, middle, last] = frames[pose];
  return (
    <div
      key={pose}
      className="peek-mascot"
      data-mascot={mascot}
      data-pose={pose}
      style={
        {
          "--peek-first": first,
          "--peek-middle": middle,
          "--peek-last": last,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <img
        src={(side ? sideSheets : sheets)[mascot]}
        alt=""
        draggable={false}
      />
    </div>
  );
}
