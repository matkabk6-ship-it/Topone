// Entry screen: waits for session bootstrap, then routes to onboarding or tabs.
import { LinearGradient } from "expo-linear-gradient";
import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { useSession } from "@/src/session";
import { useTheme } from "@/src/theme";

export default function Index() {
  const { ready, hasOnboarded } = useSession();
  const { colors } = useTheme();

  if (!ready) {
    return (
      <View style={[styles.splash, { backgroundColor: colors.surface }]} testID="splash-screen">
        <LinearGradient
          colors={["transparent", colors.brandTertiary, "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Text style={[styles.title, { color: colors.brandPrimary }]}>TOP ONE</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>PREMIUM MEMBERS CLUB</Text>
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 24 }} />
      </View>
    );
  }

  if (!hasOnboarded) return <Redirect href="/onboarding" />;
  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: {
    fontSize: 44,
    fontWeight: "800",
    letterSpacing: 8,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 11,
    letterSpacing: 6,
    fontWeight: "600",
  },
});
