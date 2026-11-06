import type { AudioDevice } from "../../domain/systemNotices";

export type DeviceLayout = {
  columns: number;
  rows: number;
  rowHeight: number;
  fontSize: number;
  panelHeight: number;
};

// Panel height reserved for padding, the header, the pager, both group
// headings and the hint line; rows take whatever is left.
const CHROME_HEIGHT = 106;
const ROW_SLACK = 4;
const MAX_PANEL_HEIGHT = 272;

/**
 * The island never shows a scrollbar, so a long device list folds into
 * columns and then shrinks its rows until every endpoint fits one panel.
 */
export function deviceLayout(devices: AudioDevice[] | null): DeviceLayout {
  const outputs =
    devices?.filter((device) => device.direction === "output").length ?? 0;
  const inputs =
    devices?.filter((device) => device.direction === "input").length ?? 0;
  const groups = [Math.max(1, outputs), Math.max(1, inputs)];
  const total = groups[0] + groups[1];

  let columns = total > 9 ? 2 : 1;
  let rows = groups.reduce((sum, count) => sum + Math.ceil(count / columns), 0);
  while (rows > 12 && columns < 4) {
    columns += 1;
    rows = groups.reduce((sum, count) => sum + Math.ceil(count / columns), 0);
  }

  const available = MAX_PANEL_HEIGHT - CHROME_HEIGHT - ROW_SLACK;
  const rowHeight = Math.max(13, Math.min(26, Math.floor(available / rows)));
  const fontSize =
    rowHeight >= 24 ? 12 : rowHeight >= 20 ? 11.5 : rowHeight >= 16 ? 11 : 10.5;

  return {
    columns,
    rows,
    rowHeight,
    fontSize,
    panelHeight: Math.min(
      MAX_PANEL_HEIGHT,
      CHROME_HEIGHT + rows * rowHeight + ROW_SLACK,
    ),
  };
}
