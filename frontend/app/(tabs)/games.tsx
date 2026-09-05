// Games tab: list of the three games with full-width cards, latest result, schedule.
import Feather from "@react-native-vector-icons/feather";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { Card, Chip, Empty, Muted, SectionHeader, Skeleton } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

export default function GamesTab() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const q = useQuery({ queryKey: ["games"], queryFn: api.games });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={q.refetch} tintColor={colors.brandPrimary} />}
      testID="games-screen"
    >
      <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
        <Text style={styles.big}>Games</Text>
        <Muted style={{ marginTop: 4 }}>Three flagship games. Results published by the club team.</Muted>
      </View>

      <View style={{ paddingHorizontal: 20, gap: 14 }}>
        {q.isLoading ? (
          <>
            <Skeleton height={180} />
            <Skeleton height={180} />
            <Skeleton height={180} />
          </>
        ) : (q.data ?? []).length === 0 ? (
          <Empty title="No games available" message="Games are being configured by the team." />
        ) : (
          (q.data ?? []).map((g) => (
            <Pressable
              key={g.id}
              onPress={() => router.push(`/game/${g.id}` as any)}
              style={styles.card}
              testID={`games-card-${g.id}`}
              accessibilityRole="button"
            >
              <View style={styles.headerRow}>
                <Text style={styles.name}>{g.name}</Text>
                <Chip
                  label={g.status === "active" ? "LIVE" : "PAUSED"}
                  tone={g.status === "active" ? "success" : "warning"}
                />
              </View>
              <Muted style={{ marginTop: 6 }}>{g.description}</Muted>

              <View style={styles.resultBox}>
                <Text style={styles.result}>
                  {g.latest_result?.jodi ?? g.latest_result?.open_pana ?? g.latest_result?.close_pana ?? "—"}
                </Text>
                <Muted style={{ fontSize: 11, letterSpacing: 2 }}>LATEST RESULT</Muted>
              </View>

              <View style={styles.footer}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Feather name="clock" size={12} color={colors.muted} />
                  <Muted style={{ fontSize: 12 }}>
                    {g.open_time} – {g.close_time} · {g.schedule_note}
                  </Muted>
                </View>
                <Feather name="chevron-right" size={18} color={colors.muted} />
              </View>
            </Pressable>
          ))
        )}
      </View>

      <View style={{ padding: 24 }}>
        <Muted style={{ textAlign: "center", fontSize: 12 }}>
          Results are for informational purposes only. Play responsibly and follow local laws.
        </Muted>
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.surface },
  big: { color: c.onSurface, fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  card: {
    padding: 20,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceSecondary,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { color: c.onSurface, fontSize: 20, fontWeight: "800", letterSpacing: 2 },
  resultBox: {
    marginTop: 16,
    paddingVertical: 20,
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.brandTertiary,
  },
  result: { color: c.brandPrimary, fontSize: 34, fontWeight: "800", letterSpacing: 3 },
  footer: {
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
}));
