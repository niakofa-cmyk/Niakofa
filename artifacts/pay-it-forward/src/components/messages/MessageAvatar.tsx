import { PresenceIndicator } from "./PresenceIndicator";

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}

export function MessageAvatar({
  name,
  avatarUrl,
  size = 40,
  active,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  active?: boolean | null;
}) {
  const dimension = size <= 36 ? "h-9 w-9 text-[10px]" : size <= 44 ? "h-10 w-10 text-xs" : "h-14 w-14 text-sm";
  return (
    <span className="relative inline-flex shrink-0">
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className={`${dimension} rounded-2xl object-cover`} />
      ) : (
        <span className={`flex ${dimension} items-center justify-center rounded-2xl bg-primary/15 font-black text-primary`}>
          {initials(name)}
        </span>
      )}
      <PresenceIndicator active={active} />
    </span>
  );
}