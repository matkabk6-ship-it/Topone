// Admin broadcast: create announcement or notification.
import Feather from "@react-native-vector-icons/feather";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { adminApi } from "@/src/api";
import { Button, Card, Chip, Empty, Input, Muted, Skeleton } from "@/src/components/ui";
import { showToast } from "@/src/components/toast";
import { makeStyles, useTheme } from "@/src/theme";

export default function AdminBroadcast() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const [mode, setMode] = useState<"announcement" | "notification">("announcement");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const q = useQuery({ queryKey: ["adminAnnouncements"], queryFn: adminApi.announcements });

  const submit = async () => {
    if (title.trim().length < 2 || message.trim().length < 2) {
      showToast("Title and message required.", "warning");
      return;
    }
    setSending(true);
    try {
      if (mode === "announcement") {
        await adminApi.createAnnouncement({ title, message, active: true });
      } else {
        await adminApi.createNotification({ audience: "all", title, message, type: "announcement" });
      }
      showToast("Sent to all members", "success");
      setTitle("");
      setMessage("");
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
        refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={q.refetch} tintColor={colors.brandPrimary} />}
        testID="admin-broadcast-screen"
      >
        <Card>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
            {(["announcement", "notification"] as const).map((m) => {
              const active = mode === m;
              return (
                <Pressable
                  key={m}
                  style={[styles.chip, active && { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary }]}
                  onPress={() => setMode(m)}
                  testID={`broadcast-mode-${m}`}
                >
                  <Text style={[styles.chipText, active && { color: colors.onBrandTertiary }]}>
                    {m === "announcement" ? "Announcement" : "Push Alert"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
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
          <View style={{ height: 14 }} />
          <Button title="Send" fullWidth onPress={submit} loading={sending} testID="broadcast-send" />
        </Card>

        <Muted style={styles.section}>ACTIVE ANNOUNCEMENTS</Muted>
        {q.isLoading ? (
          <Skeleton height={80} />
        ) : (q.data ?? []).filter((a) => a.active).length === 0 ? (
          <Empty title="No active announcements" />
        ) : (
          (q.data ?? [])
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
  },
  chipText: { color: c.onSurfaceSecondary, fontSize: 12, fontWeight: "700" },
  section: { fontSize: 10, letterSpacing: 3, marginTop: 8 },
  itemTitle: { color: c.onSurface, fontSize: 15, fontWeight: "700" },
}));
