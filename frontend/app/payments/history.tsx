// Payment history: shows user's payment submissions and status.
import Feather from "@react-native-vector-icons/feather";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Payment, api } from "@/src/api";
import { Card, Chip, Empty, Muted, Skeleton } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

const STATUS_TONE: Record<Payment["status"], "warning" | "success" | "error" | "neutral"> = {
  pending: "warning",
  verified: "success",
  rejected: "error",
  cancelled: "neutral",
};

const STATUS_LABEL: Record<Payment["status"], string> = {
  pending: "PENDING VERIFICATION",
  verified: "PAYMENT VERIFIED",
  rejected: "PAYMENT REJECTED",
  cancelled: "CANCELLED",
};

export default function PaymentsHistory() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { highlight } = useLocalSearchParams<{ highlight?: string }>();

  const q = useQuery({ queryKey: ["myPayments"], queryFn: api.myPayments });

  return (
    <View style={styles.container} testID="payments-history-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} testID="ph-back">
          <Feather name="chevron-left" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Payment History</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={q.refetch} tintColor={colors.brandPrimary} />}
      >
        {q.isLoading ? (
          <>
            <Skeleton height={100} style={{ marginBottom: 10 }} />
            <Skeleton height={100} style={{ marginBottom: 10 }} />
            <Skeleton height={100} />
          </>
        ) : (q.data ?? []).length === 0 ? (
          <Empty
            title="No payments yet"
            message="Submit your first plan payment to see the history here."
          />
        ) : (
          <View style={{ gap: 12 }}>
            {(q.data ?? []).map((p) => {
              const isHighlight = highlight === p.id;
              return (
                <Card
                  key={p.id}
                  style={[styles.row, isHighlight && { borderColor: colors.brandPrimary }]}
                  testID={`payment-${p.id}`}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={styles.planName}>{p.plan_name}</Text>
                    <Chip label={STATUS_LABEL[p.status]} tone={STATUS_TONE[p.status]} />
                  </View>
                  <View style={{ marginTop: 8, flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                    <Text style={styles.amount}>₹{p.amount}</Text>
                    <Muted style={{ fontSize: 12 }}>{p.currency}</Muted>
                  </View>
                  <View style={{ marginTop: 10, gap: 4 }}>
                    <Row label="Reference" value={p.payment_reference} />
                    <Row label="Submitted" value={p.submitted_at ? new Date(p.submitted_at).toLocaleString() : "—"} />
                    {p.verified_at ? (
                      <Row
                        label={p.status === "verified" ? "Verified" : "Reviewed"}
                        value={new Date(p.verified_at).toLocaleString()}
                      />
                    ) : null}
                    {p.reject_reason ? (
                      <Row label="Reason" value={p.reject_reason} />
                    ) : null}
                  </View>
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.kvRow}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue} numberOfLines={1}>
        {value}
      </Text>
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
  row: {},
  planName: { color: c.onSurface, fontSize: 16, fontWeight: "800" },
  amount: { color: c.brandPrimary, fontSize: 22, fontWeight: "800" },
  kvRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  kvLabel: { color: c.muted, fontSize: 12, width: 80 },
  kvValue: { color: c.onSurfaceSecondary, fontSize: 13, flex: 1 },
}));
