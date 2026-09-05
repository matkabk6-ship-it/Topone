// 3-step onboarding: Welcome → ID reveal → Optional profile.
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Input, Muted } from "@/src/components/ui";
import { showToast } from "@/src/components/toast";
import { api } from "@/src/api";
import { useSession } from "@/src/session";
import { makeStyles, useTheme } from "@/src/theme";

const HERO_DARK =
  "https://images.unsplash.com/photo-1513346940221-6f673d962e97?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NzV8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBhYnN0cmFjdCUyMGRhcmslMjBnb2xkJTIwdGV4dHVyZXxlbnwwfHx8fDE3ODg2MTkzNTR8MA&ixlib=rb-4.1.0&q=85";
const HERO_LIGHT =
  "https://images.unsplash.com/photo-1616410731303-6affae095a0a?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2MzR8MHwxfHNlYXJjaHwxfHx3YXJtJTIwaXZvcnklMjBlbGVnYW50JTIwc3VidGxlJTIwdGV4dHVyZXxlbnwwfHx8fDE3ODg2MTkzNTR8MA&ixlib=rb-4.1.0&q=85";

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const { user, refresh, completeOnboarding } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { scheme, colors } = useTheme();

  const heroUri = scheme === "dark" ? HERO_DARK : HERO_LIGHT;

  const onCopyId = async () => {
    if (!user) return;
    await Clipboard.setStringAsync(user.top_one_id);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    showToast("ID copied to clipboard", "success");
  };

  const onFinish = async () => {
    setSaving(true);
    try {
      if (displayName.trim()) {
        await api.updateMe({ display_name: displayName.trim() });
      }
      await refresh();
      await completeOnboarding();
      router.replace("/(tabs)");
    } catch (e: any) {
      showToast(e?.message ?? "Could not save profile", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="onboarding-screen">
      <Image source={{ uri: heroUri }} style={styles.hero} contentFit="cover" transition={400} />
      <LinearGradient
        colors={[
          "transparent",
          scheme === "dark" ? "rgba(9,9,11,0.7)" : "rgba(252,250,248,0.7)",
          colors.surface,
        ]}
        style={styles.scrim}
      />

      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: 24, paddingBottom: 24 + insets.bottom }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.brand} testID="onboarding-brand">TOP ONE</Text>
          <Muted style={styles.brandSubtitle}>PREMIUM MEMBERS CLUB</Muted>

          {step === 0 && (
            <View style={styles.stepBlock} testID="onboarding-welcome">
              <Text style={styles.headline}>Welcome to the club.</Text>
              <Text style={styles.body1}>
                TOP ONE is your quiet, premium companion for tracking Sridevi, Kalyan and Main Bazar
                — with member-only benefits, secure results, and clean design.
              </Text>
              <View style={{ height: 24 }} />
              <Button
                title="Reveal my TOP ONE ID"
                fullWidth
                onPress={() => setStep(1)}
                testID="onboarding-next-1"
              />
            </View>
          )}

          {step === 1 && (
            <View style={styles.stepBlock} testID="onboarding-id">
              <Muted style={styles.tinyLabel}>YOUR MEMBERSHIP ID</Muted>
              <Text style={styles.idText} selectable testID="onboarding-top-one-id">
                {user?.top_one_id ?? "TOP-••••••••"}
              </Text>
              <Muted style={{ textAlign: "center", marginBottom: 16 }}>
                This ID is permanent, unique, and tied only to this device.
              </Muted>
              <Button title="Copy ID" variant="outline" onPress={onCopyId} testID="onboarding-copy-id" />
              <View style={{ height: 12 }} />
              <Button
                title="Continue"
                fullWidth
                onPress={() => setStep(2)}
                testID="onboarding-next-2"
              />
            </View>
          )}

          {step === 2 && (
            <View style={styles.stepBlock} testID="onboarding-profile">
              <Text style={styles.headline}>Add a name (optional)</Text>
              <Muted>Show up as yourself around the club. You can change this later.</Muted>
              <View style={{ height: 16 }} />
              <Input
                placeholder="Your name"
                value={displayName}
                onChangeText={setDisplayName}
                maxLength={40}
                testID="onboarding-name-input"
              />
              <View style={{ height: 16 }} />
              <Button
                title="Enter TOP ONE"
                fullWidth
                loading={saving}
                onPress={onFinish}
                testID="onboarding-finish"
              />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.surface },
  hero: { position: "absolute", top: 0, left: 0, right: 0, height: 320 },
  scrim: { position: "absolute", top: 0, left: 0, right: 0, height: 380 },
  body: { flex: 1 },
  brand: {
    color: c.brandPrimary,
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: 8,
    textAlign: "center",
    marginTop: 40,
  },
  brandSubtitle: {
    textAlign: "center",
    letterSpacing: 4,
    fontSize: 10,
    marginBottom: 32,
  },
  stepBlock: {
    marginTop: 24,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceSecondary,
  },
  headline: {
    color: c.onSurface,
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  body1: { color: c.onSurfaceSecondary, fontSize: 15, lineHeight: 22 },
  tinyLabel: {
    fontSize: 10,
    letterSpacing: 4,
    textAlign: "center",
    marginBottom: 8,
  },
  idText: {
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: 6,
    textAlign: "center",
    color: c.brandPrimary,
    marginBottom: 12,
  },
}));
