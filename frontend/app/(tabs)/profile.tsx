// Profile tab: avatar, ID, quick links, hidden admin gesture on version text.
import Feather from "@react-native-vector-icons/feather";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { useRef } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { showToast } from "@/src/components/toast";
import { Card, Chip, Muted } from "@/src/components/ui";
import { useSession, useSubscriptionQuery } from "@/src/session";
import { makeStyles, useTheme } from "@/src/theme";

type IconName = React.ComponentProps<typeof Feather>["name"];

const ROWS: { id: string; label: string; icon: IconName; href: string }[] = [
  { id: "settings", label: "Settings", icon: "settings", href: "/settings" },
  { id: "payments", label: "Payment History", icon: "credit-card", href: "/payments/history" },
  { id: "subscription", label: "Subscription", icon: "star", href: "/subscription" },
  { id: "help", label: "Help & Support", icon: "help-circle", href: "/help" },
  { id: "terms", label: "Terms of Service", icon: "file-text", href: "/legal/terms" },
  { id: "privacy", label: "Privacy Policy", icon: "shield", href: "/legal/privacy" },
  { id: "responsible", label: "Responsible Use", icon: "alert-triangle", href: "/legal/responsible-use" },
  { id: "refund", label: "Payment & Refund", icon: "refresh-ccw", href: "/legal/refund" },
];

export default function ProfileTab() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useSession();
  const subQ = useSubscriptionQuery();

  const tapsRef = useRef({ count: 0, last: 0 });

  const initials = (user?.display_name ?? "TOP ONE")
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const onVersionTap = () => {
    const now = Date.now();
    if (now - tapsRef.current.last > 1200) {
      tapsRef.current.count = 0;
    }
    tapsRef.current.last = now;
    tapsRef.current.count += 1;
    if (tapsRef.current.count >= 5) {
      tapsRef.current.count = 0;
      showToast("Admin gate", "info");
      router.push("/admin/login");
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 40 }}
      testID="profile-screen"
    >
      <Text style={styles.title}>Profile</Text>

      <View style={styles.identityWrap}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials || "TO"}</Text>
        </View>
        <Text style={styles.name} numberOfLines={1}>
          {user?.display_name?.trim() || "Anonymous Member"}
        </Text>
        <Muted style={styles.idLabel}>TOP ONE ID</Muted>
        <Text style={styles.id} selectable testID="profile-top-one-id">
          {user?.top_one_id ?? "TOP-••••••••"}
        </Text>
        <Chip
          label={subQ.data ? `${subQ.data.plan_name} · Active` : "No active plan"}
          tone={subQ.data ? "success" : "neutral"}
          style={{ marginTop: 8 }}
        />
      </View>

      <View style={{ paddingHorizontal: 20, marginTop: 24, gap: 8 }}>
        {ROWS.map((r) => (
          <Pressable
            key={r.id}
            onPress={() => router.push(r.href as any)}
            testID={`profile-row-${r.id}`}
            accessibilityRole="button"
          >
            <Card style={styles.row}>
              <View style={styles.rowIcon}>
                <Feather name={r.icon} size={16} color={colors.brandPrimary} />
              </View>
              <Text style={styles.rowLabel}>{r.label}</Text>
              <Feather name="chevron-right" size={18} color={colors.muted} />
            </Card>
          </Pressable>
        ))}
      </View>

      <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
        <Pressable
          onPress={async () => {
            await signOut();
            showToast("Reset done", "info");
          }}
          testID="profile-reset"
        >
          <Card style={{ alignItems: "center" }}>
            <Text style={{ color: colors.error, fontWeight: "700" }}>Reset device</Text>
            <Muted style={{ fontSize: 12, textAlign: "center", marginTop: 4 }}>
              Signs you out of this device and creates a new membership on next launch.
            </Muted>
          </Card>
        </Pressable>
      </View>

      <View style={{ alignItems: "center", marginTop: 24 }}>
        <Pressable onPress={onVersionTap} hitSlop={8} testID="profile-version">
          <Text style={styles.version}>
            TOP ONE · v{Constants.expoConfig?.version ?? "1.0.0"}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.surface },
  title: {
    color: c.onSurface,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
    paddingHorizontal: 20,
  },
  identityWrap: {
    marginTop: 16,
    marginHorizontal: 20,
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceSecondary,
    alignItems: "center",
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 999,
    backgroundColor: c.brandTertiary,
    borderWidth: 1,
    borderColor: c.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  avatarText: {
    color: c.onBrandTertiary,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 2,
  },
  name: { color: c.onSurface, fontSize: 18, fontWeight: "700" },
  idLabel: { marginTop: 12, fontSize: 10, letterSpacing: 4 },
  id: { color: c.brandPrimary, fontSize: 22, fontWeight: "800", letterSpacing: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 16 },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: c.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { flex: 1, color: c.onSurface, fontSize: 15, fontWeight: "600" },
  version: { color: c.muted, fontSize: 12, letterSpacing: 1.5 },
}));
