export function PresenceIndicator({ active }: { active?: boolean | null }) {
  if (!active) return null;
  return (
    <span
      className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card bg-emerald-400"
      title="Active now"
      aria-label="Active now"
    />
  );
}