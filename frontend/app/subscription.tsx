// Subscription page: two plan cards + comparison table.
import Feather from "@react-native-vector-icons/feather";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { Card, Chip, Muted, Skeleton } from "@/src/components/ui";
import { useSubscriptionQuery } from "@/src/session";
import { makeStyles, useTheme } from "@/src/theme";

export default function Subscription() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const plansQ = useQuery({ queryKey: ["plans"], queryFn: api.plans });
  const subQ = useSubscriptionQuery();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40 }}
      testID="subscription-screen"
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} testID="sub-back">
          <Feather name="chevron-left" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Subscription</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={{ paddingHorizontal: 20, gap: 14, marginTop: 8 }}>
        {subQ.data ? (
          <Card style={{ borderColor: colors.success }} testID="sub-active">
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <View>
                <Muted style={{ fontSize: 10, letterSpacing: 3 }}>ACTIVE</Muted>
                <Text style={styles.planTitle}>{subQ.data.plan_name}</Text>
                <Muted>
                  Expires{" "}
                  {subQ.data.expires_at ? new Date(subQ.data.expires_at).toLocaleDateString() : "—"}
                </Muted>
              </View>
              <Chip label="ACTIVE" tone="success" />
            </View>
          </Card>
        ) : null}

        {plansQ.isLoading ? (
          <>
            <Skeleton height={220} />
            <Skeleton height={260} />
          </>
        ) : (
          (plansQ.data ?? []).map((p) => (
            <View
              key={p.id}
              style={[
                styles.planCard,
                p.id === "pro" && { borderColor: colors.brandPrimary, borderWidth: 1.5 },
              ]}
              testID={`plan-${p.id}`}
            >
              <View style={styles.planHeader}>
                <View>
                  <Text style={styles.planName}>{p.name.toUpperCase()}</Text>
                  <Muted style={{ fontSize: 11, letterSpacing: 2, marginTop: 2 }}>
                    {p.duration_days} DAY ACCESS
                  </Muted>
                </View>
                {p.id === "pro" ? <Chip label="RECOMMENDED" tone="brand" /> : null}
              </View>

              <View style={{ flexDirection: "row", alignItems: "baseline", marginTop: 12 }}>
                <Text style={styles.currency}>₹</Text>
                <Text style={styles.price}>{p.price}</Text>
                <Muted style={{ marginLeft: 6 }}>one-time</Muted>
              </View>

              <View style={{ height: 12 }} />
              {p.benefits.open > 0 ? <Benefit text={`${p.benefits.open} Open`} /> : null}
              {p.benefits.jodi > 0 ? <Benefit text={`${p.benefits.jodi} Jodi`} /> : null}
              {p.benefits.pane > 0 ? <Benefit text={`${p.benefits.pane} Pane`} /> : null}

              <View style={{ height: 16 }} />
              <Pressable
                style={[styles.cta, p.id === "pro" ? { backgroundColor: colors.brandPrimary } : { backgroundColor: colors.surface, borderColor: colors.brandPrimary, borderWidth: 1 }]}
                onPress={() => router.push(`/payment/${p.id}` as any)}
                testID={`plan-${p.id}-cta`}
                accessibilityRole="button"
              >
                <Text
                  style={[
                    styles.ctaText,
                    p.id === "pro" ? { color: colors.onBrandPrimary } : { color: colors.brandPrimary },
                  ]}
                >
                  Choose {p.name}
                </Text>
              </Pressable>
            </View>
          ))
        )}

        {/* Comparison */}
        <Card style={{ padding: 16 }} testID="sub-comparison">
          <Muted style={{ fontSize: 10, letterSpacing: 3, marginBottom: 10 }}>COMPARISON</Muted>
          <CompareRow label="Price" a="₹299" b="₹599" />
          <CompareRow label="Open" a="3" b="1" />
          <CompareRow label="Jodi" a="6" b="2" />
          <CompareRow label="Pane" a="—" b="2" />
          <CompareRow label="Duration" a="30 days" b="30 days" last />
        </Card>

        <Muted style={{ textAlign: "center", fontSize: 12, marginTop: 12 }}>
          Subscriptions are purchased manually via UPI and are never auto-renewed. Access activates only after our team verifies your payment.
        </Muted>
      </View>
    </ScrollView>
  );
}

function Benefit({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 3 }}>
      <Feather name="check" size={16} color={colors.brandPrimary} />
      <Text style={{ color: colors.onSurface, fontSize: 15 }}>{text}</Text>
    </View>
  );
}

function CompareRow({ label, a, b, last }: { label: string; a: string; b: string; last?: boolean }) {
  const styles = useStyles();
  return (
    <View style={[styles.compareRow, !last && styles.compareRowBorder]}>
      <Text style={styles.compareLabel}>{label}</Text>
      <Text style={styles.compareA}>{a}</Text>
      <Text style={styles.compareB}>{b}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.surface },
  header: {
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  title: { color: c.onSurface, fontSize: 22, fontWeight: "700" },
  planCard: {
    padding: 20,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceSecondary,
  },
  planHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  planName: { color: c.onSurface, fontSize: 20, fontWeight: "800", letterSpacing: 3 },
  planTitle: { color: c.onSurface, fontSize: 20, fontWeight: "800", marginTop: 4 },
  currency: { color: c.brandPrimary, fontSize: 22, fontWeight: "700" },
  price: { color: c.onSurface, fontSize: 40, fontWeight: "800", letterSpacing: -1 },
  cta: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  ctaText: { fontSize: 15, fontWeight: "800", letterSpacing: 1 },
  compareRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  compareRowBorder: { borderBottomWidth: 0.5, borderColor: c.divider },
  compareLabel: { flex: 1.2, color: c.muted, fontSize: 13 },
  compareA: { flex: 1, textAlign: "center", color: c.onSurface, fontSize: 14, fontWeight: "700" },
  compareB: { flex: 1, textAlign: "center", color: c.brandPrimary, fontSize: 14, fontWeight: "800" },
}));
