// Admin broadcast: announcements, push alerts, and targeted tips.
import Feather from "@react-native-vector-icons/feather";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { adminApi, api } from "@/src/api";
import { Button, Card, Chip, Empty, Input, Muted, Skeleton } from "@/src/components/ui";
import { showToast } from "@/src/components/toast";
import { makeStyles, useTheme } from "@/src/theme";

type Mode = "tip" | "announcement" | "notification";

const AUDIENCE_OPTIONS: { id: "base" | "pro" | "both"; label: string; hint: string }[] = [
  { id: "base", label: "Base only", hint: "₹299 subscribers" },
  { id: "pro", label: "Pro only", hint: "₹599 subscribers" },
  { id: "both", label: "Both plans", hint: "Base + Pro" },
];

const TIP_TYPES: { id: "open" | "jodi" | "pane"; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "jodi", label: "Jodi" },
  { id: "pane", label: "Pane" },
];

const SESSIONS: { id: "open" | "close"; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "close", label: "Close" },
];

export default function AdminBroadcast() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const [mode, setMode] = useState<Mode>("tip");

  // announcement / notification fields
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");

  // tip fields
  const [gameId, setGameId] = useState<string>("sridevi");
  const [tipType, setTipType] = useState<"open" | "jodi" | "pane">("jodi");
  const [tipValue, setTipValue] = useState("");
  const [tipSession, setTipSession] = useState<"open" | "close">("open");
  const [tipNote, setTipNote] = useState("");
  const [audience, setAudience] = useState<"base" | "pro" | "both">("both");
  const [tipDate, setTipDate] = useState<string>(new Date().toISOString().slice(0, 10));

  const [sending, setSending] = useState(false);

  const gamesQ = useQuery({ queryKey: ["games"], queryFn: api.games });
  const annQ = useQuery({ queryKey: ["adminAnnouncements"], queryFn: adminApi.announcements });
  const tipsQ = useQuery({ queryKey: ["adminTips"], queryFn: () => adminApi.listTips() });

  // Pane tips can't be sent to base-only audience — auto-correct the selector.
  const disableBase = tipType === "pane";

  const submit = async () => {
    if (mode !== "tip") {
      if (title.trim().length < 2 || message.trim().length < 2) {
        showToast("Title and message required.", "warning");
        return;
      }
    } else {
      if (!tipValue.trim()) {
        showToast("Enter the tip value.", "warning");
        return;
      }
      if (audience === "base" && tipType === "pane") {
        showToast("Pane tips are Pro-only. Choose Pro or Both.", "warning");
        return;
      }
    }
    setSending(true);
    try {
      if (mode === "announcement") {
        await adminApi.createAnnouncement({ title, message, active: true });
        showToast("Announcement posted", "success");
        setTitle("");
        setMessage("");
      } else if (mode === "notification") {
        await adminApi.createNotification({ audience: "all", title, message, type: "announcement" });
        showToast("Push alert sent to everyone", "success");
        setTitle("");
        setMessage("");
      } else {
        const created = await adminApi.createTip({
          game_id: gameId,
          tip_type: tipType,
          value: tipValue.trim(),
          session: tipSession,
          note: tipNote.trim() || undefined,
          audience,
          for_date: tipDate || undefined,
        });
        showToast(
          audience === "both"
            ? "Tip sent to both plans"
            : `Tip sent to ${audience.toUpperCase()} members`,
          "success",
        );
        setTipValue("");
        setTipNote("");
        void created;
      }
      qc.invalidateQueries();
    } catch (e: any) {
      showToast(e?.message ?? "Failed", "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Muted style={{ fontSize: 10, letterSpacing: 4 }}>ADMIN</Muted>
        <Text style={styles.title}>Broadcast</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 14 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={annQ.isFetching || tipsQ.isFetching}
            onRefresh={() => {
              annQ.refetch();
              tipsQ.refetch();
            }}
            tintColor={colors.brandPrimary}
          />
        }
        testID="admin-broadcast-screen"
      >
        {/* Mode picker */}
        <Card>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {([
              { id: "tip", label: "Send Tip" },
              { id: "announcement", label: "Announcement" },
              { id: "notification", label: "Push Alert" },
            ] as { id: Mode; label: string }[]).map((m) => {
              const active = mode === m.id;
              return (
                <Pressable
                  key={m.id}
                  style={[styles.chip, active && { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary }]}
                  onPress={() => setMode(m.id)}
                  testID={`broadcast-mode-${m.id}`}
                >
                  <Text style={[styles.chipText, active && { color: colors.onBrandTertiary }]}>
                    {m.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={{ height: 12 }} />

          {mode === "tip" ? (
            <>
              <Muted style={{ fontSize: 12 }}>
                Send a private prediction to paid subscribers. Base tips go to ₹299 members, Pro tips go to ₹599 members.
              </Muted>
              <View style={{ height: 14 }} />

              <Muted style={styles.label}>AUDIENCE</Muted>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                {AUDIENCE_OPTIONS.map((a) => {
                  const active = audience === a.id;
                  const disabled = a.id === "base" && disableBase;
                  return (
                    <Pressable
                      key={a.id}
                      style={[
                        styles.audiencePill,
                        active && { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
                        disabled && { opacity: 0.4 },
                      ]}
                      onPress={() => !disabled && setAudience(a.id)}
                      disabled={disabled}
                      testID={`broadcast-audience-${a.id}`}
                    >
                      <Text style={[styles.audienceLabel, active && { color: colors.onBrandTertiary }]}>
                        {a.label}
                      </Text>
                      <Text style={[styles.audienceHint, active && { color: colors.onBrandTertiary }]}>
                        {a.hint}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {disableBase ? (
                <Muted style={{ fontSize: 11, marginTop: 8, color: colors.warning }}>
                  Pane tips are Pro-only. Base plan doesn't include Pane.
                </Muted>
              ) : null}

              <View style={{ height: 14 }} />
              <Muted style={styles.label}>GAME</Muted>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                {(gamesQ.data ?? []).map((g) => {
                  const active = gameId === g.id;
                  return (
                    <Pressable
                      key={g.id}
                      style={[styles.chip, active && { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary }]}
                      onPress={() => setGameId(g.id)}
                      testID={`broadcast-game-${g.id}`}
                    >
                      <Text style={[styles.chipText, active && { color: colors.onBrandTertiary }]}>
                        {g.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={{ height: 14 }} />
              <Muted style={styles.label}>TIP TYPE</Muted>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                {TIP_TYPES.map((t) => {
                  const active = tipType === t.id;
                  return (
                    <Pressable
                      key={t.id}
                      style={[styles.chip, active && { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary }]}
                      onPress={() => {
                        setTipType(t.id);
                        if (t.id === "pane" && audience === "base") setAudience("pro");
                      }}
                      testID={`broadcast-tiptype-${t.id}`}
                    >
                      <Text style={[styles.chipText, active && { color: colors.onBrandTertiary }]}>
                        {t.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={{ height: 14 }} />
              <Muted style={styles.label}>SESSION</Muted>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                {SESSIONS.map((s) => {
                  const active = tipSession === s.id;
                  return (
                    <Pressable
                      key={s.id}
                      style={[styles.chip, active && { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary }]}
                      onPress={() => setTipSession(s.id)}
                      testID={`broadcast-session-${s.id}`}
                    >
                      <Text style={[styles.chipText, active && { color: colors.onBrandTertiary }]}>
                        {s.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={{ height: 14 }} />
              <Input
                label="Value"
                placeholder={tipType === "jodi" ? "e.g. 47" : tipType === "pane" ? "e.g. 128" : "e.g. 5"}
                value={tipValue}
                onChangeText={setTipValue}
                keyboardType="number-pad"
                maxLength={12}
                testID="broadcast-tip-value"
              />
              <View style={{ height: 10 }} />
              <Input
                label="For date (YYYY-MM-DD)"
                value={tipDate}
                onChangeText={setTipDate}
                autoCapitalize="none"
                maxLength={10}
                testID="broadcast-tip-date"
              />
              <View style={{ height: 10 }} />
              <Input
                label="Note (optional)"
                value={tipNote}
                onChangeText={setTipNote}
                multiline
                numberOfLines={2}
                maxLength={280}
                style={{ minHeight: 70, textAlignVertical: "top" }}
                testID="broadcast-tip-note"
              />
            </>
          ) : (
            <>
              <Muted style={{ fontSize: 12 }}>
                {mode === "announcement"
                  ? "Shown in the announcement banner on the Home dashboard."
                  : "Delivered as a notification to every member's Alerts tab."}
              </Muted>
              <View style={{ height: 14 }} />
              <Input label="Title" value={title} onChangeText={setTitle} maxLength={80} testID="broadcast-title" />
              <View style={{ height: 12 }} />
              <Input
                label="Message"
                value={message}
                onChangeText={setMessage}
                multiline
                numberOfLines={3}
                style={{ minHeight: 100, textAlignVertical: "top" }}
                maxLength={500}
                testID="broadcast-message"
              />
            </>
          )}

          <View style={{ height: 14 }} />
          <Button
            title={
              mode === "tip"
                ? `Send tip to ${audience === "both" ? "Base + Pro" : audience.toUpperCase()} members`
                : "Send"
            }
            fullWidth
            onPress={submit}
            loading={sending}
            testID="broadcast-send"
          />
        </Card>

        {mode === "tip" ? (
          <>
            <Muted style={styles.section}>RECENT TIPS</Muted>
            {tipsQ.isLoading ? (
              <Skeleton height={90} />
            ) : (tipsQ.data ?? []).length === 0 ? (
              <Empty title="No tips yet" />
            ) : (
              (tipsQ.data ?? []).slice(0, 10).map((t) => (
                <Card key={t.id} testID={`admin-tip-${t.id}`}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={styles.tipGame}>
                        {(gamesQ.data ?? []).find((g) => g.id === t.game_id)?.name ?? t.game_id.toUpperCase()}
                      </Text>
                      <Chip label={t.tip_type.toUpperCase()} tone="brand" />
                    </View>
                    <Chip
                      label={t.audience === "both" ? "BASE + PRO" : `${t.audience.toUpperCase()} ONLY`}
                      tone={t.audience === "pro" ? "warning" : t.audience === "base" ? "info" : "success"}
                    />
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 12, marginTop: 6 }}>
                    <Text style={styles.tipValue}>{t.value}</Text>
                    {t.for_date ? <Muted style={{ fontSize: 12 }}>for {t.for_date}</Muted> : null}
                    {t.session ? <Muted style={{ fontSize: 12 }}>· {t.session}</Muted> : null}
                  </View>
                  {t.note ? <Muted style={{ fontSize: 12, marginTop: 4 }}>{t.note}</Muted> : null}
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                    <Muted style={{ fontSize: 11 }}>
                      {t.created_at ? new Date(t.created_at).toLocaleString() : ""}
                    </Muted>
                    <Pressable
                      onPress={async () => {
                        try {
                          await adminApi.deleteTip(t.id);
                          showToast("Tip removed", "success");
                          qc.invalidateQueries({ queryKey: ["adminTips"] });
                        } catch (e: any) {
                          showToast(e?.message ?? "Failed", "error");
                        }
                      }}
                      hitSlop={8}
                      testID={`admin-tip-del-${t.id}`}
                    >
                      <Feather name="trash-2" size={16} color={colors.error} />
                    </Pressable>
                  </View>
                </Card>
              ))
            )}
          </>
        ) : (
          <>
            <Muted style={styles.section}>ACTIVE ANNOUNCEMENTS</Muted>
            {annQ.isLoading ? (
              <Skeleton height={80} />
            ) : (annQ.data ?? []).filter((a) => a.active).length === 0 ? (
              <Empty title="No active announcements" />
            ) : (
              (annQ.data ?? [])
                .filter((a) => a.active)
                .map((a) => (
                  <Card key={a.id} testID={`broadcast-ann-${a.id}`}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <View style={{ flex: 1, marginRight: 12 }}>
                        <Text style={styles.itemTitle}>{a.title}</Text>
                        <Muted style={{ fontSize: 12, marginTop: 4 }}>{a.message}</Muted>
                      </View>
                      <Pressable
                        onPress={async () => {
                          await adminApi.deleteAnnouncement(a.id);
                          qc.invalidateQueries({ queryKey: ["adminAnnouncements"] });
                          showToast("Deactivated", "success");
                        }}
                        hitSlop={8}
                        testID={`broadcast-off-${a.id}`}
                      >
                        <Feather name="x-circle" size={18} color={colors.error} />
                      </Pressable>
                    </View>
                    <View style={{ marginTop: 8 }}>
                      <Chip label="ACTIVE" tone="success" />
                    </View>
                  </Card>
                ))
            )}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
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
  label: { fontSize: 10, letterSpacing: 3 },
  audiencePill: {
    minWidth: 100,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceSecondary,
    flexShrink: 0,
  },
  audienceLabel: { color: c.onSurface, fontSize: 13, fontWeight: "800" },
  audienceHint: { color: c.muted, fontSize: 11, marginTop: 2 },
  section: { fontSize: 10, letterSpacing: 3, marginTop: 8 },
  itemTitle: { color: c.onSurface, fontSize: 15, fontWeight: "700" },
  tipGame: { color: c.onSurface, fontSize: 15, fontWeight: "800", letterSpacing: 1.5 },
  tipValue: { color: c.brandPrimary, fontSize: 26, fontWeight: "800", letterSpacing: 2 },
}));
