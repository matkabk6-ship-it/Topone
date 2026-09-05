// Admin payments: list + verify/reject actions.
import Feather from "@react-native-vector-icons/feather";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Payment, adminApi } from "@/src/api";
import { Button, Card, Chip, Empty, Input, Muted, Skeleton } from "@/src/components/ui";
import { showToast } from "@/src/components/toast";
import { makeStyles, useTheme } from "@/src/theme";

const FILTERS = [
  { id: "pending", label: "Pending" },
  { id: "verified", label: "Verified" },
  { id: "rejected", label: "Rejected" },
  { id: "all", label: "All" },
];

export default function AdminPayments() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>("pending");
  const [rejecting, setRejecting] = useState<Payment | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["adminPayments", filter],
    queryFn: () => adminApi.payments(filter === "all" ? undefined : filter),
  });

  const doAction = async (p: Payment, action: "verify" | "reject", why?: string) => {
    setBusy(p.id);
    try {
      await adminApi.verifyPayment(p.id, action, why);
      showToast(action === "verify" ? "Payment verified & subscription activated" : "Payment rejected", "success");
      qc.invalidateQueries({ queryKey: ["adminPayments"] });
      qc.invalidateQueries({ queryKey: ["adminStats"] });
    } catch (e: any) {
      showToast(e?.message ?? "Action failed", "error");
    } finally {
      setBusy(null);
      setRejecting(null);
      setReason("");
    }
  };

  return (
    <View style={styles.container} testID="admin-payments-screen">
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Muted style={{ fontSize: 10, letterSpacing: 4 }}>ADMIN</Muted>
        <Text style={styles.title}>Payments</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingRight: 16, paddingTop: 12 }}
          style={{ marginHorizontal: -20 }}
        >
          <View style={{ width: 20 }} />
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <Pressable
                key={f.id}
                style={[styles.chip, active && { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary }]}
                onPress={() => setFilter(f.id)}
                testID={`admin-pay-filter-${f.id}`}
              >
                <Text style={[styles.chipText, active && { color: colors.onBrandTertiary }]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={q.refetch} tintColor={colors.brandPrimary} />}
      >
        {q.isLoading ? (
          <>
            <Skeleton height={140} style={{ marginBottom: 10 }} />
            <Skeleton height={140} />
          </>
        ) : (q.data ?? []).length === 0 ? (
          <Empty title="No payments in this view" />
        ) : (
          <View style={{ gap: 12 }}>
            {(q.data ?? []).map((p) => (
              <Card key={p.id} testID={`admin-payment-${p.id}`}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={styles.userId}>{p.top_one_id}</Text>
                  <Chip
                    label={p.status.toUpperCase()}
                    tone={
                      p.status === "pending"
                        ? "warning"
                        : p.status === "verified"
                          ? "success"
                          : p.status === "rejected"
                            ? "error"
                            : "neutral"
                    }
                  />
                </View>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 6 }}>
                  <Text style={styles.plan}>{p.plan_name}</Text>
                  <Text style={styles.amount}>₹{p.amount}</Text>
                </View>
                <Muted style={{ fontSize: 13, marginTop: 4 }}>
                  Ref: <Text style={{ color: colors.onSurface }}>{p.payment_reference}</Text>
                </Muted>
                {p.payer_name ? <Muted style={{ fontSize: 12 }}>Payer: {p.payer_name}</Muted> : null}
                {p.note ? <Muted style={{ fontSize: 12 }}>Note: {p.note}</Muted> : null}
                <Muted style={{ fontSize: 11, marginTop: 6 }}>
                  Submitted {p.submitted_at ? new Date(p.submitted_at).toLocaleString() : "—"}
                </Muted>

                {p.status === "pending" ? (
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Button
                        title="Verify"
                        onPress={() => doAction(p, "verify")}
                        loading={busy === p.id}
                        variant="primary"
                        leftIcon={<Feather name="check" size={16} color={colors.onBrandPrimary} />}
                        testID={`admin-pay-verify-${p.id}`}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button
                        title="Reject"
                        variant="outline"
                        onPress={() => setRejecting(p)}
                        leftIcon={<Feather name="x" size={16} color={colors.brandPrimary} />}
                        testID={`admin-pay-reject-${p.id}`}
                      />
                    </View>
                  </View>
                ) : null}
                {p.reject_reason ? <Muted style={{ marginTop: 8 }}>Reason: {p.reject_reason}</Muted> : null}
              </Card>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Reject modal */}
      <Modal transparent animationType="fade" visible={!!rejecting} onRequestClose={() => setRejecting(null)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.modalCard} testID="admin-reject-modal">
            <Text style={styles.modalTitle}>Reject payment</Text>
            <Muted style={{ fontSize: 13, marginTop: 4 }}>
              Provide a short reason. The user will see this in their history and receive a notification.
            </Muted>
            <View style={{ height: 12 }} />
            <Input
              placeholder="Reason (optional)"
              value={reason}
              onChangeText={setReason}
              multiline
              numberOfLines={3}
              style={{ minHeight: 90, textAlignVertical: "top" }}
              testID="admin-reject-reason"
            />
            <View style={{ height: 12 }} />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button title="Cancel" variant="outline" onPress={() => setRejecting(null)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  title="Reject"
                  onPress={() => rejecting && doAction(rejecting, "reject", reason)}
                  loading={busy === rejecting?.id}
                  testID="admin-reject-confirm"
                />
              </View>
            </View>
          </View>
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
    borderBottomWidth: 0.5,
    borderColor: c.divider,
  },
  title: { color: c.onSurface, fontSize: 28, fontWeight: "800", letterSpacing: -0.5, marginTop: 4 },
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
  plan: { color: c.onSurface, fontSize: 16, fontWeight: "700" },
  amount: { color: c.brandPrimary, fontSize: 18, fontWeight: "800" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: c.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: c.border,
  },
  modalTitle: { color: c.onSurface, fontSize: 18, fontWeight: "800" },
}));
