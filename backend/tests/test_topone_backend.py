"""End-to-end backend tests for TOP ONE API.

Covers: public endpoints, user session, notifications, payment flow (verify + reject),
subscriptions, admin auth/security, results, audit logs, announcements.
"""
import re
import time
import uuid

import pytest


# -------- Public --------
class TestPublic:
    def test_root(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/")
        assert r.status_code == 200
        assert r.json().get("status") == "ok"

    def test_health(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/health")
        assert r.status_code == 200
        assert r.json().get("status") == "ok"

    def test_games_list(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/games")
        assert r.status_code == 200
        games = r.json()
        ids = {g["id"] for g in games}
        assert {"sridevi", "kalyan", "main_bazar"}.issubset(ids)
        by_id = {g["id"]: g for g in games}
        assert by_id["sridevi"]["sort_order"] == 1
        assert by_id["kalyan"]["sort_order"] == 2
        assert by_id["main_bazar"]["sort_order"] == 3
        assert by_id["sridevi"]["name"] == "SRIDEVI"

    def test_plans(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/plans")
        assert r.status_code == 200
        plans = {p["id"]: p for p in r.json()}
        assert plans["base"]["price"] == 299
        assert plans["pro"]["price"] == 599
        assert plans["base"]["benefits"] == {"open": 3, "jodi": 6, "pane": 0}
        assert plans["pro"]["benefits"] == {"open": 1, "jodi": 2, "pane": 2}

    def test_announcements_has_welcome(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/announcements")
        assert r.status_code == 200
        anns = r.json()
        assert any("Welcome to TOP ONE" in a["title"] for a in anns)

    def test_payments_config(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/payments/config")
        assert r.status_code == 200
        cfg = r.json()
        assert cfg["upi_id"] == "6303514885@ibl"
        assert cfg.get("payee_name")


# -------- User session --------
@pytest.fixture(scope="module")
def user_ctx(api_client, base_url):
    device_id = f"TEST-device-{uuid.uuid4()}"
    r = api_client.post(f"{base_url}/api/users/init", json={"device_id": device_id})
    assert r.status_code == 200, r.text
    data = r.json()
    assert re.match(r"^TOP-[A-Z2-9]{8}$", data["top_one_id"])
    return {
        "device_id": device_id,
        "user_id": data["user_id"],
        "token": data["session_token"],
        "top_one_id": data["top_one_id"],
        "headers": {
            "Authorization": f"Bearer {data['session_token']}",
            "X-Device-Id": device_id,
            "Content-Type": "application/json",
        },
    }


class TestUserSession:
    def test_init_new_user(self, user_ctx):
        assert user_ctx["token"]
        assert user_ctx["user_id"]

    def test_init_idempotent(self, api_client, base_url, user_ctx):
        r = api_client.post(f"{base_url}/api/users/init", json={"device_id": user_ctx["device_id"]})
        assert r.status_code == 200
        assert r.json()["top_one_id"] == user_ctx["top_one_id"]
        assert r.json()["user_id"] == user_ctx["user_id"]

    def test_me_requires_auth(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/users/me")
        assert r.status_code == 401

    def test_me_authenticated(self, api_client, base_url, user_ctx):
        r = api_client.get(f"{base_url}/api/users/me", headers=user_ctx["headers"])
        assert r.status_code == 200
        j = r.json()
        assert j["user"]["top_one_id"] == user_ctx["top_one_id"]
        assert j["subscription"] is None


class TestNotifications:
    def test_welcome_notification_present(self, api_client, base_url, user_ctx):
        r = api_client.get(f"{base_url}/api/notifications", headers=user_ctx["headers"])
        assert r.status_code == 200
        notes = r.json()
        assert any("Welcome to TOP ONE" in n["title"] for n in notes)

    def test_read_all(self, api_client, base_url, user_ctx):
        r = api_client.post(f"{base_url}/api/notifications/read-all", headers=user_ctx["headers"])
        assert r.status_code == 200
        r2 = api_client.get(f"{base_url}/api/notifications", headers=user_ctx["headers"])
        assert all(n["read"] for n in r2.json())


# -------- Admin auth --------
ADMIN_EMAIL = "bipinkumar202425@gmail.com"
ADMIN_PASSWORD = "Ammu@0715"
ADMIN_PIN = "071525"


@pytest.fixture(scope="module")
def admin_headers(api_client, base_url):
    r = api_client.post(f"{base_url}/api/admin/login", json={
        "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD, "pin": ADMIN_PIN,
    })
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


class TestAdminAuth:
    def test_login_wrong_pin(self, api_client, base_url):
        r = api_client.post(f"{base_url}/api/admin/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD, "pin": "000000",
        })
        assert r.status_code == 401

    def test_stats_requires_auth(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/admin/stats")
        assert r.status_code == 401

    def test_users_requires_auth(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/admin/users")
        assert r.status_code == 401

    def test_payments_requires_auth(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/admin/payments")
        assert r.status_code == 401

    def test_admin_stats(self, api_client, base_url, admin_headers):
        r = api_client.get(f"{base_url}/api/admin/stats", headers=admin_headers)
        assert r.status_code == 200
        for k in ("users", "pending_payments", "verified_payments", "active_subscriptions"):
            assert k in r.json()


# -------- Payment flow (verify) --------
class TestPaymentVerifyFlow:
    def test_full_flow(self, api_client, base_url, user_ctx, admin_headers):
        ref = f"TEST_UTR_{uuid.uuid4().hex[:10]}"
        # submit
        r = api_client.post(
            f"{base_url}/api/payments/submit",
            headers=user_ctx["headers"],
            json={"plan_id": "base", "payment_reference": ref},
        )
        assert r.status_code == 200, r.text
        payment = r.json()
        assert payment["status"] == "pending"
        assert payment["amount"] == 299
        pid = payment["id"]

        # duplicate → 409
        dup = api_client.post(
            f"{base_url}/api/payments/submit",
            headers=user_ctx["headers"],
            json={"plan_id": "base", "payment_reference": ref},
        )
        assert dup.status_code == 409

        # GET /payments/me
        me = api_client.get(f"{base_url}/api/payments/me", headers=user_ctx["headers"])
        assert me.status_code == 200
        assert any(p["id"] == pid and p["status"] == "pending" for p in me.json())

        # verify
        v = api_client.post(
            f"{base_url}/api/admin/payments/{pid}/verify",
            headers=admin_headers,
            json={"action": "verify"},
        )
        assert v.status_code == 200, v.text
        assert v.json()["status"] == "verified"

        # subscription active
        s = api_client.get(f"{base_url}/api/subscriptions/me", headers=user_ctx["headers"])
        assert s.status_code == 200
        sub = s.json()["subscription"]
        assert sub is not None
        assert sub["status"] == "active"
        assert sub["plan_id"] == "base"
        assert sub["benefits_remaining"] == {"open": 3, "jodi": 6, "pane": 0}

        # use benefit
        u = api_client.post(
            f"{base_url}/api/subscriptions/use-benefit",
            headers=user_ctx["headers"],
            json={"benefit_type": "open"},
        )
        assert u.status_code == 200
        assert u.json()["benefits_remaining"]["open"] == 2


# -------- Payment flow (reject) --------
class TestPaymentRejectFlow:
    def test_reject(self, api_client, base_url, admin_headers):
        # Create fresh user (a previously-verified user has an active sub; still allowed to submit)
        device_id = f"TEST-reject-{uuid.uuid4()}"
        init = api_client.post(f"{base_url}/api/users/init", json={"device_id": device_id})
        assert init.status_code == 200
        d = init.json()
        headers = {
            "Authorization": f"Bearer {d['session_token']}",
            "X-Device-Id": device_id,
            "Content-Type": "application/json",
        }
        ref = f"TEST_REJ_{uuid.uuid4().hex[:10]}"
        r = api_client.post(
            f"{base_url}/api/payments/submit",
            headers=headers,
            json={"plan_id": "pro", "payment_reference": ref},
        )
        assert r.status_code == 200
        pid = r.json()["id"]

        rej = api_client.post(
            f"{base_url}/api/admin/payments/{pid}/verify",
            headers=admin_headers,
            json={"action": "reject", "reason": "TEST bad UTR"},
        )
        assert rej.status_code == 200
        body = rej.json()
        assert body["status"] == "rejected"
        assert body["reject_reason"] == "TEST bad UTR"

        # No active subscription
        s = api_client.get(f"{base_url}/api/subscriptions/me", headers=headers)
        assert s.status_code == 200
        assert s.json()["subscription"] is None


# -------- Result publishing --------
class TestResults:
    def test_publish_and_appear(self, api_client, base_url, admin_headers):
        today = time.strftime("%Y-%m-%d")
        r = api_client.post(
            f"{base_url}/api/admin/results",
            headers=admin_headers,
            json={"game_id": "sridevi", "date": today, "session": "open",
                  "open_pana": "123", "open_digit": "6", "jodi": "67"},
        )
        assert r.status_code == 200, r.text
        result_id = r.json()["id"]

        # In game results
        rr = api_client.get(f"{base_url}/api/games/sridevi/results")
        assert rr.status_code == 200
        assert any(res["id"] == result_id for res in rr.json())

        # In game.latest_result
        g = api_client.get(f"{base_url}/api/games/sridevi")
        assert g.status_code == 200
        latest = g.json().get("latest_result")
        assert latest and latest["id"] == result_id


# -------- Audit --------
class TestAudit:
    def test_audit_entries(self, api_client, base_url, admin_headers):
        r = api_client.get(f"{base_url}/api/admin/audit-logs", headers=admin_headers)
        assert r.status_code == 200
        actions = {a["action"] for a in r.json()}
        # Verify all admin actions from earlier tests are logged
        for expected in ("admin.login", "payment.verify", "payment.reject", "result.publish"):
            assert expected in actions, f"missing {expected} in {actions}"


# -------- Announcements admin --------
class TestAnnouncementAdmin:
    def test_create_and_visible(self, api_client, base_url, admin_headers):
        title = f"TEST Announcement {uuid.uuid4().hex[:6]}"
        r = api_client.post(
            f"{base_url}/api/admin/announcements",
            headers=admin_headers,
            json={"title": title, "message": "TEST ANN msg", "active": True},
        )
        assert r.status_code == 200, r.text
        aid = r.json()["id"]

        pub = api_client.get(f"{base_url}/api/announcements")
        assert pub.status_code == 200
        assert any(a["id"] == aid for a in pub.json())
