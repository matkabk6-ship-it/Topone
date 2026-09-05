// Notifications tab: list with unread indicator, mark all read.
import Feather from "@react-native-vector-icons/feather";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { Card, Empty, Muted, Skeleton } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

const TYPE_ICON: Record<string, React.ComponentProps<typeof Feather>["name"]> = {
  result_new: "trending-up",
  tip_new: "star",
  payment_submitted: "clock",
  payment_verified: "check-circle",
  payment_rejected: "x-circle",
  subscription_activated: "star",
  subscription_expired: "alert-circle",
  system: "bell",
  announcement: "volume-2",
};

export default function NotificationsTab() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const q = useQuery({ queryKey: ["notifications"], queryFn: api.notifications });

  const markAll = async () => {
    await api.markAllRead();
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const markOne = async (id: string) => {
    await api.markRead(id);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const items = q.data ?? [];
  const unread = items.filter((n) => !n.read).length;

  return (
    <View style={styles.container} testID="notifications-screen">
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View>
            <Text style={styles.title}>Alerts</Text>
            <Muted style={{ marginTop: 2 }}>{unread} unread</Muted>
          </View>
          {items.length > 0 ? (
            <Pressable style={styles.markAllBtn} onPress={markAll} testID="notif-mark-all">
              <Feather name="check" size={14} color={colors.brandPrimary} />
              <Text style={styles.markAllText}>Mark all read</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={q.refetch} tintColor={colors.brandPrimary} />}
      >
        {q.isLoading ? (
          <>
            <Skeleton height={70} style={{ marginBottom: 10 }} />
            <Skeleton height={70} style={{ marginBottom: 10 }} />
            <Skeleton height={70} />
          </>
        ) : items.length === 0 ? (
          <Empty title="All caught up." message="You have no notifications right now." />
        ) : (
          <View style={{ gap: 10 }}>
            {items.map((n) => (
              <Pressable
                key={n.id}
                onPress={() => !n.read && markOne(n.id)}
                testID={`notif-${n.id}`}
                accessibilityRole="button"
              >
                <Card style={[styles.row, !n.read && styles.rowUnread]}>
                  <View style={styles.iconWrap}>
                    <Feather
                      name={TYPE_ICON[n.type] ?? "bell"}
                      size={18}
                      color={n.read ? colors.muted : colors.brandPrimary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.rowHeader}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {n.title}
                      </Text>
                      {!n.read ? <View style={styles.unreadDot} /> : null}
                    </View>
                    <Muted style={{ fontSize: 13, marginTop: 2 }} numberOfLines={2}>
                      {n.message}
                    </Muted>
                    <Muted style={{ fontSize: 11, marginTop: 6 }}>
                      {n.created_at ? new Date(n.created_at).toLocaleString() : ""}
                    </Muted>
                  </View>
                </Card>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
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
  title: { color: c.onSurface, fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  markAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.brandPrimary,
  },
  markAllText: { color: c.brandPrimary, fontSize: 12, fontWeight: "700" },
  row: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  rowUnread: { backgroundColor: c.brandTertiary, borderColor: c.brandPrimary },
  rowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowTitle: { color: c.onSurface, fontSize: 15, fontWeight: "700", flex: 1, paddingRight: 8 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: c.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: c.brandPrimary,
  },
}));
