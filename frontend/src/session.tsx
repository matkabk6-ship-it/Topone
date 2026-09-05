// Session bootstrap: reads/creates the anonymous device user on launch.
// Also owns the current user profile + subscription snapshot, refreshable.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  api,
  clearSessionToken,
  getOrCreateDeviceId,
  getSessionToken,
  setSessionToken,
  UserProfile,
  Subscription,
} from "@/src/api";
import { setColorScheme } from "@/src/theme";
import { storage } from "@/src/utils/storage";

const HAS_ONBOARDED_KEY = "topone_has_onboarded";

type SessionCtx = {
  ready: boolean;
  hasOnboarded: boolean;
  user: UserProfile | null;
  subscription: Subscription | null;
  refresh: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [hasOnboarded, setHasOnboarded] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const qc = useQueryClient();

  const bootstrap = useCallback(async () => {
    try {
      const [existingToken, onboardedRaw] = await Promise.all([
        getSessionToken(),
        storage.getItem(HAS_ONBOARDED_KEY, false),
      ]);
      setHasOnboarded(onboardedRaw === true);
      if (!existingToken) {
        const deviceId = await getOrCreateDeviceId();
        const init = await api.initUser(deviceId);
        await setSessionToken(init.session_token);
      }
      const me = await api.me();
      setUser(me.user);
      setSubscription(me.subscription);
      if (me.user?.theme) setColorScheme(me.user.theme as any);
    } catch (e) {
      console.warn("[session] bootstrap failed", e);
      // Try one full reset + re-init if the token was invalid
      try {
        await clearSessionToken();
        const deviceId = await getOrCreateDeviceId();
        const init = await api.initUser(deviceId);
        await setSessionToken(init.session_token);
        const me = await api.me();
        setUser(me.user);
        setSubscription(me.subscription);
        if (me.user?.theme) setColorScheme(me.user.theme as any);
      } catch (err) {
        console.warn("[session] fallback failed", err);
      }
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const refresh = useCallback(async () => {
    try {
      const me = await api.me();
      setUser(me.user);
      setSubscription(me.subscription);
      qc.invalidateQueries();
    } catch (e) {
      console.warn("[session] refresh failed", e);
    }
  }, [qc]);

  const completeOnboarding = useCallback(async () => {
    await storage.setItem(HAS_ONBOARDED_KEY, true);
    setHasOnboarded(true);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // ignore
    }
    await clearSessionToken();
    await storage.removeItem(HAS_ONBOARDED_KEY);
    setHasOnboarded(false);
    setUser(null);
    setSubscription(null);
    // Re-init fresh
    await bootstrap();
  }, [bootstrap]);

  const value = useMemo<SessionCtx>(
    () => ({ ready, hasOnboarded, user, subscription, refresh, completeOnboarding, signOut }),
    [ready, hasOnboarded, user, subscription, refresh, completeOnboarding, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession must be inside SessionProvider");
  return v;
}

// Convenience hook that refetches active subscription
export function useSubscriptionQuery() {
  return useQuery({
    queryKey: ["subscription"],
    queryFn: async () => (await api.mySubscription()).subscription,
    staleTime: 60_000,
  });
}
