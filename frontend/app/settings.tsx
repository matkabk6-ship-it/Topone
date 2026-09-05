// Settings: theme, notifications, sound, appearance override, name edit, about.
import Feather from "@react-native-vector-icons/feather";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { Card, Input, Muted } from "@/src/components/ui";
import { showToast } from "@/src/components/toast";
import { useSession } from "@/src/session";
import { makeStyles, setColorScheme, useTheme } from "@/src/theme";

export default function Settings() {
  const styles = useStyles();
  const { colors, scheme, pref } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, refresh } = useSession();

  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [notif, setNotif] = useState(user?.notifications_enabled ?? true);
  const [sound, setSound] = useState(user?.sound_enabled ?? true);

  useEffect(() => {
    setDisplayName(user?.display_name ?? "");
    setNotif(user?.notifications_enabled ?? true);
    setSound(user?.sound_enabled ?? true);
  }, [user]);

  const saveField = async (field: string, value: any) => {
    try {
      await api.updateMe({ [field]: value });
      await refresh();
      showToast("Saved", "success");
    } catch {
      showToast("Save failed", "error");
    }
  };

  const changeTheme = async (val: "light" | "dark" | "system") => {
    setColorScheme(val === "system" ? null : val);
    await saveField("theme", val);
  };

  return (
    <View style={styles.container} testID="settings-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} testID="settings-back">
          <Feather name="chevron-left" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 14 }}>
        <Card>
          <Muted style={styles.label}>DISPLAY NAME</Muted>
          <Input
            placeholder="Your name"
            value={displayName}
            onChangeText={setDisplayName}
            maxLength={40}
            onEndEditing={() => saveField("display_name", displayName.trim())}
            testID="settings-name"
          />
        </Card>

        <Card>
          <Muted style={styles.label}>APPEARANCE</Muted>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            {(["light", "dark", "system"] as const).map((t) => {
              const active = pref === t;
              return (
                <Pressable
                  key={t}
                  style={[styles.themePill, active && { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary }]}
                  onPress={() => changeTheme(t)}
                  testID={`settings-theme-${t}`}
                >
                  <Feather
                    name={t === "light" ? "sun" : t === "dark" ? "moon" : "smartphone"}
                    size={14}
                    color={active ? colors.onBrandTertiary : colors.onSurface}
                  />
                  <Text style={[styles.themeText, active && { color: colors.onBrandTertiary }]}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Muted style={{ fontSize: 11, marginTop: 10 }}>
            Current scheme: {scheme}
          </Muted>
        </Card>

        <Card>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Notifications</Text>
              <Muted style={{ fontSize: 12 }}>In-app alerts for results, payments, and announcements.</Muted>
            </View>
            <Switch
              value={notif}
              onValueChange={(v) => {
                setNotif(v);
                saveField("notifications_enabled", v);
              }}
              testID="settings-notif-switch"
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Sound</Text>
              <Muted style={{ fontSize: 12 }}>Play subtle sounds for feedback.</Muted>
            </View>
            <Switch
              value={sound}
              onValueChange={(v) => {
                setSound(v);
                saveField("sound_enabled", v);
              }}
              testID="settings-sound-switch"
            />
          </View>
        </Card>

        <Card>
          <Muted style={styles.label}>ABOUT</Muted>
          <View style={styles.aboutRow}>
            <Text style={styles.rowTitle}>App version</Text>
            <Muted style={{ fontSize: 13 }}>{Constants.expoConfig?.version ?? "1.0.0"}</Muted>
          </View>
          <View style={styles.divider} />
          <Pressable style={styles.aboutRow} onPress={() => router.push("/legal/terms")} testID="settings-terms">
            <Text style={styles.rowTitle}>Terms of Service</Text>
            <Feather name="chevron-right" size={16} color={colors.muted} />
          </Pressable>
          <View style={styles.divider} />
          <Pressable style={styles.aboutRow} onPress={() => router.push("/legal/privacy")} testID="settings-privacy">
            <Text style={styles.rowTitle}>Privacy Policy</Text>
            <Feather name="chevron-right" size={16} color={colors.muted} />
          </Pressable>
          <View style={styles.divider} />
          <Pressable style={styles.aboutRow} onPress={() => router.push("/help")} testID="settings-help">
            <Text style={styles.rowTitle}>Help & Support</Text>
            <Feather name="chevron-right" size={16} color={colors.muted} />
          </Pressable>
        </Card>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.surface },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 0.5,
    borderColor: c.divider,
  },
  title: { color: c.onSurface, fontSize: 22, fontWeight: "700" },
  label: { fontSize: 10, letterSpacing: 3, marginBottom: 6 },
  rowTitle: { color: c.onSurface, fontSize: 15, fontWeight: "600" },
  switchRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  divider: { height: 1, backgroundColor: c.divider, marginVertical: 4 },
  themePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceTertiary,
  },
  themeText: { fontSize: 12, fontWeight: "700", color: c.onSurface },
  aboutRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 },
}));
