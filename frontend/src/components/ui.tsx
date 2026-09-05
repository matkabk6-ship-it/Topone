// Themed shared UI primitives used across TOP ONE screens.
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { forwardRef } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  PressableProps,
  StyleProp,
  Text,
  TextInput,
  TextInputProps,
  TextProps,
  TextStyle,
  View,
  ViewProps,
  ViewStyle,
} from "react-native";

import { makeStyles, useTheme } from "@/src/theme";

// ---------------- Button ----------------
type ButtonProps = Omit<PressableProps, "children"> & {
  title: string;
  variant?: "primary" | "secondary" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
};

export function Button({
  title,
  variant = "primary",
  size = "md",
  loading,
  disabled,
  fullWidth,
  leftIcon,
  rightIcon,
  style,
  ...rest
}: ButtonProps) {
  const styles = useButtonStyles();
  const { colors } = useTheme();
  const containerStyle: StyleProp<ViewStyle> = [
    styles.base,
    styles[`${variant}Container`],
    styles[`${size}Container`],
    fullWidth && styles.fullWidth,
    (disabled || loading) && styles.disabled,
  ];
  const textStyle: StyleProp<TextStyle> = [
    styles.text,
    styles[`${variant}Text`],
    styles[`${size}Text`],
  ];
  const spinnerColor = variant === "primary" ? colors.onBrandPrimary : colors.brandPrimary;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      style={({ pressed }) => [containerStyle, pressed && styles.pressed, style as ViewStyle]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={spinnerColor} />
      ) : (
        <View style={styles.row}>
          {leftIcon ? <View style={styles.iconLeft}>{leftIcon}</View> : null}
          <Text style={textStyle}>{title}</Text>
          {rightIcon ? <View style={styles.iconRight}>{rightIcon}</View> : null}
        </View>
      )}
    </Pressable>
  );
}

const useButtonStyles = makeStyles((c) => ({
  base: {
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  fullWidth: { alignSelf: "stretch" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconLeft: {},
  iconRight: {},
  smContainer: { paddingVertical: 8, paddingHorizontal: 14, minHeight: 36 },
  mdContainer: { paddingVertical: 12, paddingHorizontal: 18, minHeight: 48 },
  lgContainer: { paddingVertical: 16, paddingHorizontal: 22, minHeight: 56 },
  smText: { fontSize: 13 },
  mdText: { fontSize: 15 },
  lgText: { fontSize: 16 },
  text: { fontWeight: "700", letterSpacing: 0.3 },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
  primaryContainer: { backgroundColor: c.brandPrimary },
  primaryText: { color: c.onBrandPrimary },
  secondaryContainer: { backgroundColor: c.brandTertiary },
  secondaryText: { color: c.onBrandTertiary },
  ghostContainer: { backgroundColor: "transparent" },
  ghostText: { color: c.brandPrimary },
  outlineContainer: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: c.brandPrimary,
  },
  outlineText: { color: c.brandPrimary },
}));

// ---------------- Screen ----------------
export function Screen({ style, children, ...rest }: ViewProps & { children: React.ReactNode }) {
  const styles = useScreenStyles();
  return (
    <View style={[styles.container, style]} {...rest}>
      {children}
    </View>
  );
}

const useScreenStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.surface },
}));

// ---------------- Card ----------------
export function Card({ style, children, ...rest }: ViewProps & { children: React.ReactNode }) {
  const styles = useCardStyles();
  return (
    <View style={[styles.card, style]} {...rest}>
      {children}
    </View>
  );
}

const useCardStyles = makeStyles((c) => ({
  card: {
    backgroundColor: c.surfaceSecondary,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: c.border,
    padding: 20,
  },
}));

// ---------------- Chip ----------------
export function Chip({
  label,
  tone = "neutral",
  style,
  testID,
}: {
  label: string;
  tone?: "neutral" | "success" | "warning" | "error" | "brand" | "info";
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const styles = useChipStyles();
  return (
    <View style={[styles.chip, styles[`${tone}Chip`], style]} testID={testID}>
      <Text style={[styles.text, styles[`${tone}Text`]]}>{label}</Text>
    </View>
  );
}

const useChipStyles = makeStyles((c) => ({
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.border,
    alignSelf: "flex-start",
  },
  text: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
  neutralChip: { backgroundColor: c.surfaceTertiary, borderColor: c.border },
  neutralText: { color: c.onSurfaceTertiary },
  brandChip: { backgroundColor: c.brandTertiary, borderColor: c.brandPrimary },
  brandText: { color: c.onBrandTertiary },
  successChip: { backgroundColor: "transparent", borderColor: c.success },
  successText: { color: c.success },
  warningChip: { backgroundColor: "transparent", borderColor: c.warning },
  warningText: { color: c.warning },
  errorChip: { backgroundColor: "transparent", borderColor: c.error },
  errorText: { color: c.error },
  infoChip: { backgroundColor: "transparent", borderColor: c.info },
  infoText: { color: c.info },
}));

