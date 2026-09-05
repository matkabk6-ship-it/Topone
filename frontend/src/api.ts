// TOP ONE API client. Handles device ID, session token, admin token.
// All calls go through the EXPO_PUBLIC_BACKEND_URL + /api prefix.

import Constants from "expo-constants";
import { Platform } from "react-native";

import { storage } from "@/src/utils/storage";

const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ??
  (Constants.expoConfig?.extra as { backendUrl?: string })?.backendUrl ??
  "";

if (!BACKEND_URL) {
  console.warn("[api] EXPO_PUBLIC_BACKEND_URL is not set");
}

export const API_BASE = `${BACKEND_URL}/api`;

const DEVICE_ID_KEY = "topone_device_id";
const SESSION_KEY = "topone_session_token";
const ADMIN_TOKEN_KEY = "topone_admin_token";

// --- key management ---------------------------------------------------------
function randomId(): string {
  // Fallback UUID: crypto if available, else Math.random-based
  const g: any = globalThis;
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  // RFC-ish v4
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await storage.secureGet(DEVICE_ID_KEY, null);
  if (typeof existing === "string" && existing.length >= 8) return existing;
  const id = `${randomId()}-${randomId()}`;
  await storage.secureSet(DEVICE_ID_KEY, id);
  return id;
}

export async function getSessionToken(): Promise<string | null> {
  const v = await storage.secureGet(SESSION_KEY, null);
  return typeof v === "string" ? v : null;
}

export async function setSessionToken(token: string): Promise<void> {
  await storage.secureSet(SESSION_KEY, token);
}

export async function clearSessionToken(): Promise<void> {
  await storage.secureRemove(SESSION_KEY);
}

export async function getAdminToken(): Promise<string | null> {
  const v = await storage.secureGet(ADMIN_TOKEN_KEY, null);
  return typeof v === "string" ? v : null;
}

export async function setAdminToken(token: string): Promise<void> {
  await storage.secureSet(ADMIN_TOKEN_KEY, token);
}

export async function clearAdminToken(): Promise<void> {
  await storage.secureRemove(ADMIN_TOKEN_KEY);
}

// --- fetch helpers ----------------------------------------------------------
export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request<T = unknown>(
  path: string,
  init: RequestInit = {},
  opts: { auth?: "user" | "admin" | "none"; timeoutMs?: number } = {},
): Promise<T> {
  const auth = opts.auth ?? "user";
  const headers = new Headers(init.headers as HeadersInit | undefined);
  headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");
  headers.set("X-Platform", Platform.OS);

  if (auth === "user") {
    const [token, deviceId] = await Promise.all([getSessionToken(), getOrCreateDeviceId()]);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    headers.set("X-Device-Id", deviceId);
  } else if (auth === "admin") {
    const token = await getAdminToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20000);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const message =
      (data && typeof data === "object" && "detail" in (data as Record<string, unknown>)
        ? String((data as Record<string, unknown>).detail)
        : `Request failed (${res.status})`) || `Request failed (${res.status})`;
    if (res.status === 401 && auth === "user") {
      // Session invalid: reset so we re-init on next launch
      await clearSessionToken();
    }
    if (res.status === 401 && auth === "admin") {
      await clearAdminToken();
    }
    throw new ApiError(message, res.status, data);
  }
  return data as T;
}

// --- Types -----------------------------------------------------------------
export type Plan = {
  id: "base" | "pro";
  name: string;
  price: number;
  currency: string;
  benefits: { open: number; jodi: number; pane: number };
  duration_days: number;
  tagline: string;
};

export type Game = {
  id: string;
  name: string;
  description: string;
  open_time: string | null;
  close_time: string | null;
  schedule_note: string;
  status: "active" | "inactive";
  sort_order: number;
  latest_result: Result | null;
};

export type Result = {
  id: string;
  game_id: string;
  date: string;
  session: "open" | "close";
  open_pana: string | null;
  open_digit: string | null;
  jodi: string | null;
  close_pana: string | null;
  close_digit: string | null;
  status: string;
  published_at: string | null;
  created_at: string | null;
};

