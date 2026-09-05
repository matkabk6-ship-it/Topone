// Admin dashboard — stat cards.
import Feather from "@react-native-vector-icons/feather";
import { useQuery } from "@tanstack/react-query";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { adminApi } from "@/src/api";
import { Card, Muted, Skeleton } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

type IconName = React.ComponentProps<typeof Feather>["name"];

export default function AdminDashboard() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const q = useQuery({ queryKey: ["adminStats"], queryFn: adminApi.stats });

  const cards: { label: string; value: number; icon: IconName; tone?: string }[] = q.data
    ? [
        { label: "Members", value: q.data.users, icon: "users" },
        { label: "Pending payments", value: q.data.pending_payments, icon: "clock" },
        { label: "Verified payments", value: q.data.verified_payments, icon: "check-circle" },
        { label: "Active subs", value: q.data.active_subscriptions, icon: "star" },
        { label: "Published results", value: q.data.published_results, icon: "trending-up" },
        { label: "Games", value: q.data.games, icon: "grid" },
      ]
    : [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={q.refetch} tintColor={colors.brandPrimary} />}
      testID="admin-dashboard"
    >
      <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
        <Muted style={{ fontSize: 10, letterSpacing: 4 }}>ADMIN</Muted>
        <Text style={styles.title}>Dashboard</Text>
      </View>

      <View style={styles.grid}>
        {q.isLoading ? (
          <>
            <Skeleton height={120} style={{ width: "47%" }} />
            <Skeleton height={120} style={{ width: "47%" }} />
            <Skeleton height={120} style={{ width: "47%" }} />
            <Skeleton height={120} style={{ width: "47%" }} />
          </>
        ) : (
          cards.map((c) => (
            <Card key={c.label} style={styles.tile} testID={`admin-stat-${c.icon}`}>
              <View style={styles.iconWrap}>
                <Feather name={c.icon} size={16} color={colors.brandPrimary} />
              </View>
              <Text style={styles.value}>{c.value}</Text>
              <Muted style={{ fontSize: 11, letterSpacing: 1 }}>{c.label.toUpperCase()}</Muted>
            </Card>
          ))
        )}
      </View>

      <View style={{ padding: 20 }}>
        <Muted style={{ fontSize: 12, textAlign: "center" }}>
          All administrative actions are logged. Use the More tab for users, audit logs and payment settings.
        </Muted>
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.surface },
  title: { color: c.onSurface, fontSize: 28, fontWeight: "800", letterSpacing: -0.5, marginTop: 4 },
  grid: {
    paddingHorizontal: 20,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  tile: { width: "47.5%", gap: 8, alignItems: "flex-start" },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: c.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  value: { color: c.onSurface, fontSize: 28, fontWeight: "800" },
}));