// ---------------- Input ----------------
type InputProps = TextInputProps & {
  label?: string;
  hint?: string;
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
};

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, hint, error, containerStyle, style, ...rest },
  ref,
) {
  const styles = useInputStyles();
  const { colors } = useTheme();
  return (
    <View style={[styles.wrap, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.muted}
        style={[styles.input, error ? styles.inputError : null, style]}
        {...rest}
      />
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
});

const useInputStyles = makeStyles((c) => ({
  wrap: { gap: 6 },
  label: {
    color: c.muted,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: c.surfaceTertiary,
    color: c.onSurface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 14 : 10,
    fontSize: 15,
  },
  inputError: { borderColor: c.error },
  hint: { color: c.muted, fontSize: 12 },
  error: { color: c.error, fontSize: 12 },
}));

// ---------------- Section header ----------------
export function SectionHeader({
  title,
  action,
  subtitle,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  const styles = useSectionStyles();
  return (
    <View style={styles.wrap}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

const useSectionStyles = makeStyles((c) => ({
  wrap: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 20, gap: 12 },
  title: { color: c.onSurface, fontSize: 20, fontWeight: "700", letterSpacing: -0.3 },
  subtitle: { color: c.muted, fontSize: 13, marginTop: 2 },
}));

// ---------------- Skeleton ----------------
export function Skeleton({ height = 80, style }: { height?: number; style?: StyleProp<ViewStyle> }) {
  const styles = useSkeletonStyles();
  return <View style={[styles.box, { height }, style]} />;
}

const useSkeletonStyles = makeStyles((c) => ({
  box: {
    backgroundColor: c.surfaceTertiary,
    borderRadius: 16,
    opacity: 0.6,
  },
}));

// ---------------- Empty ----------------
export function Empty({
  title,
  message,
  action,
}: {
  title: string;
  message?: string;
  action?: React.ReactNode;
}) {
  const styles = useEmptyStyles();
  return (
    <View style={styles.wrap}>
      <View style={styles.dot} />
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {action}
    </View>
  );
}

const useEmptyStyles = makeStyles((c) => ({
  wrap: { alignItems: "center", paddingVertical: 40, paddingHorizontal: 24, gap: 8 },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 999,
    backgroundColor: c.brandPrimary,
    marginBottom: 8,
  },
  title: { color: c.onSurface, fontSize: 16, fontWeight: "700", textAlign: "center" },
  message: { color: c.muted, fontSize: 13, textAlign: "center", maxWidth: 300 },
}));

// ---------------- Text helpers ----------------
export function Display({ style, ...rest }: TextProps) {
  const { colors } = useTheme();
  return (
    <Text
      {...rest}
      style={[
        { color: colors.onSurface, fontSize: 28, fontWeight: "700", letterSpacing: -0.5 },
        style,
      ]}
    />
  );
}

export function Muted({ style, ...rest }: TextProps) {
  const { colors } = useTheme();
  return (
    <Text {...rest} style={[{ color: colors.muted, fontSize: 13 }, style]} />
  );
}

// ---------------- Glass card (blur over hero image) ----------------
export function GlassPane({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { scheme, colors } = useTheme();
  const tint = scheme === "dark" ? "dark" : "light";
  return (
    <BlurView intensity={40} tint={tint} style={[{ borderRadius: 20, overflow: "hidden" }, style]}>
      <View
        style={{
          backgroundColor:
            scheme === "dark" ? "rgba(9,9,11,0.55)" : "rgba(252,250,248,0.65)",
          borderRadius: 20,
          borderWidth: 1,
          borderColor: colors.borderStrong,
          padding: 20,
        }}
      >
        {children}
      </View>
    </BlurView>
  );
}

// Convenient decorative gradient
export function GoldGradient({
  style,
  colors,
}: {
  style?: StyleProp<ViewStyle>;
  colors?: [string, string, ...string[]];
}) {
  return (
    <LinearGradient
      colors={colors ?? ["#D4AF37", "#B8860B", "#7A5A00"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={style}
    />
  );
}
