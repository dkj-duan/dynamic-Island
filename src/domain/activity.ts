/** Internal model; external plugin protocols will be versioned separately. */
export interface Activity {
  id: string;
  sourceId: string;
  title: string;
  summary?: string;
  priority: number;
  updatedAt: string;
}
export interface ActivityProvider {
  readonly id: string;
  start(publish: (activities: Activity[]) => void): Promise<void>;
  stop(): Promise<void>;
}
