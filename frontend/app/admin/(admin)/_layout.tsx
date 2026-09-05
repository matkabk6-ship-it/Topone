// Admin section — guards that a valid admin token exists.
import Feather from "@react-native-vector-icons/feather";
import { Tabs, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, View } from "react-native";

import { adminApi, clearAdminToken, getAdminToken } from "@/src/api";
import { useTheme } from "@/src/theme";

type IconName = React.ComponentProps<typeof Feather>["name"];

export default function AdminLayout() {
  const { colors } = useTheme();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    (async () => {
      const t = await getAdminToken();
      if (!t) {
        setReady(true);
        router.replace("/admin/login");
        return;
      }
      try {
        await adminApi.me();
        setOk(true);
      } catch {
        await clearAdminToken();
        router.replace("/admin/login");
      } finally {
        setReady(true);
      }
    })();
  }, [router]);

  if (!ready || !ok) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 0.5,
          ...(Platform.OS === "web" ? { height: 64 } : {}),
        },
        tabBarItemStyle: { alignSelf: "center" },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "700", letterSpacing: 0.4 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color }) => <Feather name="pie-chart" size={20} color={color} />,
          tabBarButtonTestID: "admin-tab-dashboard",
        }}
      />
      <Tabs.Screen
        name="payments"
        options={{
          title: "Payments",
          tabBarIcon: ({ color }) => <Feather name="credit-card" size={20} color={color} />,
          tabBarButtonTestID: "admin-tab-payments",
        }}
      />
      <Tabs.Screen
        name="results"
        options={{
          title: "Results",
          tabBarIcon: ({ color }) => <Feather name="trending-up" size={20} color={color} />,
          tabBarButtonTestID: "admin-tab-results",
        }}
      />
      <Tabs.Screen
        name="broadcast"
        options={{
          title: "Broadcast",
          tabBarIcon: ({ color }) => <Feather name="send" size={20} color={color} />,
          tabBarButtonTestID: "admin-tab-broadcast",
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: ({ color }) => <Feather name="menu" size={20} color={color} />,
          tabBarButtonTestID: "admin-tab-more",
        }}
      />
    </Tabs>
  );
}
