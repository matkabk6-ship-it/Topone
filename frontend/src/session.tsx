// Session bootstrap: reads/creates the anonymous device user on launch.
// Also owns the current user profile + subscription snapshot, refreshable.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  api,
  ApiError,
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
      // 1. Read persisted state up front — do this even if the network is down
      //    so we know whether to route to onboarding or tabs on relaunch.
      const [existingToken, onboardedRaw] = await Promise.all([
        getSessionToken(),
        storage.getItem(HAS_ONBOARDED_KEY, false),
      ]);
      setHasOnboarded(onboardedRaw === true);

      // 2. If we have no session yet, create one now (first launch on this device).
      if (!existingToken) {
        const deviceId = await getOrCreateDeviceId();
        const init = await api.initUser(deviceId);
        await setSessionToken(init.session_token);
      }

      // 3. Hydrate the current profile from the backend. If the network fails
      //    we keep the stored session token so a future launch can reuse it.
      try {
        const me = await api.me();
        setUser(me.user);
        setSubscription(me.subscription);
        if (me.user?.theme) setColorScheme(me.user.theme as any);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          // The backend explicitly invalidated our session — clear and re-init
          // with the SAME device id so the user keeps their permanent TOP-ID.
          await clearSessionToken();
          const deviceId = await getOrCreateDeviceId();
          const init = await api.initUser(deviceId);
          await setSessionToken(init.session_token);
          const me = await api.me();
          setUser(me.user);
          setSubscription(me.subscription);
          if (me.user?.theme) setColorScheme(me.user.theme as any);
        } else {
          // Transient / network error — do NOT clear the token. The app will
          // render with stale/empty data and screens can retry.
          console.warn("[session] hydrate failed (offline?)", err);
        }
      }
    } catch (e) {
      console.warn("[session] bootstrap failed", e);
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
