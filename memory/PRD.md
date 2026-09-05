# TOP ONE — Product Requirements

Premium members-only mobile app (Expo React Native, FastAPI, MongoDB) built for Sridevi, Kalyan, and Main Bazar tracking, with two manual-UPI subscription plans and a hidden admin control panel.

## What ships in v1

**User side**
- Auto-generated permanent membership ID (TOP-XXXXXXXX) on first launch — no login required.
- Onboarding: welcome → ID reveal + copy → optional profile setup.
- Bottom tabs: Home / Games / Results / Alerts / Profile.
- Home dashboard: glass ID card, active subscription card w/ remaining benefits, quick actions, live games strip, recent results, announcement banner.
- Games: Sridevi, Kalyan, Main Bazar with schedule, live status, latest result and history.
- Results feed with filter chips (all / per-game).
- Notifications tab with unread badges and "mark all read".
- Profile: avatar, ID, settings, legal pages, help & support, reset device.
- Settings: theme toggle (light / dark / system), display name, notifications & sound switches.
- Legal pages: Terms, Privacy, Subscription Terms, Payment & Refund, Responsible Use.
- Help & Support: FAQ + support ticket form.

**Subscription & payment**
- Two plans: **Base ₹299** (3 Open · 6 Jodi) and **Pro ₹599** (1 Open · 2 Jodi · 2 Pane), 30-day duration.
- Comparison screen and per-plan CTA.
- Manual UPI payment: displays configured UPI ID (`6303514885@ibl`), a native QR code (`react-native-qrcode-svg`), instructions, and a "submit UTR / transaction reference" form.
- Payment history with statuses: Pending / Verified / Rejected / Cancelled.
- **No auto-pay, no auto-renewal, no card storage.**
- Subscription activates *only* after admin verification.
- Benefits are tracked server-side and deducted via authenticated endpoint.

**Hidden admin panel** (Profile → tap version 5×, or `/admin/login`)
- Email + password + 6-digit PIN sign-in (rate-limited, bcrypt-hashed).
- Dashboard with stats: members, pending payments, verified payments, active subs, published results, games.
- Payments queue with Pending / Verified / Rejected filters; verify or reject with reason.
- Results publisher (per game / session / date).
- Broadcast tab: post announcements + push in-app alerts to all members.
- More tab: members list w/ search, active subscriptions summary, UPI settings editor (change UPI ID / payee name / instructions), immutable audit log, support tickets inbox, logout.

## Backend architecture (FastAPI + MongoDB via motor)
- Anonymous device sessions: `POST /api/users/init` returns TOP-ID + session token bound to hashed device ID.
- Every user API requires `Authorization: Bearer <session>` + `X-Device-Id` headers.
- Admin JWT (PyJWT, HS256, 120min) required for `/api/admin/*` routes.
- Audit log for every sensitive admin action (login, verify, reject, publish, delete, config changes).
- MongoDB indexes on user_id, device_id_hash, top_one_id, session token_hash, payment/subscription/result/audit ids.
- Config seeded on startup: 3 games (Sridevi / Kalyan / Main Bazar), payment settings, welcome announcement, admin from `.env`.

## Security posture
- Bcrypt (12 rounds) for admin password + PIN; both required.
- Session tokens are SHA-256 hashed at rest.
- JWT enforces `iss`, `role`, `exp`; rejects tampered/missing tokens with generic 401.
- Rate limit on admin login (8 attempts / 60s / IP).
- Users cannot: create/edit results, mark their own payment verified, activate their own subscription, or read another member's data.
- All timestamps stored tz-aware (UTC).

## Testing
- 22/22 backend pytest cases green (public + auth + payment flow + admin gate + audit + result publish).
- Playwright happy-path validated: onboarding → home → subscription → payment → admin gate + login.

## Test credentials
See `/app/memory/test_credentials.md`.
