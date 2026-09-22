interface SpiralMarkProps {
  className?: string;
  label?: string;
}

/** A small product mark used to identify Niakofa Spirals without added claims. */
export function SpiralMark({
  className = "h-5 w-5",
  label = "Niakofa Spirals",
}: SpiralMarkProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label={label}
    >
      <path
        d="M12 12a2.25 2.25 0 1 1-2.25 2.25c0-3.73 3.02-6.75 6.75-6.75s6.75 3.02 6.75 6.75S20.23 21 16.5 21C10.15 21 5 15.85 5 9.5S10.15-2 16.5-2"
        className="stroke-current"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}