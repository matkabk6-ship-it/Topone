// Home dashboard: ID card, subscription summary, quick actions, live games,
// recent results, announcements banner.
import Feather from "@react-native-vector-icons/feather";
import { useQuery } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { Card, Chip, GlassPane, Muted, SectionHeader, Skeleton } from "@/src/components/ui";
import { showToast } from "@/src/components/toast";
import { useSession, useSubscriptionQuery } from "@/src/session";
import { makeStyles, useTheme } from "@/src/theme";

const CARD_TEXTURE =
  "https://images.unsplash.com/photo-1594896733292-9a77b5809c63?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NzV8MHwxfHNlYXJjaHwyfHxsdXh1cnklMjBhYnN0cmFjdCUyMGRhcmslMjBnb2xkJTIwdGV4dHVyZXxlbnwwfHx8fDE3ODg2MTkzNTR8MA&ixlib=rb-4.1.0&q=85";

type IconName = React.ComponentProps<typeof Feather>["name"];

const QUICK_ACTIONS: { id: string; label: string; icon: IconName; href: string }[] = [
  { id: "tips", label: "My Tips", icon: "star", href: "/tips" },
  { id: "games", label: "Games", icon: "grid", href: "/(tabs)/games" },
  { id: "results", label: "Results", icon: "trending-up", href: "/(tabs)/results" },
  { id: "subscribe", label: "Subscribe", icon: "award", href: "/subscription" },
  { id: "history", label: "Payments", icon: "credit-card", href: "/payments/history" },
  { id: "help", label: "Help", icon: "help-circle", href: "/help" },
];

