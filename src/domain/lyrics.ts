export type LyricLine = { time: number; text: string };
export function parseLyrics(raw: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const line of raw.split(/\r?\n/)) {
    let rest = line;
    const times: number[] = [];
    for (;;) {
      const match = /^\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/.exec(rest);
      if (!match) break;
      const seconds = Number(match[2]);
      if (seconds < 60)
        times.push(
          Number(match[1]) * 60 + seconds + Number(`0.${match[3] ?? "0"}`),
        );
      rest = rest.slice(match[0].length);
    }
    for (const time of times) lines.push({ time, text: rest.trim() });
  }
  return lines.sort((a, b) => a.time - b.time);
}
export function lyricAt(lines: LyricLine[], time: number): string | null {
  for (let i = lines.length - 1; i >= 0; i--)
    if (lines[i].time <= time) return lines[i].text;
  return null;
}
