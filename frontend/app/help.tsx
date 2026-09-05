// Help & Support: FAQ + contact form.
import Feather from "@react-native-vector-icons/feather";
import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { Button, Card, Input, Muted } from "@/src/components/ui";
import { showToast } from "@/src/components/toast";
import { makeStyles, useTheme } from "@/src/theme";

const FAQ = [
  {
    q: "What is my TOP ONE ID?",
    a: "A permanent, unique identifier for your membership. It's created automatically on your first launch and cannot be changed.",
  },
  {
    q: "How do subscriptions work?",
    a: "Choose a plan (Base or Pro), pay the exact amount via UPI, and submit your transaction reference. Our team verifies it and activates your subscription.",
  },
  {
    q: "Do subscriptions auto-renew?",
    a: "No. Subscriptions are manual, one-time purchases. When your plan expires you can purchase a new one from the Subscription screen.",
  },
  {
    q: "Where do results come from?",
    a: "Results are published exclusively by our team through a secure controlled workflow. Users cannot create or edit results.",
  },
  {
    q: "My payment was rejected — why?",
    a: "The team could not verify the payment reference you submitted. Check your UTR / transaction ID and resubmit. Contact us if you have proof of payment.",
  },
];

export default function Help() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<"general" | "payment" | "subscription" | "results">("general");
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState<number | null>(0);

  const submit = async () => {
    if (subject.trim().length < 3 || message.trim().length < 5) {
      showToast("Please enter a subject and message.", "warning");
      return;
    }
    setSending(true);
    try {
      await api.createTicket({ subject, message, category });
      showToast("Ticket submitted", "success");
      setSubject("");
      setMessage("");
    } catch {
      showToast("Failed to submit ticket", "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} testID="help-back">
          <Feather name="chevron-left" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Help & Support</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 14 }} keyboardShouldPersistTaps="handled" testID="help-screen">
        <Card>
          <Muted style={styles.label}>FREQUENTLY ASKED</Muted>
          <View style={{ marginTop: 6 }}>
            {FAQ.map((f, i) => (
              <View key={i}>
                <Pressable style={styles.faqRow} onPress={() => setOpen(open === i ? null : i)} testID={`faq-${i}`}>
                  <Text style={styles.faqQ}>{f.q}</Text>
                  <Feather name={open === i ? "chevron-up" : "chevron-down"} size={16} color={colors.muted} />
                </Pressable>
                {open === i ? <Text style={styles.faqA}>{f.a}</Text> : null}
                {i < FAQ.length - 1 ? <View style={styles.divider} /> : null}
              </View>
            ))}
          </View>
        </Card>

        <Card>
          <Muted style={styles.label}>CONTACT SUPPORT</Muted>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            {(["general", "payment", "subscription", "results"] as const).map((c) => {
              const active = category === c;
              return (
                <Pressable
                  key={c}
                  style={[styles.chip, active && { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary }]}
                  onPress={() => setCategory(c)}
                  testID={`help-cat-${c}`}
                >
                  <Text style={[styles.chipText, active && { color: colors.onBrandTertiary }]}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={{ height: 12 }} />
          <Input label="Subject" value={subject} onChangeText={setSubject} maxLength={80} testID="help-subject" />
          <View style={{ height: 10 }} />
          <Input
            label="Message"
            value={message}
            onChangeText={setMessage}
            multiline
            numberOfLines={4}
            style={{ minHeight: 100, textAlignVertical: "top" }}
            maxLength={800}
            testID="help-message"
          />
          <View style={{ height: 12 }} />
          <Button title="Submit ticket" fullWidth onPress={submit} loading={sending} testID="help-submit" />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
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
  label: { fontSize: 10, letterSpacing: 3 },
  faqRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 },
  faqQ: { color: c.onSurface, fontSize: 14, fontWeight: "600", flex: 1, paddingRight: 8 },
  faqA: { color: c.onSurfaceSecondary, fontSize: 13, lineHeight: 20, paddingBottom: 12 },
  divider: { height: 0.5, backgroundColor: c.divider },
  chip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    backgroundColor: c.surfaceTertiary,
  },
  chipText: { color: c.onSurfaceTertiary, fontSize: 12, fontWeight: "700" },
}));
