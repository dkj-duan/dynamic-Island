export type WaterSettings = {
  goalMl: number;
  cupMl: number;
  reminderMinutes: number;
  /** Whole hours; the reminder runs from activeStart up to activeEnd. */
  activeStart: number;
  activeEnd: number;
  enabled: boolean;
};

export const waterVersion = 1;

export const defaultWaterSettings: WaterSettings = {
  goalMl: 2000,
  cupMl: 250,
  reminderMinutes: 60,
  activeStart: 9,
  activeEnd: 21,
  enabled: true,
};

function integerInRange(value: unknown, min: number, max: number): boolean {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

export function parseWaterSettings(value: unknown): WaterSettings | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== waterVersion) return null;
  if (
    !integerInRange(record.goalMl, 500, 10000) ||
    !integerInRange(record.cupMl, 50, 2000) ||
    !integerInRange(record.reminderMinutes, 15, 240) ||
    !integerInRange(record.activeStart, 0, 23) ||
    !integerInRange(record.activeEnd, 1, 24) ||
    (record.activeStart as number) >= (record.activeEnd as number) ||
    typeof record.enabled !== "boolean"
  ) {
    return null;
  }
  return {
    goalMl: record.goalMl as number,
    cupMl: record.cupMl as number,
    reminderMinutes: record.reminderMinutes as number,
    activeStart: record.activeStart as number,
    activeEnd: record.activeEnd as number,
    enabled: record.enabled,
  };
}

export function waterPercent(ml: number, goalMl: number): number {
  if (goalMl <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((ml / goalMl) * 100)));
}

export function waterCups(ml: number, cupMl: number): number {
  if (cupMl <= 0) return 0;
  return Math.round(ml / cupMl);
}

/** Colour state: green when the goal is met, amber when far behind. */
export type WaterTone = "low" | "mid" | "done";

export const waterToneColors: Record<WaterTone, string> = {
  low: "#f0a75e",
  mid: "#7fb8f2",
  done: "#6fd39a",
};

export function waterTone(ml: number, goalMl: number): WaterTone {
  if (goalMl > 0 && ml >= goalMl) return "done";
  if (goalMl > 0 && ml / goalMl < 0.4) return "low";
  return "mid";
}