export default function HomeScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, refresh } = useSession();

  const subQ = useSubscriptionQuery();
  const gamesQ = useQuery({ queryKey: ["games"], queryFn: api.games });
  const resultsQ = useQuery({ queryKey: ["results"], queryFn: () => api.allResults(8) });
  const annQ = useQuery({ queryKey: ["announcements"], queryFn: api.announcements });
  const notifQ = useQuery({ queryKey: ["notifications"], queryFn: api.notifications });

  const unread = (notifQ.data ?? []).filter((n) => !n.read).length;

  const onRefresh = async () => {
    await Promise.all([
      refresh(),
      subQ.refetch(),
      gamesQ.refetch(),
      resultsQ.refetch(),
      annQ.refetch(),
      notifQ.refetch(),
    ]);
  };

  const copyId = async () => {
    if (!user?.top_one_id) return;
    await Clipboard.setStringAsync(user.top_one_id);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    showToast("ID copied", "success");
  };

  const sub = subQ.data;
  const activeAnn = annQ.data?.[0];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingBottom: 32,
      }}
      refreshControl={
        <RefreshControl
          refreshing={subQ.isFetching || gamesQ.isFetching}
          onRefresh={onRefresh}
          tintColor={colors.brandPrimary}
        />
      }
      testID="home-screen"
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <View>
          <Muted style={styles.tinyLabel}>WELCOME</Muted>
          <Text style={styles.hello} testID="home-hello">
            {user?.display_name?.trim() || "Member"}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push("/(tabs)/notifications")}
          hitSlop={12}
          style={styles.bellWrap}
          testID="home-bell"
          accessibilityRole="button"
        >
          <Feather name="bell" size={22} color={colors.onSurface} />
          {unread > 0 ? <View style={styles.bellDot} /> : null}
        </Pressable>
      </View>

      {/* ID card */}
      <View style={styles.idCardWrap}>
        <Image source={{ uri: CARD_TEXTURE }} style={styles.idCardTexture} contentFit="cover" />
        <LinearGradient
          colors={["rgba(9,9,11,0.15)", "rgba(9,9,11,0.75)"]}
          style={styles.idCardScrim}
        />
        <GlassPane style={styles.idGlass}>
          <View style={styles.idRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.idBrand}>TOP ONE</Text>
              <Text style={styles.idLabel}>MEMBER ID</Text>
              <Text style={styles.idValue} selectable testID="home-top-one-id">
                {user?.top_one_id ?? "TOP-••••••••"}
              </Text>
            </View>
            <Pressable
              onPress={copyId}
              style={styles.copyBtn}
              testID="home-copy-id"
              accessibilityRole="button"
              hitSlop={10}
            >
              <Feather name="copy" size={16} color={colors.brandPrimary} />
              <Text style={styles.copyText}>Copy</Text>
            </Pressable>
          </View>
          <View style={styles.idFooter}>
            <Chip
              label={sub ? sub.plan_name : "No active plan"}
              tone={sub ? "success" : "neutral"}
            />
            {sub ? <Muted style={{ fontSize: 12 }}>Renews manually</Muted> : null}
          </View>
        </GlassPane>
      </View>

      {/* Subscription block */}
      <View style={{ padding: 20, gap: 12 }}>
        <SectionHeader
          title="Subscription"
          action={
            <Pressable onPress={() => router.push("/subscription")} testID="home-view-plans">
              <Text style={styles.link}>View plans</Text>
            </Pressable>
          }
        />
        {subQ.isLoading ? (
          <Skeleton height={110} />
        ) : sub ? (
          <Card testID="home-sub-card">
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <View>
                <Text style={styles.planName}>{sub.plan_name}</Text>
                <Muted style={{ fontSize: 12 }}>
                  Expires {sub.expires_at ? new Date(sub.expires_at).toLocaleDateString() : "—"}
                </Muted>
              </View>
              <Chip label={sub.status.toUpperCase()} tone="success" />
            </View>
            <View style={styles.benefitsRow}>
              <BenefitPill label="Open" left={sub.benefits_remaining.open} total={sub.benefits_total.open} />
              <BenefitPill label="Jodi" left={sub.benefits_remaining.jodi} total={sub.benefits_total.jodi} />
              {sub.benefits_total.pane > 0 ? (
                <BenefitPill label="Pane" left={sub.benefits_remaining.pane} total={sub.benefits_total.pane} />
              ) : null}
            </View>
            <View style={{ height: 12 }} />
            <Pressable
              onPress={() => router.push("/tips")}
              style={styles.primarySmall}
              testID="home-open-tips"
            >
              <Text style={styles.primarySmallText}>Open my tips</Text>
            </Pressable>
          </Card>
        ) : (
          <Card testID="home-sub-empty">
            <Text style={styles.planName}>Upgrade your access</Text>
            <Muted>Two plans available. Unlock your first Open, Jodi and Pane calls.</Muted>
            <View style={{ height: 12 }} />
            <Pressable
              onPress={() => router.push("/subscription")}
              style={styles.primarySmall}
              testID="home-subscribe-cta"
            >
              <Text style={styles.primarySmallText}>See plans</Text>
            </Pressable>
          </Card>
        )}
      </View>

      {/* Announcements */}
      {activeAnn ? (
        <View style={{ paddingHorizontal: 20 }}>
          <Card style={{ borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary }} testID="home-announcement">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <Feather name="volume-2" size={14} color={colors.onBrandTertiary} />
              <Text style={{ color: colors.onBrandTertiary, fontWeight: "700", fontSize: 12, letterSpacing: 1 }}>
                ANNOUNCEMENT
              </Text>
            </View>
            <Text style={{ color: colors.onBrandTertiary, fontSize: 15, fontWeight: "700" }}>
              {activeAnn.title}
            </Text>
            <Muted style={{ color: colors.onBrandTertiary, marginTop: 4 }}>{activeAnn.message}</Muted>
          </Card>
        </View>
      ) : null}

      {/* Quick actions */}
      <View style={{ padding: 20 }}>
        <SectionHeader title="Quick actions" />
        <View style={styles.quickGrid}>
          {QUICK_ACTIONS.map((qa) => (
            <Pressable
              key={qa.id}
              style={styles.quickTile}
              onPress={() => router.push(qa.href as any)}
              accessibilityRole="button"
              testID={`quick-${qa.id}`}
            >
              <View style={styles.quickIconWrap}>
                <Feather name={qa.icon} size={18} color={colors.brandPrimary} />
              </View>
              <Text style={styles.quickLabel}>{qa.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Live games strip */}
      <View style={{ paddingLeft: 20, paddingRight: 4 }}>
        <SectionHeader
          title="Live games"
          action={
            <Pressable onPress={() => router.push("/(tabs)/games")}>
              <Text style={styles.link}>All</Text>
            </Pressable>
          }
        />
        {gamesQ.isLoading ? (
          <View style={{ paddingRight: 20 }}>
            <Skeleton height={130} />
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: 20, paddingTop: 12, gap: 12 }}
          >
            {(gamesQ.data ?? []).map((g) => (
              <Pressable
                key={g.id}
                style={styles.gameCard}
                onPress={() => router.push(`/game/${g.id}` as any)}
                accessibilityRole="button"
                testID={`home-game-${g.id}`}
              >
                <Text style={styles.gameName}>{g.name}</Text>
                <Muted style={{ fontSize: 11 }}>{g.open_time} – {g.close_time}</Muted>
                <View style={{ height: 8 }} />
                <Text style={styles.gameResult}>
                  {g.latest_result?.jodi ??
                    g.latest_result?.open_pana ??
                    g.latest_result?.close_pana ??
                    "—"}
                </Text>
                <Muted style={{ fontSize: 11 }}>Latest result</Muted>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Recent results */}
      <View style={{ padding: 20 }}>
        <SectionHeader
          title="Recent results"
          action={
            <Pressable onPress={() => router.push("/(tabs)/results")}>
              <Text style={styles.link}>All</Text>
            </Pressable>
          }
        />
        <View style={{ height: 12 }} />
        {resultsQ.isLoading ? (
          <Skeleton height={80} />
        ) : (resultsQ.data ?? []).length === 0 ? (
          <Card>
            <Muted>No results published yet. Check back after the next game close.</Muted>
          </Card>
        ) : (
          <View style={{ gap: 8 }}>
            {(resultsQ.data ?? []).slice(0, 5).map((r) => (
              <Card key={r.id} style={styles.resultRow} testID={`home-result-${r.id}`}>
                <View>
                  <Text style={styles.gameNameSm}>
                    {(gamesQ.data ?? []).find((g) => g.id === r.game_id)?.name ?? r.game_id}
                  </Text>
                  <Muted style={{ fontSize: 11 }}>
                    {r.date} · {r.session}
                  </Muted>
                </View>
                <Text style={styles.gameResult}>
                  {r.jodi ?? r.open_pana ?? r.close_pana ?? "—"}
                </Text>
              </Card>
            ))}
          </View>
        )}
      </View>

      <Text style={styles.footerNote}>
        TOP ONE is a tips and tracking service. Results are informational only. Play responsibly and follow all applicable laws.
      </Text>
    </ScrollView>
  );
}

function BenefitPill({ label, left, total }: { label: string; left: number; total: number }) {
  const styles = useStyles();
  return (
    <View style={styles.benefitPill}>
      <Text style={styles.benefitVal}>
        {left}
        <Text style={styles.benefitTotal}>/{total}</Text>
      </Text>
      <Muted style={{ fontSize: 10, letterSpacing: 1 }}>{label.toUpperCase()}</Muted>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.surface },
  headerRow: {
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  tinyLabel: { fontSize: 10, letterSpacing: 4, marginBottom: 2 },
  hello: { color: c.onSurface, fontSize: 22, fontWeight: "700", letterSpacing: -0.3 },
  bellWrap: {
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: c.surfaceSecondary,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: "center",
    justifyContent: "center",
  },
  bellDot: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: c.brandPrimary,
    borderWidth: 1,
    borderColor: c.surface,
  },
  idCardWrap: {
    marginHorizontal: 20,
    height: 210,
    borderRadius: 24,
    overflow: "hidden",
    marginBottom: 4,
  },
  idCardTexture: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  idCardScrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  idGlass: { position: "absolute", top: 12, left: 12, right: 12, bottom: 12 },
  idRow: { flexDirection: "row", alignItems: "flex-start" },
  idBrand: { color: c.brandPrimary, fontSize: 13, fontWeight: "800", letterSpacing: 4 },
  idLabel: { color: "#F5F2ED", opacity: 0.85, fontSize: 10, letterSpacing: 3, marginTop: 12 },
  idValue: {
    color: "#F5F2ED",
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: 4,
    marginTop: 4,
  },
  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.brandPrimary,
  },
  copyText: { color: c.brandPrimary, fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  idFooter: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  link: { color: c.brandPrimary, fontSize: 13, fontWeight: "700" },
  planName: { color: c.onSurface, fontSize: 18, fontWeight: "700" },
  benefitsRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  benefitPill: {
    flex: 1,
    backgroundColor: c.surfaceTertiary,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: c.border,
  },
  benefitVal: { color: c.onSurface, fontSize: 22, fontWeight: "800" },
  benefitTotal: { color: c.muted, fontSize: 12, fontWeight: "600" },
  primarySmall: {
    alignSelf: "flex-start",
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: c.brandPrimary,
    borderRadius: 999,
  },
  primarySmallText: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 13, letterSpacing: 0.5 },
  quickGrid: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  quickTile: {
    width: "31.5%",
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceSecondary,
    alignItems: "center",
    gap: 8,
  },
  quickIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: c.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  quickLabel: { color: c.onSurface, fontSize: 12, fontWeight: "600" },
  gameCard: {
    width: 170,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceSecondary,
  },
  gameName: { color: c.onSurface, fontSize: 14, fontWeight: "800", letterSpacing: 1.5 },
  gameNameSm: { color: c.onSurface, fontSize: 14, fontWeight: "700" },
  gameResult: { color: c.brandPrimary, fontSize: 26, fontWeight: "800", letterSpacing: 2 },
  resultRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  footerNote: {
    marginTop: 16,
    paddingHorizontal: 24,
    color: c.muted,
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
  },
}));
