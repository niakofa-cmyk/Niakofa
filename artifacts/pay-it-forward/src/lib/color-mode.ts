export const COLOR_MODE_KEY = "niakofa-color-mode";

export type ColorMode = "dark" | "light";

const COLOR_MODE_COLORS: Record<ColorMode, { background: string; foreground: string }> = {
  dark: { background: "#08182b", foreground: "#ffffff" },
  light: { background: "#f8fafc", foreground: "#08182b" },
};

export function readColorMode(): ColorMode {
  try {
    return localStorage.getItem(COLOR_MODE_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function applyColorMode(mode: ColorMode): void {
  const colors = COLOR_MODE_COLORS[mode];
  const root = document.documentElement;

  root.classList.toggle("dark", mode === "dark");
  root.style.colorScheme = mode;
  root.style.background = colors.background;
  root.style.color = colors.foreground;
  document
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute("content", colors.background);

  try {
    localStorage.setItem(COLOR_MODE_KEY, mode);
  } catch {
    // The visual preference still applies when storage is unavailable.
  }
}