// Admin results: publish new result + list existing.
import Feather from "@react-native-vector-icons/feather";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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

import { adminApi, api } from "@/src/api";
import { Button, Card, Empty, Input, Muted, Skeleton } from "@/src/components/ui";
import { showToast } from "@/src/components/toast";
import { makeStyles, useTheme } from "@/src/theme";

export default function AdminResults() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [gameId, setGameId] = useState("sridevi");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [session, setSession] = useState<"open" | "close">("open");
  const [openPana, setOpenPana] = useState("");
  const [openDigit, setOpenDigit] = useState("");
  const [jodi, setJodi] = useState("");
  const [closePana, setClosePana] = useState("");
  const [closeDigit, setCloseDigit] = useState("");
  const [saving, setSaving] = useState(false);

  const gamesQ = useQuery({ queryKey: ["games"], queryFn: api.games });
  const resultsQ = useQuery({ queryKey: ["adminResults"], queryFn: () => adminApi.results() });

  const gameName = (id: string) =>
    (gamesQ.data ?? []).find((g) => g.id === id)?.name ?? id.toUpperCase();

  const submit = async () => {
    setSaving(true);
    try {
      await adminApi.createResult({
        game_id: gameId,
        date,
        session,
        open_pana: openPana || null,
        open_digit: openDigit || null,
        jodi: jodi || null,
        close_pana: closePana || null,
        close_digit: closeDigit || null,
      });
      showToast("Result published", "success");
      qc.invalidateQueries();
      setShowForm(false);
      setOpenPana(""); setOpenDigit(""); setJodi(""); setClosePana(""); setCloseDigit("");
    } catch (e: any) {
      showToast(e?.message ?? "Publish failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async (id: string) => {
    try {
      await adminApi.deleteResult(id);
      showToast("Result removed", "success");
      qc.invalidateQueries();
    } catch (e: any) {
      showToast(e?.message ?? "Failed", "error");
    }
  };

  return (
    <View style={styles.container} testID="admin-results-screen">
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View>
            <Muted style={{ fontSize: 10, letterSpacing: 4 }}>ADMIN</Muted>
            <Text style={styles.title}>Results</Text>
          </View>
          <Pressable style={styles.newBtn} onPress={() => setShowForm(true)} testID="admin-new-result">
            <Feather name="plus" size={16} color={colors.onBrandPrimary} />
            <Text style={styles.newBtnText}>Publish</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={resultsQ.isFetching} onRefresh={resultsQ.refetch} tintColor={colors.brandPrimary} />}
      >
        {resultsQ.isLoading ? (
          <Skeleton height={80} />
        ) : (resultsQ.data ?? []).length === 0 ? (
          <Empty title="No results published yet" />
        ) : (
          <View style={{ gap: 10 }}>
            {(resultsQ.data ?? []).map((r) => (
              <Card key={r.id} style={styles.row} testID={`admin-result-${r.id}`}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.gameName}>{gameName(r.game_id)}</Text>
                  <Muted style={{ fontSize: 12 }}>{r.date} · {r.session.toUpperCase()}</Muted>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.value}>{r.jodi ?? r.open_pana ?? r.close_pana ?? "—"}</Text>
                  {r.open_pana || r.close_pana ? (
                    <Muted style={{ fontSize: 11 }}>{r.open_pana ?? "—"} / {r.close_pana ?? "—"}</Muted>
                  ) : null}
                </View>
                <Pressable style={{ padding: 8 }} onPress={() => doDelete(r.id)} testID={`admin-del-${r.id}`}>
                  <Feather name="trash-2" size={16} color={colors.error} />
                </Pressable>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal transparent animationType="fade" visible={showForm} onRequestClose={() => setShowForm(false)}>
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={styles.formWrap} keyboardShouldPersistTaps="handled">
            <View style={styles.formCard}>
              <Text style={styles.modalTitle}>Publish result</Text>
              <View style={{ height: 12 }} />

              <Muted style={styles.label}>GAME</Muted>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                {(gamesQ.data ?? []).map((g) => {
                  const active = gameId === g.id;
                  return (
                    <Pressable
                      key={g.id}
                      style={[styles.chip, active && { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary }]}
                      onPress={() => setGameId(g.id)}
                      testID={`admin-game-${g.id}`}
                    >
                      <Text style={[styles.chipText, active && { color: colors.onBrandTertiary }]}>{g.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={{ height: 12 }} />
              <Muted style={styles.label}>SESSION</Muted>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                {(["open", "close"] as const).map((s) => {
                  const active = session === s;
                  return (
                    <Pressable
                      key={s}
                      style={[styles.chip, active && { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary }]}
                      onPress={() => setSession(s)}
                      testID={`admin-sess-${s}`}
                    >
                      <Text style={[styles.chipText, active && { color: colors.onBrandTertiary }]}>{s.toUpperCase()}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={{ height: 12 }} />
              <Input label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} autoCapitalize="none" testID="admin-res-date" />
              <View style={{ height: 10 }} />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}><Input label="Open Pana" value={openPana} onChangeText={setOpenPana} keyboardType="number-pad" maxLength={3} testID="admin-res-openpana" /></View>
                <View style={{ flex: 1 }}><Input label="Open Digit" value={openDigit} onChangeText={setOpenDigit} keyboardType="number-pad" maxLength={1} testID="admin-res-opendigit" /></View>
              </View>
              <View style={{ height: 10 }} />
              <Input label="Jodi" value={jodi} onChangeText={setJodi} keyboardType="number-pad" maxLength={2} testID="admin-res-jodi" />
              <View style={{ height: 10 }} />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}><Input label="Close Pana" value={closePana} onChangeText={setClosePana} keyboardType="number-pad" maxLength={3} testID="admin-res-closepana" /></View>
                <View style={{ flex: 1 }}><Input label="Close Digit" value={closeDigit} onChangeText={setCloseDigit} keyboardType="number-pad" maxLength={1} testID="admin-res-closedigit" /></View>
              </View>

              <View style={{ height: 20 }} />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}><Button title="Cancel" variant="outline" onPress={() => setShowForm(false)} /></View>
                <View style={{ flex: 1 }}><Button title="Publish" onPress={submit} loading={saving} testID="admin-res-publish" /></View>
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
    borderBottomWidth: 0.5,
    borderColor: c.divider,
  },
  title: { color: c.onSurface, fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: c.brandPrimary,
  },
  newBtnText: { color: c.onBrandPrimary, fontSize: 13, fontWeight: "800", letterSpacing: 0.5 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  gameName: { color: c.onSurface, fontSize: 15, fontWeight: "700" },
  value: { color: c.brandPrimary, fontSize: 22, fontWeight: "800", letterSpacing: 2 },
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
