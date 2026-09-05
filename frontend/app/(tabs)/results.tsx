// Results tab: filterable by game, date-grouped list.
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { Card, Empty, Muted, Skeleton } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

const CHIPS = [
  { id: "all", label: "All" },
  { id: "sridevi", label: "Sridevi" },
  { id: "kalyan", label: "Kalyan" },
  { id: "main_bazar", label: "Main Bazar" },
];

export default function ResultsTab() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const [filter, setFilter] = useState<string>("all");

  const gamesQ = useQuery({ queryKey: ["games"], queryFn: api.games });
  const resultsQ = useQuery({
    queryKey: ["results", filter],
    queryFn: () => (filter === "all" ? api.allResults(60) : api.gameResults(filter, 60)),
  });

  const grouped = useMemo(() => {
    const list = resultsQ.data ?? [];
    const map = new Map<string, typeof list>();
    list.forEach((r) => {
      const k = r.date;
      if (!map.has(k)) map.set(k, [] as any);
      map.get(k)!.push(r);
    });
    return Array.from(map.entries());
  }, [resultsQ.data]);

  const gameName = (id: string) =>
    (gamesQ.data ?? []).find((g) => g.id === id)?.name ?? id.toUpperCase();

  return (
    <View style={styles.container} testID="results-screen">
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.title}>Results</Text>
        <Muted style={{ marginTop: 2 }}>Official history published by the team.</Muted>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingRight: 16, paddingTop: 14 }}
          style={{ marginHorizontal: -20 }}
        >
          <View style={{ width: 20 }} />
          {CHIPS.map((c) => {
            const active = filter === c.id;
            return (
              <Pressable
                key={c.id}
                style={[styles.chip, active && { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary }]}
                onPress={() => setFilter(c.id)}
                testID={`results-filter-${c.id}`}
                accessibilityRole="button"
              >
                <Text style={[styles.chipText, active && { color: colors.onBrandTertiary }]}>{c.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={resultsQ.isFetching} onRefresh={resultsQ.refetch} tintColor={colors.brandPrimary} />}
      >
        {resultsQ.isLoading ? (
          <>
            <Skeleton height={80} style={{ marginBottom: 12 }} />
            <Skeleton height={80} style={{ marginBottom: 12 }} />
            <Skeleton height={80} />
          </>
        ) : grouped.length === 0 ? (
          <Empty title="No results yet" message="Once the team publishes results they'll appear here." />
        ) : (
          grouped.map(([date, rows]) => (
            <View key={date} style={{ marginBottom: 20 }}>
              <Text style={styles.date}>{new Date(date).toDateString()}</Text>
              <View style={{ gap: 8, marginTop: 8 }}>
                {rows.map((r) => (
                  <Card key={r.id} style={styles.row} testID={`result-${r.id}`}>
                    <View>
                      <Text style={styles.gameName}>{gameName(r.game_id)}</Text>
                      <Muted style={{ fontSize: 12 }}>{r.session.toUpperCase()}</Muted>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={styles.big}>{r.jodi ?? r.open_pana ?? r.close_pana ?? "—"}</Text>
                      {r.open_pana && r.close_pana ? (
                        <Muted style={{ fontSize: 11 }}>{r.open_pana} · {r.close_pana}</Muted>
                      ) : null}
                    </View>
                  </Card>
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: 20, paddingBottom: 8, borderBottomWidth: 0.5, borderColor: c.divider },
  title: { color: c.onSurface, fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  chip: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    backgroundColor: c.surfaceSecondary,
  },
  chipText: { color: c.onSurfaceSecondary, fontSize: 13, fontWeight: "600" },
  date: { color: c.muted, fontSize: 12, letterSpacing: 2, fontWeight: "700" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  gameName: { color: c.onSurface, fontSize: 15, fontWeight: "700" },
  big: { color: c.brandPrimary, fontSize: 22, fontWeight: "800", letterSpacing: 2 },
}));
