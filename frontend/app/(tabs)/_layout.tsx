// Bottom tab layout: Home / Games / Results / Notifications / Profile.
import Feather from "@react-native-vector-icons/feather";
import { Tabs } from "expo-router";
import { Platform, View } from "react-native";

import { useTheme } from "@/src/theme";

type IconName = React.ComponentProps<typeof Feather>["name"];

function TabIcon({ name, color, focused }: { name: IconName; color: string; focused: boolean }) {
  return (
    <View style={{ alignItems: "center", justifyContent: "center" }}>
      <Feather name={name} size={focused ? 22 : 20} color={color} />
    </View>
  );
}

export default function TabLayout() {
  const { colors, scheme } = useTheme();

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
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600", letterSpacing: 0.4 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => <TabIcon name="home" color={color} focused={focused} />,
          tabBarButtonTestID: "tab-home",
        }}
      />
      <Tabs.Screen
        name="games"
        options={{
          title: "Games",
          tabBarIcon: ({ color, focused }) => <TabIcon name="grid" color={color} focused={focused} />,
          tabBarButtonTestID: "tab-games",
        }}
      />
      <Tabs.Screen
        name="results"
        options={{
          title: "Results",
          tabBarIcon: ({ color, focused }) => <TabIcon name="trending-up" color={color} focused={focused} />,
          tabBarButtonTestID: "tab-results",
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Alerts",
          tabBarIcon: ({ color, focused }) => <TabIcon name="bell" color={color} focused={focused} />,
          tabBarButtonTestID: "tab-notifications",
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => <TabIcon name="user" color={color} focused={focused} />,
          tabBarButtonTestID: "tab-profile",
        }}
      />
    </Tabs>
  );
}
