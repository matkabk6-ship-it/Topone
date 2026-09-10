// Admin — Plans editor: name, price, days, benefits, tagline, active.
import Feather from "@react-native-vector-icons/feather";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Plan, adminApi } from "@/src/api";
import { Button, Card, Chip, Input, Muted, Skeleton } from "@/src/components/ui";
import { showToast } from "@/src/components/toast";
import { makeStyles, useTheme } from "@/src/theme";

export default function AdminPlans() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const router = useRouter();

  const q = useQuery({ queryKey: ["adminPlans"], queryFn: adminApi.plans });
  const [editing, setEditing] = useState<Plan | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [days, setDays] = useState("");
  const [tagline, setTagline] = useState("");
  const [open, setOpen] = useState("0");
  const [jodi, setJodi] = useState("0");
  const [pane, setPane] = useState("0");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) return;
    setName(editing.name);
    setPrice(String(editing.price ?? 0));
    setDays(String(editing.duration_days ?? 30));
    setTagline(editing.tagline ?? "");
    setOpen(String(editing.benefits?.open ?? 0));
    setJodi(String(editing.benefits?.jodi ?? 0));
    setPane(String(editing.benefits?.pane ?? 0));
    setActive(editing.active !== false);
  }, [editing]);

  const submit = async () => {
    if (!editing) return;
    if (!name.trim()) return showToast("Name is required", "warning");
    setSaving(true);
    try {
      const auto = [
        Number(open) > 0 ? `${open} Open` : null,
        Number(jodi) > 0 ? `${jodi} Jodi` : null,
        Number(pane) > 0 ? `${pane} Pane` : null,
      ]
        .filter(Boolean)
        .join(", ");
      await adminApi.updatePlan(editing.id, {
        name: name.trim(),
        price: Math.max(0, Number(price) || 0),
        duration_days: Math.max(1, Number(days) || 30),
        benefits: {
          open: Math.max(0, Number(open) || 0),
          jodi: Math.max(0, Number(jodi) || 0),
          pane: Math.max(0, Number(pane) || 0),
        },
        tagline: tagline.trim() || auto,
        active,
      });
      showToast("Plan updated", "success");
      qc.invalidateQueries();
      setEditing(null);
    } catch (e: any) {
      showToast(e?.message ?? "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container} testID="admin-plans-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} testID="admin-plans-back">
          <Feather name="chevron-left" size={24} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Muted style={{ fontSize: 10, letterSpacing: 4 }}>ADMIN</Muted>
          <Text style={styles.title}>Plans</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={q.refetch} tintColor={colors.brandPrimary} />}
      >
        <Muted style={{ fontSize: 12, marginBottom: 12 }}>
          Edits apply to future purchases. Existing active subscriptions keep the benefits they were sold.
        </Muted>

        {q.isLoading ? (
          <>
            <Skeleton height={160} style={{ marginBottom: 12 }} />
            <Skeleton height={160} />
          </>
        ) : (
          <View style={{ gap: 14 }}>
            {(q.data ?? []).map((p) => (
              <Card key={p.id} testID={`admin-plan-${p.id}`}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View>
                    <Text style={styles.planName}>{p.name}</Text>
                    <Muted style={{ fontSize: 11, letterSpacing: 2 }}>{p.id.toUpperCase()}</Muted>
                  </View>
                  <Chip
                    label={p.active ? "ACTIVE" : "HIDDEN"}
                    tone={p.active ? "success" : "warning"}
                  />
                </View>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 6 }}>
                  <Text style={styles.price}>₹{p.price}</Text>
                  <Muted style={{ fontSize: 12 }}>· {p.duration_days} day{p.duration_days === 1 ? "" : "s"}</Muted>
                </View>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  {p.benefits.open > 0 ? <Chip label={`${p.benefits.open} Open`} tone="brand" /> : null}
                  {p.benefits.jodi > 0 ? <Chip label={`${p.benefits.jodi} Jodi`} tone="brand" /> : null}
                  {p.benefits.pane > 0 ? <Chip label={`${p.benefits.pane} Pane`} tone="brand" /> : null}
                </View>
                {p.tagline ? <Muted style={{ fontSize: 12, marginTop: 10 }}>{p.tagline}</Muted> : null}
                <View style={{ height: 12 }} />
                <Pressable
                  style={styles.editBtn}
                  onPress={() => setEditing(p)}
                  testID={`admin-plan-edit-${p.id}`}
                >
                  <Feather name="edit-2" size={14} color={colors.brandPrimary} />
                  <Text style={styles.editText}>Edit plan</Text>
                </Pressable>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal transparent animationType="fade" visible={!!editing} onRequestClose={() => setEditing(null)}>
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={styles.formWrap} keyboardShouldPersistTaps="handled">
            <View style={styles.formCard}>
              <Text style={styles.modalTitle}>Edit {editing?.id.toUpperCase()} plan</Text>
              <View style={{ height: 12 }} />

              <Input label="Plan name" value={name} onChangeText={setName} maxLength={64} testID="admin-plan-name" />
              <View style={{ height: 10 }} />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Price (₹)"
                    value={price}
                    onChangeText={(v) => setPrice(v.replace(/\D/g, "").slice(0, 7))}
                    keyboardType="number-pad"
                    testID="admin-plan-price"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Duration (days)"
                    value={days}
                    onChangeText={(v) => setDays(v.replace(/\D/g, "").slice(0, 4))}
                    keyboardType="number-pad"
                    testID="admin-plan-days"
                  />
                </View>
              </View>
              <View style={{ height: 14 }} />

              <Muted style={styles.label}>BENEFITS PER PURCHASE</Muted>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
                <View style={{ flex: 1 }}>
                  <Input label="Open" value={open} onChangeText={(v) => setOpen(v.replace(/\D/g, "").slice(0, 3))} keyboardType="number-pad" testID="admin-plan-open" />
                </View>
                <View style={{ flex: 1 }}>
                  <Input label="Jodi" value={jodi} onChangeText={(v) => setJodi(v.replace(/\D/g, "").slice(0, 3))} keyboardType="number-pad" testID="admin-plan-jodi" />
                </View>
                <View style={{ flex: 1 }}>
                  <Input label="Pane" value={pane} onChangeText={(v) => setPane(v.replace(/\D/g, "").slice(0, 3))} keyboardType="number-pad" testID="admin-plan-pane" />
                </View>
              </View>
              <View style={{ height: 12 }} />

              <Input
                label="Tagline"
                value={tagline}
                onChangeText={setTagline}
                placeholder="Auto-filled from benefits if empty"
                maxLength={140}
                testID="admin-plan-tagline"
              />
              <View style={{ height: 14 }} />

              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Show to members</Text>
                  <Muted style={{ fontSize: 12 }}>Off hides this plan from the Subscription page.</Muted>
                </View>
                <Switch value={active} onValueChange={setActive} testID="admin-plan-active" />
              </View>

              <View style={{ height: 20 }} />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}><Button title="Cancel" variant="outline" onPress={() => setEditing(null)} /></View>
                <View style={{ flex: 1 }}><Button title="Save" onPress={submit} loading={saving} testID="admin-plan-save" /></View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.surface },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 0.5,
    borderColor: c.divider,
  },
  title: { color: c.onSurface, fontSize: 20, fontWeight: "800" },
  planName: { color: c.onSurface, fontSize: 18, fontWeight: "800", letterSpacing: 1 },
  price: { color: c.brandPrimary, fontSize: 24, fontWeight: "800" },
  editBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.brandPrimary,
  },
  editText: { color: c.brandPrimary, fontSize: 12, fontWeight: "700" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  formWrap: { padding: 20, justifyContent: "center", flexGrow: 1 },
  formCard: {
    backgroundColor: c.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: c.border,
  },
  modalTitle: { color: c.onSurface, fontSize: 18, fontWeight: "800" },
  label: { fontSize: 10, letterSpacing: 3 },
  switchRow: { flexDirection: "row", alignItems: "center", paddingVertical: 4 },
  rowTitle: { color: c.onSurface, fontSize: 15, fontWeight: "700" },
}));
