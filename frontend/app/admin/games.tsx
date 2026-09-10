// Admin — Games CRUD: add, edit, activate/deactivate, remove.
import Feather from "@react-native-vector-icons/feather";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Game, adminApi } from "@/src/api";
import { Button, Card, Chip, Empty, Input, Muted, Skeleton } from "@/src/components/ui";
import { showToast } from "@/src/components/toast";
import { makeStyles, useTheme } from "@/src/theme";

type Editing = null | { mode: "create" | "edit"; game?: Game };

const slugify = (v: string) =>
  v
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 32);

export default function AdminGames() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const router = useRouter();

  const q = useQuery({ queryKey: ["adminGames"], queryFn: adminApi.games });
  const [editing, setEditing] = useState<Editing>(null);
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [openTime, setOpenTime] = useState("");
  const [closeTime, setCloseTime] = useState("");
  const [scheduleNote, setScheduleNote] = useState("Mon – Sat");
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [sortOrder, setSortOrder] = useState("50");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) return;
    if (editing.mode === "edit" && editing.game) {
      const g = editing.game;
      setId(g.id);
      setName(g.name);
      setDescription(g.description ?? "");
      setOpenTime(g.open_time ?? "");
      setCloseTime(g.close_time ?? "");
      setScheduleNote(g.schedule_note ?? "");
      setStatus(g.status);
      setSortOrder(String(g.sort_order ?? 50));
    } else {
      setId("");
      setName("");
      setDescription("");
      setOpenTime("");
      setCloseTime("");
      setScheduleNote("Mon – Sat");
      setStatus("active");
      setSortOrder("50");
    }
  }, [editing]);

  const submit = async () => {
    if (!name.trim()) return showToast("Name is required", "warning");
    if (editing?.mode === "create" && !/^[a-z0-9_]{2,32}$/.test(id)) {
      return showToast("Game id must be lowercase letters, digits and underscores.", "warning");
    }
    setSaving(true);
    try {
      if (editing?.mode === "create") {
        await adminApi.createGame({
          id,
          name: name.trim(),
          description: description.trim(),
          open_time: openTime.trim() || undefined,
          close_time: closeTime.trim() || undefined,
          schedule_note: scheduleNote.trim(),
          status,
          sort_order: Number(sortOrder) || 50,
        });
        showToast("Game added", "success");
      } else if (editing?.mode === "edit" && editing.game) {
        await adminApi.updateGame(editing.game.id, {
          name: name.trim(),
          description: description.trim(),
          open_time: openTime.trim() || null,
          close_time: closeTime.trim() || null,
          schedule_note: scheduleNote.trim(),
          status,
          sort_order: Number(sortOrder) || 50,
        });
        showToast("Game updated", "success");
      }
      qc.invalidateQueries();
      setEditing(null);
    } catch (e: any) {
      showToast(e?.message ?? "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const removeGame = async (g: Game) => {
    try {
      await adminApi.deleteGame(g.id);
      showToast("Game removed", "success");
      qc.invalidateQueries();
    } catch (e: any) {
      showToast(e?.message ?? "Failed", "error");
    }
  };

  return (
    <View style={styles.container} testID="admin-games-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} testID="admin-games-back">
          <Feather name="chevron-left" size={24} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Muted style={{ fontSize: 10, letterSpacing: 4 }}>ADMIN</Muted>
          <Text style={styles.title}>Games</Text>
        </View>
        <Pressable style={styles.newBtn} onPress={() => setEditing({ mode: "create" })} testID="admin-game-new">
          <Feather name="plus" size={16} color={colors.onBrandPrimary} />
          <Text style={styles.newBtnText}>Add</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={q.refetch} tintColor={colors.brandPrimary} />}
      >
        {q.isLoading ? (
          <>
            <Skeleton height={110} style={{ marginBottom: 12 }} />
            <Skeleton height={110} />
          </>
        ) : (q.data ?? []).length === 0 ? (
          <Empty title="No games yet" message="Tap Add to create your first game." />
        ) : (
          <View style={{ gap: 12 }}>
            {(q.data ?? []).map((g) => (
              <Card key={g.id} testID={`admin-game-row-${g.id}`}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.gameName}>{g.name}</Text>
                    <Muted style={{ fontSize: 11 }}>
                      id: {g.id} · order {g.sort_order}
                    </Muted>
                    {g.open_time || g.close_time ? (
                      <Muted style={{ fontSize: 12, marginTop: 4 }}>
                        {g.open_time ?? "—"} – {g.close_time ?? "—"} · {g.schedule_note}
                      </Muted>
                    ) : null}
                  </View>
                  <Chip label={g.status === "active" ? "LIVE" : "PAUSED"} tone={g.status === "active" ? "success" : "warning"} />
                </View>
                {g.description ? <Muted style={{ fontSize: 13, marginTop: 8 }}>{g.description}</Muted> : null}
                <View style={styles.rowActions}>
                  <Pressable
                    style={styles.editBtn}
                    onPress={() => setEditing({ mode: "edit", game: g })}
                    testID={`admin-game-edit-${g.id}`}
                  >
                    <Feather name="edit-2" size={14} color={colors.brandPrimary} />
                    <Text style={styles.editText}>Edit</Text>
                  </Pressable>
                  <Pressable
                    style={styles.editBtn}
                    onPress={async () => {
                      await adminApi.updateGame(g.id, { status: g.status === "active" ? "inactive" : "active" });
                      qc.invalidateQueries();
                    }}
                    testID={`admin-game-toggle-${g.id}`}
                  >
                    <Feather name={g.status === "active" ? "pause" : "play"} size={14} color={colors.brandPrimary} />
                    <Text style={styles.editText}>{g.status === "active" ? "Pause" : "Activate"}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.editBtn, { borderColor: colors.error }]}
                    onPress={() => removeGame(g)}
                    testID={`admin-game-del-${g.id}`}
                  >
                    <Feather name="trash-2" size={14} color={colors.error} />
                    <Text style={[styles.editText, { color: colors.error }]}>Remove</Text>
                  </Pressable>
                </View>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal transparent animationType="fade" visible={!!editing} onRequestClose={() => setEditing(null)}>
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={styles.formWrap} keyboardShouldPersistTaps="handled">
            <View style={styles.formCard}>
              <Text style={styles.modalTitle}>{editing?.mode === "create" ? "Add game" : "Edit game"}</Text>
              <View style={{ height: 12 }} />
              <Input
                label="Name"
                value={name}
                onChangeText={(v) => {
                  setName(v);
                  if (editing?.mode === "create") setId(slugify(v));
                }}
                maxLength={64}
                placeholder="e.g. Sridevi Night"
                testID="admin-game-name"
              />
              <View style={{ height: 10 }} />
              <Input
                label="Game id"
                value={id}
                onChangeText={(v) => setId(slugify(v))}
                editable={editing?.mode === "create"}
                autoCapitalize="none"
                maxLength={32}
                hint="Lowercase letters, digits and underscores only. Cannot change later."
                testID="admin-game-id"
              />
              <View style={{ height: 10 }} />
              <Input
                label="Description"
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
                maxLength={500}
                style={{ minHeight: 80, textAlignVertical: "top" }}
                testID="admin-game-desc"
              />
              <View style={{ height: 10 }} />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Input label="Open time" value={openTime} onChangeText={setOpenTime} placeholder="21:30" testID="admin-game-open" />
                </View>
                <View style={{ flex: 1 }}>
                  <Input label="Close time" value={closeTime} onChangeText={setCloseTime} placeholder="23:45" testID="admin-game-close" />
                </View>
              </View>
              <View style={{ height: 10 }} />
              <Input label="Schedule note" value={scheduleNote} onChangeText={setScheduleNote} testID="admin-game-schedule" />
              <View style={{ height: 10 }} />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Muted style={styles.label}>STATUS</Muted>
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                    {(["active", "inactive"] as const).map((s) => {
                      const active = status === s;
                      return (
                        <Pressable
                          key={s}
                          style={[styles.chip, active && { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary }]}
                          onPress={() => setStatus(s)}
                          testID={`admin-game-status-${s}`}
                        >
                          <Text style={[styles.chipText, active && { color: colors.onBrandTertiary }]}>
                            {s === "active" ? "Live" : "Paused"}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Sort order"
                    value={sortOrder}
                    onChangeText={(v) => setSortOrder(v.replace(/\D/g, "").slice(0, 3))}
                    keyboardType="number-pad"
                    hint="Lower = shown first"
                    testID="admin-game-sort"
                  />
                </View>
              </View>

              <View style={{ height: 20 }} />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}><Button title="Cancel" variant="outline" onPress={() => setEditing(null)} /></View>
                <View style={{ flex: 1 }}><Button title={editing?.mode === "create" ? "Add" : "Save"} onPress={submit} loading={saving} testID="admin-game-save" /></View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.surface },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 0.5,
    borderColor: c.divider,
  },
  title: { color: c.onSurface, fontSize: 20, fontWeight: "800" },
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: c.brandPrimary,
  },
  newBtnText: { color: c.onBrandPrimary, fontSize: 12, fontWeight: "800" },
  gameName: { color: c.onSurface, fontSize: 16, fontWeight: "800", letterSpacing: 1 },
  rowActions: { flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.brandPrimary,
  },
  editText: { color: c.brandPrimary, fontSize: 12, fontWeight: "700" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  formWrap: { padding: 20, justifyContent: "center", flexGrow: 1 },
  formCard: {
    backgroundColor: c.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: c.border,
  },
  modalTitle: { color: c.onSurface, fontSize: 18, fontWeight: "800" },
  label: { fontSize: 10, letterSpacing: 3 },
  chip: {
    flex: 1,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  chipText: { color: c.onSurfaceSecondary, fontSize: 12, fontWeight: "700" },
}));
