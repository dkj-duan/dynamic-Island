import { describe, expect, it } from "vitest";
import { lyricAt, parseLyrics } from "./lyrics";
describe("synchronized lyrics", () => {
  it("parses multiple timestamps, orders lines and preserves brackets", () => {
    const lyrics = parseLyrics(
      "[00:05.50][00:07.5]唱到[副歌]\n[00:02.00]开始\n[ar:歌手]",
    );
    expect(lyrics).toEqual([
      { time: 2, text: "开始" },
      { time: 5.5, text: "唱到[副歌]" },
      { time: 7.5, text: "唱到[副歌]" },
    ]);
    expect(lyricAt(lyrics, 1)).toBeNull();
    expect(lyricAt(lyrics, 6)).toBe("唱到[副歌]");
  });
  it("honors empty timed lines and rejects invalid seconds", () => {
    const lyrics = parseLyrics("[00:01]一句\n[00:04]\n[01:99]无效");
    expect(lyricAt(lyrics, 4)).toBe("");
    expect(lyrics).toHaveLength(2);
  });
});
