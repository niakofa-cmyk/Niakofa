import type { ReactNode } from "react";

export function MessagesShell({
  list,
  thread,
  info,
  rightRail,
  showThread,
  showInfo
}: {
  list: ReactNode;
  thread: ReactNode;
  info?: ReactNode;
  rightRail?: ReactNode;
  showThread: boolean;
  showInfo?: boolean;
}) {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-1rem)] w-full max-w-[82rem] flex-col px-0 pb-20 pt-0 sm:px-2 lg:pb-3">
      <div className="flex min-h-[calc(100dvh-4rem)] flex-1 overflow-hidden border border-border bg-card shadow-sm lg:rounded-3xl">
        <div className={`min-h-0 w-full min-w-0 lg:w-[18rem] lg:shrink-0 ${showThread || showInfo ? "hidden lg:flex lg:flex-col" : "flex flex-col"}`}>{list}</div>
        <div className={`min-h-0 min-w-0 flex-1 flex-col ${showThread && !showInfo ? "flex" : "hidden lg:flex"}`}>{thread}</div>
        {info && <div className={`w-full min-w-0 lg:w-[16rem] lg:shrink-0 ${showInfo ? "flex flex-col" : "hidden xl:flex xl:flex-col"}`}>{info}</div>}
        {rightRail}
      </div>
    </div>
  );
}
