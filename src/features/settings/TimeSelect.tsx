import { Select } from "./Select";
import { t } from "../../services/i18n";

const options = (count: number) =>
  Array.from({ length: count }, (_, index) => {
    const value = String(index).padStart(2, "0");
    return { value, label: value };
  });

const hours = options(24);
const minutes = options(60);

export function TimeSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [hour = "00", minute = "00"] = value.split(":");
  return (
    <div className="time-select" role="group" aria-label={t("目标时间")}>
      <Select
        ariaLabel={`${t("目标时间")} · ${t("小时")}`}
        value={hour}
        options={hours}
        disabled={disabled}
        onChange={(next) => onChange(`${next}:${minute}`)}
      />
      <span aria-hidden="true">:</span>
      <Select
        ariaLabel={`${t("目标时间")} · ${t("分钟")}`}
        value={minute}
        options={minutes}
        disabled={disabled}
        onChange={(next) => onChange(`${hour}:${next}`)}
      />
    </div>
  );
}
