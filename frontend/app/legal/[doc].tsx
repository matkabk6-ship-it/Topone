// Legal pages: terms, privacy, subscription-terms, refund, responsible-use.
import Feather from "@react-native-vector-icons/feather";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, Text, View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Muted } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

const DOCS: Record<string, { title: string; body: string[] }> = {
  terms: {
    title: "Terms of Service",
    body: [
      "Welcome to TOP ONE. By using this application you agree to the terms below.",
      "You are responsible for maintaining the confidentiality of your device and TOP ONE ID.",
      "You must be of the legal age required by your jurisdiction to use this application.",
      "TOP ONE provides information and utility features. We do not guarantee any particular outcome.",
      "The application may be updated, suspended or discontinued at our discretion.",
      "By using the app you agree to comply with all applicable local laws and regulations.",
    ],
  },
  privacy: {
    title: "Privacy Policy",
    body: [
      "TOP ONE stores minimal information required to operate the service.",
      "We store a hashed device identifier, an anonymous membership ID (TOP-XXXXXXXX), optional profile information you provide, and your payment submissions.",
      "We do not sell your personal information.",
      "You can reset your membership from Profile → Reset device, which detaches this device from the current TOP ONE ID.",
      "Please contact support through the Help screen for any privacy request.",
    ],
  },
  "subscription-terms": {
    title: "Subscription Terms",
    body: [
      "TOP ONE offers exactly two subscription plans: Base (₹299) and Pro (₹599). Both are manual, one-time purchases.",
      "There is no auto-renewal. When your subscription expires you must manually purchase a new plan.",
      "Base benefits: 3 Open, 6 Jodi. Pro benefits: 1 Open, 2 Jodi, 2 Pane. Benefits reset with each new purchase.",
      "Subscriptions activate only after our team verifies the payment reference you submit.",
      "We do not store card, UPI PIN or bank credentials. Payments are made externally via UPI apps.",
    ],
  },
  refund: {
    title: "Payment & Refund Policy",
    body: [
      "All payments to TOP ONE are made manually by the user through UPI to the account displayed in the Manual Payment screen.",
      "If you submit an incorrect or unverifiable payment reference, your submission may be rejected. Rejected submissions do not activate a subscription.",
      "If you were charged but the corresponding subscription was not activated in error, please contact support with proof of payment for review.",
      "Refunds are granted at the sole discretion of TOP ONE and only in cases of verified duplicate payment or team error.",
    ],
  },
  "responsible-use": {
    title: "Responsible Use",
    body: [
      "TOP ONE does not guarantee winnings, profit, returns, or risk-free participation of any kind.",
      "Any information displayed inside the application, including results, is provided for informational purposes only.",
      "Do not spend money you cannot afford to lose. If you feel your usage is becoming compulsive, please seek help from a qualified support organization.",
      "The user is solely responsible for complying with the laws and regulations of their jurisdiction.",
    ],
  },
};

export default function LegalDoc() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { doc } = useLocalSearchParams<{ doc: string }>();

  const content = DOCS[doc ?? "terms"] ?? DOCS.terms;

  return (
    <View style={styles.container} testID="legal-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} testID="legal-back">
          <Feather name="chevron-left" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{content.title}</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Muted style={{ fontSize: 11, letterSpacing: 2 }}>LAST UPDATED · 2026</Muted>
        <View style={{ height: 12 }} />
        {content.body.map((p, i) => (
          <Text key={i} style={styles.paragraph}>
            {p}
          </Text>
        ))}
        <View style={{ height: 24 }} />
        <Muted style={{ fontSize: 11, textAlign: "center" }}>
          Deployed operators are responsible for verifying compliance with applicable laws before launch.
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
  title: { color: c.onSurface, fontSize: 20, fontWeight: "700" },
  paragraph: { color: c.onSurfaceSecondary, fontSize: 14, lineHeight: 22, marginBottom: 12 },
}));
