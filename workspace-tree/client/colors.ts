/**
 * Colors the plugin theme does not provide, taken from Paseo's own palette in light and dark
 * versions. The plugin theme has no appearance flag, so the background's brightness decides.
 */
export function isDark(hex: string): boolean {
  const match = /^#?([0-9a-f]{6})/i.exec(hex);
  if (!match) return true;
  const value = parseInt(match[1], 16);
  const luminance = 0.299 * (value >> 16) + 0.587 * ((value >> 8) & 255) + 0.114 * (value & 255);
  return luminance < 128;
}

/** Paseo's statusMerged. */
export const mergedColor = (background: string) => (isDark(background) ? "#a890d5" : "#7347af");

/** Paseo's blue, used for workspaces with something new to read. */
export const unreadColor = (background: string) => (isDark(background) ? "#6a9de0" : "#2563eb");

/** A color at low opacity, as rgba. Falls back to transparent for non-hex input. */
export function overlay(hex: string, alpha: number): string {
  const match = /^#?([0-9a-f]{6})/i.exec(hex);
  if (!match) return "transparent";
  const value = parseInt(match[1], 16);
  return `rgba(${value >> 16}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

/**
 * Row fills and lines as translucent text color, laid over whatever the sidebar's background is.
 * The plugin theme does not expose the sidebar's own color, and the fixed surface tokens fail in
 * light mode: there the sidebar is the same gray as surface2 (so selection vanished), surface1 is
 * lighter than it (so hover looked inverted), and the border token barely shows.
 */
export function shades(foreground: string) {
  return {
    hover: overlay(foreground, 0.05),
    selected: overlay(foreground, 0.09),
    pressed: overlay(foreground, 0.12),
    button: overlay(foreground, 0.08),
    line: overlay(foreground, 0.12),
    lineStrong: overlay(foreground, 0.22),
  };
}
