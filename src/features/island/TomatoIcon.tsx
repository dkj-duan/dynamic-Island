type Props = { filled?: boolean; size?: number; className?: string };

export function TomatoIcon({
  filled = true,
  size = 12,
  className = "",
}: Props) {
  return (
    <svg
      className={`tomato ${filled ? "is-filled" : ""} ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path
        className="tomato-body"
        d="M8 4.6c-2.9 0-5.2 2.2-5.2 5.1 0 2.9 2.3 5.1 5.2 5.1s5.2-2.2 5.2-5.1c0-2.9-2.3-5.1-5.2-5.1Z"
      />
      <path
        className="tomato-leaf"
        d="M8 4.8 6.3 2.7l1.3.2L8 1.3l.4 1.6 1.3-.2L8 4.8Z"
      />
      <ellipse
        className="tomato-shine"
        cx="5.9"
        cy="7.4"
        rx="1"
        ry="1.6"
        transform="rotate(-24 5.9 7.4)"
      />
    </svg>
  );
}
