// Manual UPI payment flow — user picks a plan, sees UPI+QR, submits reference.
import Feather from "@react-native-vector-icons/feather";
import { useQuery } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";

import { ApiError, api } from "@/src/api";
import { Button, Card, Input, Muted } from "@/src/components/ui";
import { showToast } from "@/src/components/toast";
import { makeStyles, useTheme } from "@/src/theme";

export default function PaymentScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { planId } = useLocalSearchParams<{ planId: string }>();

  const [reference, setReference] = useState("");
  const [payerName, setPayerName] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const plansQ = useQuery({ queryKey: ["plans"], queryFn: api.plans });
  const cfgQ = useQuery({ queryKey: ["paymentConfig"], queryFn: api.paymentConfig });

  const plan = (plansQ.data ?? []).find((p) => p.id === planId);
  const cfg = cfgQ.data;

  const upiString = plan && cfg
    ? `upi://pay?pa=${encodeURIComponent(cfg.upi_id)}&pn=${encodeURIComponent(cfg.payee_name)}&am=${plan.price}&cu=INR&tn=${encodeURIComponent(`TOP ONE ${plan.name}`)}`
    : "";

  const copyUpi = async () => {
    if (!cfg?.upi_id) return;
    await Clipboard.setStringAsync(cfg.upi_id);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    showToast("UPI ID copied", "success");
  };

  const submit = async () => {
    if (!plan) return;
    if (reference.trim().length < 4) {
      showToast("Enter a valid reference (min 4 chars)", "warning");
      return;
    }
    setSubmitting(true);
    try {
      const p = await api.submitPayment({
        plan_id: plan.id,
        payment_reference: reference.trim(),
        payer_name: payerName.trim() || undefined,
        note: note.trim() || undefined,
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      showToast("Payment submitted for verification", "success");
      router.replace(`/payments/history?highlight=${p.id}` as any);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Could not submit payment";
      showToast(msg, "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (!plan) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <Muted>Plan not found</Muted>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 32 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        testID="payment-screen"
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8} testID="payment-back">
            <Feather name="chevron-left" size={24} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.title}>Manual Payment</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={{ paddingHorizontal: 20, gap: 14 }}>
          {/* Plan summary */}
          <Card testID="payment-plan-summary">
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View>
                <Muted style={{ fontSize: 10, letterSpacing: 3 }}>SELECTED PLAN</Muted>
                <Text style={styles.planName}>{plan.name}</Text>
                <Muted style={{ fontSize: 13, marginTop: 4 }}>{plan.tagline}</Muted>
              </View>
              <Text style={styles.price}>₹{plan.price}</Text>
            </View>
          </Card>

          {/* UPI + QR */}
          <Card testID="payment-upi-card">
            <Muted style={{ fontSize: 10, letterSpacing: 3, marginBottom: 8 }}>PAY VIA UPI</Muted>
            <View style={styles.upiRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.upiId} selectable testID="payment-upi-id">
                  {cfg?.upi_id ?? "—"}
                </Text>
                <Muted style={{ fontSize: 12, marginTop: 2 }}>{cfg?.payee_name ?? "TOP ONE"}</Muted>
              </View>
              <Pressable
                style={styles.copyBtn}
                onPress={copyUpi}
                testID="payment-copy-upi"
                accessibilityRole="button"
              >
                <Feather name="copy" size={14} color={colors.brandPrimary} />
                <Text style={styles.copyText}>Copy</Text>
              </Pressable>
            </View>

            <View style={styles.qrWrap}>
              <View style={styles.qrBox}>
                {upiString ? (
                  <QRCode
                    value={upiString}
                    size={180}
                    backgroundColor="#FFFFFF"
                    color="#09090B"
                  />
                ) : null}
              </View>
              <Muted style={{ fontSize: 11, marginTop: 8, letterSpacing: 1 }}>SCAN TO PAY ₹{plan.price}</Muted>
            </View>
          </Card>

          {/* Instructions */}
          {cfg?.instructions ? (
            <Card>
              <Muted style={{ fontSize: 10, letterSpacing: 3, marginBottom: 8 }}>HOW TO PAY</Muted>
              <Text style={styles.instructions}>{cfg.instructions}</Text>
            </Card>
          ) : null}

          {/* Submit form */}
          <Card testID="payment-submit-form">
            <Muted style={{ fontSize: 10, letterSpacing: 3, marginBottom: 8 }}>SUBMIT REFERENCE</Muted>
            <View style={{ gap: 12 }}>
              <Input
                label="UTR / Transaction ID"
                placeholder="e.g. 401234567890"
                value={reference}
                onChangeText={setReference}
                autoCapitalize="none"
                maxLength={40}
                testID="payment-input-reference"
              />
              <Input
                label="Your name (optional)"
                placeholder="Payer name"
                value={payerName}
                onChangeText={setPayerName}
                maxLength={40}
                testID="payment-input-name"
              />
              <Input
                label="Note (optional)"
                placeholder="Anything the team should know"
                value={note}
                onChangeText={setNote}
                maxLength={140}
                multiline
                numberOfLines={2}
                testID="payment-input-note"
              />
              <Button
                title={`Submit for verification — ₹${plan.price}`}
                fullWidth
                loading={submitting}
                onPress={submit}
                testID="payment-submit-cta"
              />
            </View>
          </Card>

          <View style={{ padding: 8 }}>
            <Muted style={{ fontSize: 11, textAlign: "center", lineHeight: 16 }}>
              Your subscription activates only after our team verifies the payment. Submitting a reference does not automatically activate access.
            </Muted>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.surface },
  header: {
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: { color: c.onSurface, fontSize: 22, fontWeight: "700" },
  planName: { color: c.onSurface, fontSize: 20, fontWeight: "800", marginTop: 4 },
  price: { color: c.brandPrimary, fontSize: 30, fontWeight: "800" },
  upiRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  upiId: { color: c.onSurface, fontSize: 18, fontWeight: "800", letterSpacing: 1 },
  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.brandPrimary,
  },
  copyText: { color: c.brandPrimary, fontSize: 12, fontWeight: "700" },
  qrWrap: { alignItems: "center", marginTop: 20 },
  qrBox: {
    padding: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: c.borderStrong,
  },
  instructions: { color: c.onSurfaceSecondary, fontSize: 14, lineHeight: 22 },
}));
