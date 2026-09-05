// Game detail: header, current-live status, latest result, history.
import Feather from "@react-native-vector-icons/feather";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { Card, Chip, Empty, Muted, Skeleton } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

export default function GameDetail() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const gameQ = useQuery({ queryKey: ["game", id], queryFn: () => api.game(id!), enabled: !!id });
  const historyQ = useQuery({ queryKey: ["gameResults", id], queryFn: () => api.gameResults(id!, 30), enabled: !!id });

  const g = gameQ.data;

  return (
    <View style={styles.container} testID="game-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} testID="game-back">
          <Feather name="chevron-left" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{g?.name ?? "Game"}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={gameQ.isFetching || historyQ.isFetching}
            onRefresh={() => {
              gameQ.refetch();
              historyQ.refetch();
            }}
            tintColor={colors.brandPrimary}
          />
        }
      >
        {gameQ.isLoading || !g ? (
          <Skeleton height={200} />
        ) : (
          <>
            <Card>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={styles.name}>{g.name}</Text>
                <Chip label={g.status === "active" ? "LIVE" : "PAUSED"} tone={g.status === "active" ? "success" : "warning"} />
              </View>
              <Muted style={{ marginTop: 6 }}>{g.description}</Muted>
              <View style={styles.metaRow}>
                <View style={styles.metaItem}>
                  <Feather name="clock" size={14} color={colors.brandPrimary} />
                  <Muted style={{ fontSize: 12 }}>
                    {g.open_time} – {g.close_time}
                  </Muted>
                </View>
                <View style={styles.metaItem}>
                  <Feather name="calendar" size={14} color={colors.brandPrimary} />
                  <Muted style={{ fontSize: 12 }}>{g.schedule_note}</Muted>
                </View>
              </View>

              <View style={styles.latestBox}>
                <Muted style={{ fontSize: 10, letterSpacing: 3 }}>LATEST RESULT</Muted>
                <Text style={styles.latestNumber}>
                  {g.latest_result?.jodi ?? g.latest_result?.open_pana ?? g.latest_result?.close_pana ?? "—"}
                </Text>
                {g.latest_result ? (
                  <Muted style={{ fontSize: 12 }}>
                    {g.latest_result.date} · {g.latest_result.session}
                  </Muted>
                ) : null}
              </View>
            </Card>

            <View style={{ height: 16 }} />
            <Text style={styles.sectionTitle}>History</Text>
            <View style={{ height: 8 }} />
            {historyQ.isLoading ? (
              <Skeleton height={70} />
            ) : (historyQ.data ?? []).length === 0 ? (
              <Empty title="No history yet" message="History will appear after results are published." />
            ) : (
              <View style={{ gap: 8 }}>
                {(historyQ.data ?? []).map((r) => (
                  <Card key={r.id} style={styles.historyRow}>
                    <View>
                      <Text style={styles.historyDate}>{r.date}</Text>
                      <Muted style={{ fontSize: 11 }}>{r.session.toUpperCase()}</Muted>
                    </View>
                    <Text style={styles.historyValue}>
                      {r.jodi ?? r.open_pana ?? r.close_pana ?? "—"}
                    </Text>
                  </Card>
                ))}
              </View>
            )}
          </>
        )}
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
  title: { color: c.onSurface, fontSize: 20, fontWeight: "700", letterSpacing: 1 },
  name: { color: c.onSurface, fontSize: 22, fontWeight: "800", letterSpacing: 2 },
  metaRow: { flexDirection: "row", gap: 20, marginTop: 12 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  latestBox: {
    marginTop: 20,
    paddingVertical: 24,
    borderRadius: 16,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.brandTertiary,
    alignItems: "center",
  },
  latestNumber: {
    color: c.brandPrimary,
    fontSize: 44,
    fontWeight: "800",
    letterSpacing: 5,
    marginVertical: 6,
  },
  sectionTitle: { color: c.onSurface, fontSize: 16, fontWeight: "700" },
  historyRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  historyDate: { color: c.onSurface, fontSize: 14, fontWeight: "600" },
  historyValue: { color: c.brandPrimary, fontSize: 20, fontWeight: "800", letterSpacing: 2 },
}));
