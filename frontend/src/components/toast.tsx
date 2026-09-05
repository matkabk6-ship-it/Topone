// Toast host: mounted once in _layout, exposes show()/hide() via imperative API.
import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/src/theme";

type Toast = {
  id: number;
  message: string;
  tone: "success" | "error" | "info" | "warning";
};

export type ToastRef = {
  show: (message: string, tone?: Toast["tone"]) => void;
};

let toastRef: ToastRef | null = null;

export function showToast(message: string, tone: Toast["tone"] = "info") {
  toastRef?.show(message, tone);
}

export const ToastHost = forwardRef<ToastRef>(function ToastHost(_props, ref) {
  const [toast, setToast] = useState<Toast | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { colors } = useTheme();

  useImperativeHandle(ref, () => ({
    show: (message, tone = "info") => {
      const id = Date.now();
      setToast({ id, message, tone });
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: 220,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }).start(() => setToast(null));
      }, 2600);
    },
  }));

  useEffect(() => {
    toastRef = ref && typeof ref === "object" && "current" in ref ? ref.current : null;
    return () => {
      toastRef = null;
    };
  }, [ref]);

  if (!toast) return null;

  const toneColor =
    toast.tone === "success"
      ? colors.success
      : toast.tone === "error"
        ? colors.error
        : toast.tone === "warning"
          ? colors.warning
          : colors.brandPrimary;

  return (
    <View pointerEvents="none" style={styles.host}>
      <Animated.View
        style={[
          styles.toast,
          {
            opacity,
            backgroundColor: colors.surfaceInverse,
            borderColor: toneColor,
          },
        ]}
        testID="toast"
      >
        <View style={[styles.dot, { backgroundColor: toneColor }]} />
        <Text style={[styles.message, { color: colors.onSurfaceInverse }]} numberOfLines={2}>
          {toast.message}
        </Text>
      </Animated.View>
    </View>
  );
});

// Set the singleton ref accessor once the component mounts.
export function useRegisterToast(ref: React.RefObject<ToastRef | null>) {
  useEffect(() => {
    toastRef = ref.current;
    return () => {
      if (toastRef === ref.current) toastRef = null;
    };
  }, [ref]);
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 40,
    left: 16,
    right: 16,
    alignItems: "center",
    zIndex: 9999,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: "100%",
  },
  dot: { width: 8, height: 8, borderRadius: 999 },
  message: { fontSize: 14, fontWeight: "600", flex: 1 },
});
