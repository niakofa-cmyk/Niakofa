import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { applyColorMode, readColorMode, type ColorMode } from "@/lib/color-mode";

interface ColorModeSwitchProps {
  ariaLabel?: string;
}

export function ColorModeSwitch({
  ariaLabel = "Color mode",
}: ColorModeSwitchProps) {
  const [mode, setMode] = useState<ColorMode>(readColorMode);

  const choose = (next: ColorMode) => {
    setMode(next);
    applyColorMode(next);
  };

  return (
    <div className="grid grid-cols-2 gap-2" role="group" aria-label={ariaLabel}>
      <button
        type="button"
        aria-pressed={mode === "dark"}
        onClick={() => choose("dark")}
        className={`min-h-11 rounded-xl border px-3 text-sm font-bold ${
          mode === "dark"
            ? "border-[#00cfff] bg-[#00cfff] text-[#08182b]"
            : "border-border bg-card text-foreground"
        }`}
        data-testid="button-color-mode-dark"
      >
        <Moon className="mr-1 inline h-4 w-4" aria-hidden="true" />
        Dark
      </button>
      <button
        type="button"
        aria-pressed={mode === "light"}
        onClick={() => choose("light")}
        className={`min-h-11 rounded-xl border px-3 text-sm font-bold ${
          mode === "light"
            ? "border-[#00cfff] bg-[#00cfff] text-[#08182b]"
            : "border-border bg-card text-foreground"
        }`}
        data-testid="button-color-mode-light"
      >
        <Sun className="mr-1 inline h-4 w-4" aria-hidden="true" />
        Light
      </button>
    </div>
  );
}