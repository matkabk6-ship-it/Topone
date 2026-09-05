// TOP ONE — Glass / Luxe dual-theme tokens.
//
// Palette source: /app/design_guidelines.json (color.light / color.dark).
// Default scheme: dark (premium obsidian + gold identity).
//
// The user picks the theme in Settings. We store their choice in-memory via a
// tiny subscribable "themeOverride"; SessionProvider hydrates it from the user
// profile on launch. When override === "system" we follow the OS scheme.

import { useEffect, useMemo, useState } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";
export type ThemePref = "light" | "dark" | "system";

const light = {
  surface: "#FCFAF8",
  onSurface: "#1A1A1A",
  surfaceSecondary: "#F5F2ED",
  onSurfaceSecondary: "#262626",
  surfaceTertiary: "#EBE5D9",
  onSurfaceTertiary: "#262626",
  surfaceInverse: "#121212",
  onSurfaceInverse: "#F5F2ED",
  muted: "#737373",

  brand: "#B8860B",
  onBrand: "#FFFFFF",
  brandPrimary: "#B8860B",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#D4AF37",
  onBrandSecondary: "#1A1A1A",
  brandTertiary: "#F0E6D2",
  onBrandTertiary: "#B8860B",

  success: "#15803D",
  onSuccess: "#FFFFFF",
  warning: "#CA8A04",
  onWarning: "#FFFFFF",
  error: "#B91C1C",
  onError: "#FFFFFF",
  info: "#4B5563",
  onInfo: "#FFFFFF",

  border: "#E6E1D6",
  borderStrong: "#D1C7B3",
  divider: "#E6E1D6",
};

const dark: typeof light = {
  surface: "#09090B",
  onSurface: "#F5F2ED",
  surfaceSecondary: "#18181B",
  onSurfaceSecondary: "#E5E5E5",
  surfaceTertiary: "#27272A",
  onSurfaceTertiary: "#E5E5E5",
  surfaceInverse: "#F5F2ED",
  onSurfaceInverse: "#09090B",
  muted: "#A3A3A3",

  brand: "#D4AF37",
  onBrand: "#09090B",
  brandPrimary: "#D4AF37",
  onBrandPrimary: "#09090B",
  brandSecondary: "#B8860B",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#2A2415",
  onBrandTertiary: "#D4AF37",

  success: "#16A34A",
  onSuccess: "#FFFFFF",
  warning: "#EAB308",
  onWarning: "#09090B",
  error: "#EF4444",
  onError: "#FFFFFF",
  info: "#9CA3AF",
  onInfo: "#09090B",

  border: "#27272A",
  borderStrong: "#3F3F46",
  divider: "#27272A",
};

export type ThemeColors = typeof light;

export const defaultScheme: ColorScheme = "dark";
export const themes: { light: ThemeColors; dark: ThemeColors } = { light, dark };

// --- override plumbing ------------------------------------------------------
let override: ThemePref = "dark";
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

export function setColorScheme(scheme: ColorScheme | null | "system") {
  override = scheme === null || scheme === "system" ? "system" : scheme;
  try {
    Appearance.setColorScheme?.(scheme === "system" ? null : (scheme as ColorScheme));
  } catch {
    /* web fallback */
  }
  emit();
}

export function getThemeOverride(): ThemePref {
  return override;
}

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors; pref: ThemePref } {
  const system = useColorScheme();
  const [, setV] = useState(0);
  useEffect(() => {
    const fn = () => setV((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  const scheme: ColorScheme =
    override === "system"
      ? system === "light" || system === "dark"
        ? system
        : defaultScheme
      : override;
  return { scheme, colors: themes[scheme], pref: override };
}

/**
 * Themed StyleSheet: returns a hook that builds the sheet from the active
 * scheme's colors and memoizes it until the scheme changes.
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
