// Admin More: users list, subscriptions, payment settings, audit log, tickets, logout.
import Feather from "@react-native-vector-icons/feather";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View, Modal, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { adminApi, clearAdminToken } from "@/src/api";
import { Button, Card, Chip, Empty, Input, Muted, Skeleton } from "@/src/components/ui";
import { showToast } from "@/src/components/toast";
import { makeStyles, useTheme } from "@/src/theme";

const SECTIONS = [
  { id: "users", label: "Members" },
  { id: "subs", label: "Subscriptions" },
  { id: "settings", label: "UPI Settings" },
  { id: "audit", label: "Audit Log" },
  { id: "tickets", label: "Tickets" },
];

export default function AdminMore() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const [section, setSection] = useState<string>("users");
  const [q, setQ] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [upiId, setUpiId] = useState("");
  const [payeeName, setPayeeName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);

  const usersQ = useQuery({ queryKey: ["adminUsers", q], queryFn: () => adminApi.users(q || undefined), enabled: section === "users" });
  const subsQ = useQuery({ queryKey: ["adminSubs"], queryFn: () => adminApi.subscriptions("active"), enabled: section === "subs" });
  const auditQ = useQuery({ queryKey: ["adminAudit"], queryFn: adminApi.auditLogs, enabled: section === "audit" });
  const ticketsQ = useQuery({ queryKey: ["adminTickets"], queryFn: adminApi.tickets, enabled: section === "tickets" });
  const settingsQ = useQuery({
    queryKey: ["adminSettings"],
    queryFn: async () => {
      const s = await adminApi.getPaymentSettings();
      setUpiId(s?.upi_id ?? "");
      setPayeeName(s?.payee_name ?? "");
      setInstructions(s?.instructions ?? "");
      return s;
    },
    enabled: section === "settings",
  });

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      await adminApi.updatePaymentSettings({ upi_id: upiId, payee_name: payeeName, instructions });
      showToast("Payment settings updated", "success");
      qc.invalidateQueries({ queryKey: ["adminSettings"] });
      qc.invalidateQueries({ queryKey: ["paymentConfig"] });
    } catch (e: any) {
      showToast(e?.message ?? "Save failed", "error");
    } finally {
      setSavingSettings(false);
    }
  };

  const logout = async () => {
    await clearAdminToken();
    showToast("Logged out", "info");
    router.replace("/(tabs)");
  };

  return (
    <View style={styles.container} testID="admin-more-screen">
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View>
            <Muted style={{ fontSize: 10, letterSpacing: 4 }}>ADMIN</Muted>
            <Text style={styles.title}>More</Text>
          </View>
          <Pressable style={styles.logoutBtn} onPress={logout} testID="admin-logout">
            <Feather name="log-out" size={14} color={colors.error} />
            <Text style={styles.logoutText}>Logout</Text>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingRight: 16, paddingTop: 14 }}
          style={{ marginHorizontal: -20 }}
        >
          <View style={{ width: 20 }} />
          {SECTIONS.map((s) => {
            const active = section === s.id;
            return (
              <Pressable
                key={s.id}
                style={[styles.chip, active && { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary }]}
                onPress={() => setSection(s.id)}
                testID={`admin-sec-${s.id}`}
              >
                <Text style={[styles.chipText, active && { color: colors.onBrandTertiary }]}>{s.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={
              usersQ.isFetching || subsQ.isFetching || auditQ.isFetching || ticketsQ.isFetching || settingsQ.isFetching
            }
            onRefresh={() => qc.invalidateQueries()}
            tintColor={colors.brandPrimary}
          />
        }
      >
        {section === "users" ? (
          <View style={{ gap: 12 }}>
            <Input placeholder="Search by TOP-ID or name" value={q} onChangeText={setQ} autoCapitalize="none" testID="admin-user-search" />
            {usersQ.isLoading ? (
              <Skeleton height={70} />
            ) : (usersQ.data ?? []).length === 0 ? (
              <Empty title="No members" />
            ) : (
              (usersQ.data ?? []).map((u: any) => (
                <Card key={u.user_id} testID={`admin-user-${u.user_id}`}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <View>
                      <Text style={styles.userId}>{u.top_one_id}</Text>
                      <Text style={styles.userName}>{u.display_name || "Anonymous"}</Text>
                      <Muted style={{ fontSize: 11 }}>Joined {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}</Muted>
                    </View>
                    {u.subscription ? (
                      <Chip label={u.subscription.plan_name.toUpperCase()} tone="brand" />
                    ) : (
                      <Chip label="NO PLAN" />
                    )}
                  </View>
                </Card>
              ))
            )}
          </View>
        ) : null}

        {section === "subs" ? (
          <View style={{ gap: 10 }}>
            {subsQ.isLoading ? (
              <Skeleton height={70} />
            ) : (subsQ.data ?? []).length === 0 ? (
              <Empty title="No active subscriptions" />
            ) : (
              (subsQ.data ?? []).map((s: any) => (
                <Card key={s.id}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <View>
                      <Text style={styles.userName}>{s.plan_name}</Text>
                      <Muted style={{ fontSize: 12 }}>User {s.user_id.slice(0, 8)}…</Muted>
                      <Muted style={{ fontSize: 11 }}>
                        Expires {s.expires_at ? new Date(s.expires_at).toLocaleDateString() : "—"}
                      </Muted>
                    </View>
                    <Chip label={s.status.toUpperCase()} tone={s.status === "active" ? "success" : "warning"} />
                  </View>
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                    <Chip label={`Open ${s.benefits_remaining.open}/${s.benefits_total.open}`} />
                    <Chip label={`Jodi ${s.benefits_remaining.jodi}/${s.benefits_total.jodi}`} />
                    {s.benefits_total.pane > 0 ? (
                      <Chip label={`Pane ${s.benefits_remaining.pane}/${s.benefits_total.pane}`} />
                    ) : null}
                  </View>
                </Card>
              ))
            )}
          </View>
        ) : null}

        {section === "settings" ? (
          <View style={{ gap: 12 }}>
            {settingsQ.isLoading ? (
              <Skeleton height={200} />
            ) : (
              <Card>
                <Muted style={{ fontSize: 10, letterSpacing: 3, marginBottom: 8 }}>UPI PAYMENT CONFIGURATION</Muted>
                <Input label="UPI ID" value={upiId} onChangeText={setUpiId} autoCapitalize="none" testID="admin-cfg-upi" />
                <View style={{ height: 10 }} />
                <Input label="Payee name" value={payeeName} onChangeText={setPayeeName} testID="admin-cfg-payee" />
                <View style={{ height: 10 }} />
                <Input
                  label="Instructions"
                  value={instructions}
                  onChangeText={setInstructions}
                  multiline
                  numberOfLines={5}
                  style={{ minHeight: 120, textAlignVertical: "top" }}
                  testID="admin-cfg-instr"
                />
                <View style={{ height: 14 }} />
                <Button title="Save settings" fullWidth loading={savingSettings} onPress={saveSettings} testID="admin-cfg-save" />
              </Card>
            )}
          </View>
        ) : null}

        {section === "audit" ? (
          <View style={{ gap: 8 }}>
            {auditQ.isLoading ? (
              <Skeleton height={60} />
            ) : (auditQ.data ?? []).length === 0 ? (
              <Empty title="No activity yet" />
            ) : (
              (auditQ.data ?? []).map((a: any) => (
                <Card key={a.id} testID={`admin-audit-${a.id}`}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={styles.userName}>{a.action}</Text>
                    <Muted style={{ fontSize: 11 }}>
                      {a.created_at ? new Date(a.created_at).toLocaleString() : "—"}
                    </Muted>
                  </View>
                  <Muted style={{ fontSize: 12, marginTop: 2 }}>
                    {a.actor} → {a.target || "system"}
                  </Muted>
                </Card>
              ))
            )}
          </View>
        ) : null}

        {section === "tickets" ? (
          <View style={{ gap: 10 }}>
            {ticketsQ.isLoading ? (
              <Skeleton height={80} />
            ) : (ticketsQ.data ?? []).length === 0 ? (
              <Empty title="No tickets" />
            ) : (
              (ticketsQ.data ?? []).map((t: any) => (
                <Card key={t.id}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={styles.userName}>{t.subject}</Text>
                    <Chip label={t.status.toUpperCase()} tone="brand" />
                  </View>
                  <Muted style={{ fontSize: 12, marginTop: 4 }}>{t.message}</Muted>
                  <Muted style={{ fontSize: 11, marginTop: 4 }}>
                    {t.top_one_id} · {t.category} · {new Date(t.created_at).toLocaleString()}
                  </Muted>
                </Card>
              ))
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.surface },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    borderBottomWidth: 0.5,
    borderColor: c.divider,
  },
  title: { color: c.onSurface, fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.error,
  },
  logoutText: { color: c.error, fontSize: 12, fontWeight: "700" },
  chip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  chipText: { color: c.onSurfaceSecondary, fontSize: 12, fontWeight: "700" },
  userId: { color: c.brandPrimary, fontSize: 14, fontWeight: "800", letterSpacing: 1.5 },
  userName: { color: c.onSurface, fontSize: 15, fontWeight: "700" },
}));
