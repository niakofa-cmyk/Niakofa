import type { ReactNode } from "react";

export function MessagesShell({
  sidebar,
  list,
  thread,
  info,
  showThread,
  showInfo,
  mobileTabs,
}: {
  sidebar?: ReactNode;
  list: ReactNode;
  thread: ReactNode;
  info?: ReactNode;
  showThread: boolean;
  showInfo?: boolean;
  mobileTabs?: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-[70dvh] w-full max-w-7xl flex-col gap-3 px-2 pb-24 pt-3 sm:px-4 lg:pb-8">
      {!showThread && !showInfo && mobileTabs && <div className="lg:hidden">{mobileTabs}</div>}
      <div className="flex min-h-[32rem] flex-1 overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        {sidebar}
        <div className={`min-h-0 w-full min-w-0 lg:w-[min(22rem,34%)] lg:shrink-0 ${showThread || showInfo ? "hidden lg:flex lg:flex-col" : "flex flex-col"}`}>{list}</div>
        <div className={`min-h-0 min-w-0 flex-1 flex-col ${showThread && !showInfo ? "flex" : "hidden lg:flex"}`}>{thread}</div>
        {info && <div className={`w-full min-w-0 lg:w-64 lg:shrink-0 ${showInfo ? "flex flex-col" : "hidden xl:flex xl:flex-col"}`}>{info}</div>}
      </div>
    </div>
  );
}