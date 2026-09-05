import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useRef } from "react";
import { LogBox } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { ToastHost, ToastRef, useRegisterToast } from "@/src/components/toast";
import { queryClient } from "@/src/query-client";
import { SessionProvider } from "@/src/session";
import { useTheme } from "@/src/theme";

LogBox.ignoreAllLogs(true);

export default function RootLayout() {
  const toastRef = useRef<ToastRef | null>(null);
  useRegisterToast(toastRef);
  const { scheme } = useTheme();

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <QueryClientProvider client={queryClient}>
            <SessionProvider>
              <StatusBar style={scheme === "dark" ? "light" : "dark"} />
              <Stack screenOptions={{ headerShown: false, animation: "fade" }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="onboarding" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="subscription" options={{ presentation: "card" }} />
                <Stack.Screen name="payment/[planId]" options={{ presentation: "card" }} />
                <Stack.Screen name="payments/history" />
                <Stack.Screen name="game/[id]" />
                <Stack.Screen name="settings" />
                <Stack.Screen name="legal/[doc]" />
                <Stack.Screen name="help" />
                <Stack.Screen name="admin/login" options={{ presentation: "modal" }} />
                <Stack.Screen name="admin/(admin)" />
              </Stack>
              <ToastHost ref={toastRef} />
            </SessionProvider>
          </QueryClientProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
