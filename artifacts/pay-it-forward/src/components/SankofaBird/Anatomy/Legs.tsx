import React from "react";

/** Both legs + toes + talon specular catchlights + knee joint highlights. */
export function Legs(): React.ReactElement {
  return (
    <>
            <g className="sankofa-bird-legs">
              <g
                className="sankofa-leg-left"
                style={{ transformBox: "view-box", transformOrigin: "18.5px 29.5px" } as React.CSSProperties}
              >
                <line
                  x1="18.5" y1="29.5"
                  x2="16.5" y2="34"
                  stroke="hsl(190, 70%, 36%)"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
                <line x1="16.5" y1="34" x2="14.5" y2="35.5" stroke="hsl(190, 70%, 36%)" strokeWidth="0.8" strokeLinecap="round" />
                <line x1="16.5" y1="34" x2="16.2" y2="36"   stroke="hsl(190, 70%, 36%)" strokeWidth="0.8" strokeLinecap="round" />
                <line x1="16.5" y1="34" x2="18.2" y2="35.4" stroke="hsl(190, 70%, 36%)" strokeWidth="0.8" strokeLinecap="round" />
              </g>

              <g
                className="sankofa-leg-right"
                style={{ transformBox: "view-box", transformOrigin: "21.5px 29.5px" } as React.CSSProperties}
              >
                <line
                  x1="21.5" y1="29.5"
                  x2="23.5" y2="34"
                  stroke="hsl(190, 70%, 36%)"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
                <line x1="23.5" y1="34" x2="25.5" y2="35.5" stroke="hsl(190, 70%, 36%)" strokeWidth="0.8" strokeLinecap="round" />
                <line x1="23.5" y1="34" x2="23.8" y2="36"   stroke="hsl(190, 70%, 36%)" strokeWidth="0.8" strokeLinecap="round" />
                <line x1="23.5" y1="34" x2="21.8" y2="35.4" stroke="hsl(190, 70%, 36%)" strokeWidth="0.8" strokeLinecap="round" />
              </g>

              <path
                className="sankofa-talon-left"
                d="M14.2 35.8 C13.6 36.5 13.4 37.0 13.8 37.1 C14.2 36.6 14.6 36.0 14.5 35.6 Z"
                fill="hsl(196, 40%, 72%)"
                opacity={0}
                style={{ transformBox: "view-box", transformOrigin: "14px 36.4px" } as React.CSSProperties}
              />
              <path
                className="sankofa-talon-right"
                d="M25.8 35.8 C26.4 36.5 26.6 37.0 26.2 37.1 C25.8 36.6 25.4 36.0 25.5 35.6 Z"
                fill="hsl(196, 40%, 72%)"
                opacity={0}
                style={{ transformBox: "view-box", transformOrigin: "26px 36.4px" } as React.CSSProperties}
              />

              <circle
                className="sankofa-knee-joint sankofa-knee-joint-left"
                cx="17.5" cy="31.8" r="0.55"
                fill="hsl(192, 75%, 46%)"
                opacity={0}
                style={{ transformBox: "view-box", transformOrigin: "17.5px 31.8px" } as React.CSSProperties}
              />
              <circle
                className="sankofa-knee-joint sankofa-knee-joint-right"
                cx="22.5" cy="31.8" r="0.55"
                fill="hsl(192, 75%, 46%)"
                opacity={0}
                style={{ transformBox: "view-box", transformOrigin: "22.5px 31.8px" } as React.CSSProperties}
              />
            </g>
    </>
  );
}
