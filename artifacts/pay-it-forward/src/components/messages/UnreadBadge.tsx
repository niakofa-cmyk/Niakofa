export function UnreadBadge({ count }: { count: number }) {
  if (count < 1) return null;
  return (
    <span className="inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-black text-primary-foreground">
      {count > 99 ? "99+" : count}
    </span>
  );
}