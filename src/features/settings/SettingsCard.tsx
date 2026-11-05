import type { ComponentPropsWithoutRef } from "react";

/** A consistent surface for each independent settings section. */
export function SettingsCard({
  className = "",
  ...props
}: ComponentPropsWithoutRef<"section">) {
  return <section className={`settings-card ${className}`.trim()} {...props} />;
}