export type Subscription = {
  id: string;
  user_id: string;
  plan_id: "base" | "pro";
  plan_name: string;
  status: "active" | "expired";
  activated_at: string | null;
  expires_at: string | null;
  benefits_total: { open: number; jodi: number; pane: number };
  benefits_remaining: { open: number; jodi: number; pane: number };
  linked_payment_id: string | null;
};

export type Payment = {
  id: string;
  user_id: string;
  top_one_id: string;
  plan_id: "base" | "pro";
  plan_name: string;
  amount: number;
  currency: string;
  payment_reference: string;
  payer_name: string | null;
  note: string | null;
  status: "pending" | "verified" | "rejected" | "cancelled";
  reject_reason: string | null;
  submitted_at: string | null;
  verified_at: string | null;
  verified_by: string | null;
};

export type UserProfile = {
  user_id: string;
  top_one_id: string;
  display_name: string | null;
  theme: "light" | "dark" | "system";
  notifications_enabled: boolean;
  sound_enabled: boolean;
  created_at: string | null;
};

export type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string | null;
};

export type Announcement = {
  id: string;
  title: string;
  message: string;
  active: boolean;
  created_at: string | null;
};

export type Tip = {
  id: string;
  game_id: string;
  tip_type: "open" | "jodi" | "pane";
  value: string;
  session: "open" | "close" | null;
  note: string | null;
  audience: "base" | "pro" | "both";
  for_date: string | null;
  created_at: string | null;
};

export type AdminInfo = {
  id: string;
  email: string;
  role: string;
};

