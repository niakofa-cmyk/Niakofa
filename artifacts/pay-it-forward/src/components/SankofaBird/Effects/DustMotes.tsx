import React from "react";
import { useBird } from "../Core/Context";

/**
 * Idle dust motes + walk-dust lateral pair + helping orbit particles.
 * All CSS-gated via data-* attrs on the parent rig.
 */
export function DustMotes(): React.ReactElement {
  const { isHelping, celebrating, donated } = useBird();
  return (
    <>
            <circle className="sankofa-idle-dust sankofa-dust-1"
              cx="15.5" cy="35.5" r="0.32" fill="hsl(190, 100%, 72%)" opacity={0}
              style={{ transformBox: "view-box", transformOrigin: "15.5px 35.5px" } as React.CSSProperties}
            />
            <circle className="sankofa-idle-dust sankofa-dust-2"
              cx="20" cy="37" r="0.26" fill="hsl(190, 100%, 78%)" opacity={0}
              style={{ transformBox: "view-box", transformOrigin: "20px 37px" } as React.CSSProperties}
            />
            <circle className="sankofa-idle-dust sankofa-dust-3"
              cx="24.5" cy="35.5" r="0.22" fill="hsl(190, 100%, 72%)" opacity={0}
              style={{ transformBox: "view-box", transformOrigin: "24.5px 35.5px" } as React.CSSProperties}
            />

            <circle className="sankofa-walk-dust-4"
              cx="14.0" cy="35.0" r="0.28" fill="hsl(190, 100%, 68%)" opacity={0}
              style={{ transformBox: "view-box", transformOrigin: "14px 35px" } as React.CSSProperties}
            />
            <circle className="sankofa-walk-dust-5"
              cx="26.0" cy="35.0" r="0.24" fill="hsl(190, 100%, 68%)" opacity={0}
              style={{ transformBox: "view-box", transformOrigin: "26px 35px" } as React.CSSProperties}
            />

            {isHelping && !celebrating && !donated && ([0, 120, 240] as const).map((deg) => (
              <circle
                key={deg}
                className="sankofa-helping-orbit-dot"
                cx="20" cy="13.5"
                r="0.42"
                fill="hsl(45, 95%, 68%)"
                opacity={0}
                style={{
                  transformBox: "view-box",
                  transformOrigin: "20px 21px",
                  animationDelay: `${deg * 0.00778}s`,
                } as React.CSSProperties}
              />
            ))}

            <circle
              className="sankofa-wing-beat-ring"
              cx="20" cy="27" r="2.4"
              fill="none"
              stroke="hsl(192, 100%, 78%)"
              strokeWidth="0.48"
              opacity={0}
              style={{ transformBox: "view-box", transformOrigin: "20px 27px" } as React.CSSProperties}
            />

            <line className="sankofa-speed-streak sankofa-speed-streak-1"
              x1="22" y1="14" x2="28" y2="14"
              stroke="hsl(192, 100%, 80%)" strokeWidth="0.45" strokeLinecap="round" opacity={0}
              style={{ transformBox: "view-box", transformOrigin: "20px 14px" } as React.CSSProperties}
            />
            <line className="sankofa-speed-streak sankofa-speed-streak-2"
              x1="22" y1="18" x2="27" y2="18"
              stroke="hsl(192, 100%, 85%)" strokeWidth="0.35" strokeLinecap="round" opacity={0}
              style={{ transformBox: "view-box", transformOrigin: "20px 18px" } as React.CSSProperties}
            />
            <line className="sankofa-speed-streak sankofa-speed-streak-3"
              x1="22" y1="22" x2="26" y2="22"
              stroke="hsl(192, 100%, 75%)" strokeWidth="0.28" strokeLinecap="round" opacity={0}
              style={{ transformBox: "view-box", transformOrigin: "20px 22px" } as React.CSSProperties}
            />

            <circle
              className="sankofa-notification-ring"
              cx="20" cy="20" r="3.5"
              fill="none"
              stroke="hsl(192, 100%, 72%)"
              strokeWidth="0.50"
              opacity={0}
              style={{ transformBox: "view-box", transformOrigin: "20px 20px" } as React.CSSProperties}
            />

            <circle
              className="sankofa-vortex sankofa-vortex-left"
              cx="3.5" cy="6.5"
              r="1.1"
              fill="none"
              stroke="hsl(192, 100%, 76%)"
              strokeWidth="0.55"
              opacity={0}
              style={{ transformBox: "view-box", transformOrigin: "3.5px 6.5px" } as React.CSSProperties}
            />
            <circle
              className="sankofa-vortex sankofa-vortex-right"
              cx="36.5" cy="6.5"
              r="1.1"
              fill="none"
              stroke="hsl(192, 100%, 76%)"
              strokeWidth="0.55"
              opacity={0}
              style={{ transformBox: "view-box", transformOrigin: "36.5px 6.5px" } as React.CSSProperties}
            />
    </>
  );
}
