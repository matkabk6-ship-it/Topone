// Hidden admin login: email + password + 6-digit PIN. Rate-limited server-side.
import Feather from "@react-native-vector-icons/feather";
import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError, adminApi, setAdminToken } from "@/src/api";
import { Button, Card, Input, Muted } from "@/src/components/ui";
import { showToast } from "@/src/components/toast";
import { makeStyles, useTheme } from "@/src/theme";

export default function AdminLogin() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const submit = async () => {
    if (!email || !password || pin.length !== 6) {
      showToast("Enter email, password and 6-digit PIN.", "warning");
      return;
    }
    setLoading(true);
    try {
      const r = await adminApi.login(email.trim(), password, pin);
      await setAdminToken(r.access_token);
      showToast(`Welcome, ${r.admin.email}`, "success");
      router.replace("/admin/(admin)");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Login failed";
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} testID="admin-login-back">
          <Feather name="x" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Admin</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" testID="admin-login-screen">
        <Card>
          <View style={{ alignItems: "center", marginBottom: 16 }}>
            <View style={styles.crestWrap}>
              <Feather name="lock" size={22} color={colors.brandPrimary} />
            </View>
            <Text style={styles.headline}>Members only</Text>
            <Muted style={{ marginTop: 4, textAlign: "center" }}>
              This gate is not visible to normal users. Enter admin credentials to continue.
            </Muted>
          </View>

          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="admin@example.com"
            testID="admin-email"
          />
          <View style={{ height: 12 }} />
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPass}
            placeholder="••••••••"
            testID="admin-password"
          />
          <Pressable onPress={() => setShowPass((v) => !v)} style={{ alignSelf: "flex-end", padding: 6 }}>
            <Muted style={{ fontSize: 12 }}>{showPass ? "Hide" : "Show"} password</Muted>
          </Pressable>
          <View style={{ height: 4 }} />
          <Input
            label="6-digit PIN"
            value={pin}
            onChangeText={(v) => setPin(v.replace(/\D/g, "").slice(0, 6))}
            keyboardType="number-pad"
            maxLength={6}
            placeholder="••••••"
            testID="admin-pin"
          />
          <View style={{ height: 20 }} />
          <Button title="Sign in" fullWidth loading={loading} onPress={submit} testID="admin-login-cta" />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
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
  title: { color: c.onSurface, fontSize: 18, fontWeight: "700", letterSpacing: 2 },
  crestWrap: {
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: c.brandTertiary,
    borderWidth: 1,
    borderColor: c.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  headline: { color: c.onSurface, fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
}));
