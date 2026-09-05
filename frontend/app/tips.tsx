// Private Tips channel for active subscribers. Base users see base/both tips;
// Pro users see pro/both tips. Non-subscribers see an upgrade CTA.
import Feather from "@react-native-vector-icons/feather";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { Card, Chip, Muted, Skeleton } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

const GAME_NAME: Record<string, string> = {
  sridevi: "SRIDEVI",
  kalyan: "KALYAN",
  main_bazar: "MAIN BAZAR",
};

export default function TipsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const q = useQuery({ queryKey: ["tips"], queryFn: api.tips });

  const plan = q.data?.plan;
  const tips = q.data?.tips ?? [];

  return (
    <View style={styles.container} testID="tips-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} testID="tips-back">
          <Feather name="chevron-left" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>My Tips</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={q.refetch} tintColor={colors.brandPrimary} />}
      >
        {q.isLoading ? (
          <>
            <Skeleton height={100} style={{ marginBottom: 12 }} />
            <Skeleton height={100} />
          </>
        ) : !plan ? (
          <Card testID="tips-empty-nosub">
            <View style={{ alignItems: "center", padding: 12 }}>
              <View style={styles.lockWrap}>
                <Feather name="lock" size={22} color={colors.brandPrimary} />
              </View>
              <Text style={styles.emptyTitle}>Tips are members only</Text>
              <Muted style={{ textAlign: "center", marginTop: 6 }}>
                Subscribe to Base or Pro to receive private predictions curated by our team.
              </Muted>
              <View style={{ height: 16 }} />
              <Pressable
                onPress={() => router.push("/subscription")}
                style={styles.upgradeBtn}
                testID="tips-upgrade-cta"
              >
                <Text style={styles.upgradeText}>See plans</Text>
              </Pressable>
            </View>
          </Card>
        ) : tips.length === 0 ? (
          <Card testID="tips-empty">
            <View style={{ alignItems: "center", padding: 12 }}>
              <View style={styles.lockWrap}>
                <Feather name="mail" size={22} color={colors.brandPrimary} />
              </View>
              <Text style={styles.emptyTitle}>No tips yet</Text>
              <Muted style={{ textAlign: "center", marginTop: 6 }}>
                As soon as our team sends a new tip for your {plan.toUpperCase()} plan, it will show up here.
              </Muted>
            </View>
          </Card>
        ) : (
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
              <Chip label={`${plan.toUpperCase()} CHANNEL`} tone="brand" />
              <View style={{ width: 8 }} />
              <Muted style={{ fontSize: 11 }}>{tips.length} tips</Muted>
            </View>
            {tips.map((t) => (
              <Card key={t.id} testID={`tip-${t.id}`}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View style={styles.gameRow}>
                    <Text style={styles.gameName}>{GAME_NAME[t.game_id] ?? t.game_id.toUpperCase()}</Text>
                    {t.session ? <Chip label={t.session.toUpperCase()} /> : null}
                  </View>
                  <Chip label={t.tip_type.toUpperCase()} tone="brand" />
                </View>
                <View style={styles.valueRow}>
                  <Text style={styles.value}>{t.value}</Text>
                  {t.for_date ? <Muted style={{ fontSize: 12 }}>for {t.for_date}</Muted> : null}
                </View>
                {t.note ? <Muted style={{ fontSize: 13, marginTop: 8 }}>{t.note}</Muted> : null}
                <Muted style={{ fontSize: 11, marginTop: 10 }}>
                  Sent {t.created_at ? new Date(t.created_at).toLocaleString() : ""}
                </Muted>
              </Card>
            ))}
          </View>
        )}

        <Muted style={{ fontSize: 11, textAlign: "center", marginTop: 20 }}>
          Tips are informational only. No outcome is guaranteed. Play responsibly.
        </Muted>
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
  title: { color: c.onSurface, fontSize: 22, fontWeight: "700" },
  lockWrap: {
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: c.brandTertiary,
    borderWidth: 1,
    borderColor: c.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  emptyTitle: { color: c.onSurface, fontSize: 18, fontWeight: "700" },
  upgradeBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 999,
    backgroundColor: c.brandPrimary,
  },
  upgradeText: { color: c.onBrandPrimary, fontWeight: "800", fontSize: 14, letterSpacing: 0.5 },
  gameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  gameName: { color: c.onSurface, fontSize: 15, fontWeight: "800", letterSpacing: 1.5 },
  valueRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  value: { color: c.brandPrimary, fontSize: 34, fontWeight: "800", letterSpacing: 3 },
}));
