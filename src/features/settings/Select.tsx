import * as SelectPrimitive from "@radix-ui/react-select";
import { useLayoutEffect, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export type SelectOption = { value: string; label: string };

interface Props {
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
}

/** Shared settings select; Radix handles focus, keyboard navigation and positioning. */
export function Select({
  value,
  options,
  onChange,
  disabled,
  ariaLabel,
}: Props) {
  const [portal] = useState(() => document.createElement("div"));
  useLayoutEffect(() => {
    const syncZoom = () => {
      const zoom =
        Number.parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
      portal.setAttribute("style", `zoom: ${1 / zoom}`);
    };
    syncZoom();
    document.body.appendChild(portal);
    const observer = new MutationObserver(syncZoom);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style"],
    });
    return () => {
      observer.disconnect();
      portal.remove();
    };
  }, [portal]);
  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={onChange}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        className="select-trigger"
        aria-label={ariaLabel}
      >
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon>
          <ChevronDown size={14} aria-hidden="true" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal container={portal}>
        <SelectPrimitive.Content
          className="select-menu"
          position="popper"
          align="start"
          sideOffset={4}
          collisionPadding={12}
        >
          <SelectPrimitive.Viewport className="select-viewport">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                className="select-option"
              >
                <SelectPrimitive.ItemText>
                  {option.label}
                </SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator>
                  <Check size={13} aria-hidden="true" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
