import { Card, Typography } from "antd";
import type { ReactNode } from "react";

/** Card with an optional description under the title, matching the app tone. */
export function Section({
  title,
  description,
  extra,
  children,
  className,
}: {
  title: string;
  description?: string;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card title={title} extra={extra} className={className}>
      {description && (
        <Typography.Paragraph type="secondary" className="section-desc">
          {description}
        </Typography.Paragraph>
      )}
      {children}
    </Card>
  );
}

/** A label row where the control sits on the right. */
export function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="antd-setting-row">
      <div className="antd-setting-copy">
        <div className="antd-setting-title">{title}</div>
        {description && (
          <Typography.Text type="secondary" className="antd-setting-desc">
            {description}
          </Typography.Text>
        )}
      </div>
      <div className="antd-setting-control">{children}</div>
    </div>
  );
}
