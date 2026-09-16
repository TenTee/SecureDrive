import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { t } from "../i18n.js";
import { API_BASE } from "../config.js";

const box = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#f8fafc",
  padding: 16,
};

const card = {
  width: "100%",
  maxWidth: 420,
  background: "#fff",
  borderRadius: 16,
  padding: 32,
  boxShadow: "0 10px 40px rgba(15,23,42,0.08)",
};

const inputStyle = {
  width: "100%",
  marginTop: 6,
  marginBottom: 14,
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid #e2e8f0",
  boxSizing: "border-box",
  fontSize: "0.95rem",
};

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [, setTick] = useState(0);

  useEffect(() => {
    const onLang = () => setTick((x) => x + 1);
    window.addEventListener("sd-lang-change", onLang);
    return () => window.removeEventListener("sd-lang-change", onLang);
  }, []);

  function startCooldown() {
    setCooldown(300);
    const timer = setInterval(() => {
      setCooldown((s) => {
        if (s <= 1) {
          clearInterval(timer);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  async function sendCode() {
    setLoading(true);
    setError("");
    setInfo("");
    try {
      const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not send code");
        return false;
      }
      setInfo(t("codeSentInfo"));
      startCooldown();
      return true;
    } catch {
      setError("Cannot connect to server");
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailNext(e) {
    e.preventDefault();
    if (!email.trim()) return;
    const ok = await sendCode();
    if (ok) setStep(2);
  }

  async function handleResend() {
    if (cooldown > 0) return;
    await sendCode();
  }

  async function handleCodeNext(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/auth/verify-reset-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Invalid code");
        return;
      }
      setStep(3);
    } catch {
      setError("Cannot connect to server");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdatePassword(e) {
    e.preventDefault();
    setError("");
    if (newPassword !== confirm) {
      setError(t("passwordsMatch"));
      return;
    }
    if (newPassword.length < 8) {
      setError(t("reqLength"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          code: code.trim(),
          newPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not update password");
        return;
      }
      setInfo(t("passwordUpdatedRedirect"));
      setTimeout(() => navigate("/login"), 1500);
    } catch {
      setError("Cannot connect to server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={box}>
      <div style={card}>
        <h1 style={{ margin: "0 0 6px", fontSize: "1.4rem" }}>{t("forgotTitle")}</h1>
        <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: "0.9rem" }}>
          {t("stepOf")} {step} {t("of")} 3
        </p>

        {step === 1 && (
          <form onSubmit={handleEmailNext}>
            <label style={{ fontWeight: 600, fontSize: "0.85rem" }}>{t("email")}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@tentee.com"
              required
              style={inputStyle}
              autoFocus
            />
            {error && <p style={{ color: "#dc2626", fontSize: "0.9rem" }}>{error}</p>}
            <button type="submit" className="btn btn-solid" disabled={loading} style={{ width: "100%" }}>
              {loading ? t("sending") : t("next")}
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleCodeNext}>
            <p style={{ color: "#64748b", fontSize: "0.9rem", marginBottom: 12 }}>
              {t("codeSentFor")} <b>{email}</b>.
              <br />
              {t("devCodeHint")}
            </p>
            <label style={{ fontWeight: 600, fontSize: "0.85rem" }}>{t("code")}</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              maxLength={6}
              required
              style={inputStyle}
              autoFocus
            />
            {info && <p style={{ color: "#16a34a", fontSize: "0.85rem" }}>{info}</p>}
            {error && <p style={{ color: "#dc2626", fontSize: "0.9rem" }}>{error}</p>}

            <button type="submit" className="btn btn-solid" disabled={loading} style={{ width: "100%" }}>
              {loading ? t("checking") : t("next")}
            </button>

            <p style={{ marginTop: 14, fontSize: "0.85rem", color: "#64748b", textAlign: "center" }}>
              {cooldown > 0 ? (
                <>
                  {t("waitBeforeResend")} ({formatTime(cooldown)})
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={loading}
                  style={{
                    border: "none",
                    background: "none",
                    color: "#2563eb",
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  {t("resendCode")}
                </button>
              )}
            </p>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={handleUpdatePassword}>
            <label style={{ fontWeight: 600, fontSize: "0.85rem" }}>{t("newPasswordLabel")}</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              style={inputStyle}
              autoFocus
            />
            <label style={{ fontWeight: 600, fontSize: "0.85rem" }}>{t("confirmPasswordLabel")}</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              style={inputStyle}
            />
            {error && <p style={{ color: "#dc2626", fontSize: "0.9rem" }}>{error}</p>}
            {info && <p style={{ color: "#16a34a", fontSize: "0.9rem" }}>{info}</p>}
            <button type="submit" className="btn btn-solid" disabled={loading} style={{ width: "100%" }}>
              {loading ? t("updating") : t("updatePassword")}
            </button>
          </form>
        )}

        <p style={{ marginTop: 20, textAlign: "center" }}>
          <Link to="/login" style={{ color: "#2563eb" }}>
            {t("backToLogin")}
          </Link>
        </p>
      </div>
    </div>
  );
}