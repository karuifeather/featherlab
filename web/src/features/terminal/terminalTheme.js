/**
 * xterm.js theme. Surface colours come from the `--terminal-*` design tokens so the shell
 * matches the app's neutral chrome; the 16-colour ANSI palette is defined here because it is
 * functional, not decorative — `ls`, kubectl, prompts and errors rely on it. The palette is
 * muted to sit on the neutral background but keeps every hue distinct: all foreground hues,
 * including "bright black" (which tools use for dim text), are >= 4.5:1 on --terminal-bg.
 * ANSI "black" is deliberately close to the background, as in most terminal palettes.
 */
const ANSI = {
  black: "#2c2d32",
  red: "#f28b82",
  green: "#81c995",
  yellow: "#e3c47e",
  blue: "#8ab4f8",
  magenta: "#c9a3e0",
  cyan: "#7fcfcf",
  white: "#d4d4d8",
  brightBlack: "#8b8b94",
  brightRed: "#ffaaa3",
  brightGreen: "#a3dcb2",
  brightYellow: "#f0d59a",
  brightBlue: "#aecbfa",
  brightMagenta: "#dcbdf0",
  brightCyan: "#a2e0e0",
  brightWhite: "#f4f4f5",
};

export function terminalTheme(element = document.documentElement) {
  const styles = getComputedStyle(element);
  const token = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
  return {
    background: token("--terminal-bg", "#111214"),
    foreground: token("--terminal-fg", "#e4e4e7"),
    cursor: token("--terminal-cursor", "#e4e4e7"),
    cursorAccent: token("--terminal-bg", "#111214"),
    selectionBackground: token("--terminal-selection", "rgba(161, 161, 170, 0.32)"),
    ...ANSI,
  };
}