// --- Public endpoints ------------------------------------------------------
export const api = {
  initUser: (device_id: string, display_name?: string) =>
    request<{ user_id: string; session_token: string; top_one_id: string; display_name: string | null; theme: string; is_new: boolean }>(
      "/users/init",
      { method: "POST", body: JSON.stringify({ device_id, display_name }) },
      { auth: "none" },
    ),

  me: () =>
    request<{ user: UserProfile; subscription: Subscription | null }>("/users/me"),

  updateMe: (payload: Partial<Pick<UserProfile, "display_name" | "theme" | "notifications_enabled" | "sound_enabled">>) =>
    request<UserProfile>("/users/me", { method: "PATCH", body: JSON.stringify(payload) }),

  logout: () => request<{ ok: boolean }>("/users/logout", { method: "POST" }),

  games: () => request<Game[]>("/games", {}, { auth: "none" }),
  game: (id: string) => request<Game>(`/games/${id}`, {}, { auth: "none" }),
  gameResults: (id: string, limit = 30) =>
    request<Result[]>(`/games/${id}/results?limit=${limit}`, {}, { auth: "none" }),
  allResults: (limit = 40) =>
    request<Result[]>(`/results?limit=${limit}`, {}, { auth: "none" }),

  plans: () => request<Plan[]>("/plans", {}, { auth: "none" }),
  mySubscription: () => request<{ subscription: Subscription | null }>("/subscriptions/me"),
  useBenefit: (benefit_type: "open" | "jodi" | "pane") =>
    request<Subscription>("/subscriptions/use-benefit", {
      method: "POST",
      body: JSON.stringify({ benefit_type }),
    }),

  paymentConfig: () =>
    request<{ upi_id: string; payee_name: string; instructions: string }>(
      "/payments/config",
      {},
      { auth: "none" },
    ),
  submitPayment: (body: { plan_id: "base" | "pro"; payment_reference: string; payer_name?: string; note?: string }) =>
    request<Payment>("/payments/submit", { method: "POST", body: JSON.stringify(body) }),
  myPayments: () => request<Payment[]>("/payments/me"),

  notifications: () => request<Notification[]>("/notifications"),
  markAllRead: () => request<{ ok: boolean }>("/notifications/read-all", { method: "POST" }),
  markRead: (id: string) => request<{ ok: boolean }>(`/notifications/${id}/read`, { method: "POST" }),

  announcements: () => request<Announcement[]>("/announcements", {}, { auth: "none" }),

  tips: () => request<{ tips: Tip[]; plan: "base" | "pro" | null }>("/tips"),

  createTicket: (body: { subject: string; message: string; category?: string }) =>
    request<{ id: string; status: string }>("/support/ticket", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

// --- Admin endpoints -------------------------------------------------------
export const adminApi = {
  login: (email: string, password: string, pin: string) =>
    request<{ access_token: string; token_type: string; admin: AdminInfo }>(
      "/admin/login",
      { method: "POST", body: JSON.stringify({ email, password, pin }) },
      { auth: "none" },
    ),
  me: () => request<AdminInfo>("/admin/me", {}, { auth: "admin" }),
  stats: () =>
    request<{ users: number; pending_payments: number; verified_payments: number; active_subscriptions: number; published_results: number; games: number }>(
      "/admin/stats",
      {},
      { auth: "admin" },
    ),
  users: (q?: string) => request<any[]>(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`, {}, { auth: "admin" }),
  user: (id: string) => request<any>(`/admin/users/${id}`, {}, { auth: "admin" }),
  games: () => request<Game[]>("/admin/games", {}, { auth: "admin" }),
  updateGame: (id: string, body: any) =>
    request<Game>(`/admin/games/${id}`, { method: "PATCH", body: JSON.stringify(body) }, { auth: "admin" }),
  results: (game_id?: string) =>
    request<Result[]>(`/admin/results${game_id ? `?game_id=${game_id}` : ""}`, {}, { auth: "admin" }),
  createResult: (body: any) =>
    request<Result>("/admin/results", { method: "POST", body: JSON.stringify(body) }, { auth: "admin" }),
  deleteResult: (id: string) =>
    request<{ ok: boolean }>(`/admin/results/${id}`, { method: "DELETE" }, { auth: "admin" }),
  payments: (status?: string) =>
    request<Payment[]>(`/admin/payments${status ? `?status_filter=${status}` : ""}`, {}, { auth: "admin" }),
  verifyPayment: (id: string, action: "verify" | "reject", reason?: string) =>
    request<Payment>(`/admin/payments/${id}/verify`, {
      method: "POST",
      body: JSON.stringify({ action, reason }),
    }, { auth: "admin" }),
  subscriptions: (status?: string) =>
    request<Subscription[]>(`/admin/subscriptions${status ? `?status_filter=${status}` : ""}`, {}, { auth: "admin" }),
  createNotification: (body: { audience: "all" | "user"; user_id?: string; type?: string; title: string; message: string }) =>
    request<Notification>("/admin/notifications", { method: "POST", body: JSON.stringify(body) }, { auth: "admin" }),
  announcements: () => request<Announcement[]>("/admin/announcements", {}, { auth: "admin" }),
  createAnnouncement: (body: { title: string; message: string; active?: boolean }) =>
    request<Announcement>("/admin/announcements", { method: "POST", body: JSON.stringify(body) }, { auth: "admin" }),
  deleteAnnouncement: (id: string) =>
    request<{ ok: boolean }>(`/admin/announcements/${id}`, { method: "DELETE" }, { auth: "admin" }),
  listTips: (audience?: "base" | "pro" | "both") =>
    request<Tip[]>(`/admin/tips${audience ? `?audience=${audience}` : ""}`, {}, { auth: "admin" }),
  createTip: (body: {
    game_id: string;
    tip_type: "open" | "jodi" | "pane";
    value: string;
    session?: "open" | "close";
    note?: string;
    audience: "base" | "pro" | "both";
    for_date?: string;
  }) =>
    request<Tip>("/admin/tips", { method: "POST", body: JSON.stringify(body) }, { auth: "admin" }),
  deleteTip: (id: string) =>
    request<{ ok: boolean }>(`/admin/tips/${id}`, { method: "DELETE" }, { auth: "admin" }),
  getPaymentSettings: () => request<any>("/admin/settings/payment", {}, { auth: "admin" }),
  updatePaymentSettings: (body: any) =>
    request<any>("/admin/settings/payment", { method: "PATCH", body: JSON.stringify(body) }, { auth: "admin" }),
  auditLogs: () => request<any[]>("/admin/audit-logs", {}, { auth: "admin" }),
  tickets: () => request<any[]>("/admin/support/tickets", {}, { auth: "admin" }),
};
