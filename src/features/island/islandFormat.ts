/** Quota reset stamps: same shape everywhere, date then 24h time. */
export function formatResetMoment(seconds: number, language: string) {
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return "";
  const time = date.toLocaleTimeString(language, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  if (language === "en-US") {
    return `${date.toLocaleDateString("en-US", { month: "short" })} ${date.getDate()} ${time}`;
  }
  return `${date.getMonth() + 1}/${date.getDate()} ${time}`;
}

export function formatMediaTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
