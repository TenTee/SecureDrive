import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { t, getLang, setLang } from "../i18n.js";
import { API_BASE } from "../config.js";
import "./Login.css";

function langBtnStyle(active) {
  return {
    border: "none",
    background: active ? "#e2e8f0" : "transparent",
    color: active ? "#0f172a" : "#94a3b8",
    fontWeight: active ? 700 : 500,
    fontSize: "0.75rem",
    padding: "4px 8px",
    borderRadius: 6,
    cursor: "pointer",
    letterSpacing: "0.02em",
  };
}

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    const onLang = () => setTick((x) => x + 1);
    window.addEventListener("sd-lang-change", onLang);
    return () => window.removeEventListener("sd-lang-change", onLang);
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Login failed");
        setLoading(false);
        return;
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      if (data.user?.mustChangePassword || data.mustChangePassword) {
        navigate("/change-password");
      } else {
        navigate("/admin/dashboard");
      }
    } catch {
      setError("Cannot connect to server. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  const lang = getLang();

  return (
    <div className="login-screen">
      <div className="login-panel-left">
        <div className="login-brand">
          <div className="login-brand-icon">
            <ShieldIcon />
          </div>
          <div>
            <div className="login-brand-name">
              Secure<span>Drive</span>
            </div>
            <div className="login-brand-tagline">{t("enterpriseTagline")}</div>
          </div>
        </div>

        <div className="login-badges">
          <span className="login-badge">ENCRYPTION</span>
          <span className="login-badge">RBAC</span>
          <span className="login-badge">AUDIT</span>
        </div>

        <h1 className="login-headline">{t("loginHeadline")}</h1>
        <p className="login-description">{t("loginDescription")}</p>

        <div className="login-stats">
          <div>
            <div className="login-stat-value">2.4M+</div>
            <div className="login-stat-label">{t("filesProtected")}</div>
          </div>
          <div>
            <div className="login-stat-value">340</div>
            <div className="login-stat-label">{t("activeUsersLabel")}</div>
          </div>
          <div>
            <div className="login-stat-value">99.9%</div>
            <div className="login-stat-label">{t("uptimeSla")}</div>
          </div>
        </div>
      </div>

      <div className="login-panel-right" style={{ position: "relative" }}>
        <div
          style={{
            position: "absolute",
            top: 20,
            right: 24,
            display: "flex",
            gap: 4,
            zIndex: 2,
          }}
        >
          <button type="button" onClick={() => setLang("en")} style={langBtnStyle(lang === "en")}>
            EN
          </button>
          <button type="button" onClick={() => setLang("fr")} style={langBtnStyle(lang === "fr")}>
            FR
          </button>
        </div>

        <form className="login-form" onSubmit={handleSubmit} style={{ paddingTop: 12 }}>
          <h2 className="login-form-title">{t("welcomeBack")}</h2>
          <p className="login-form-subtitle">{t("signInSubtitle")}</p>

          <label className="login-label">{t("corporateEmail")}</label>
          <div className="login-input-wrap">
            <MailIcon />
            <input
              type="email"
              placeholder="you@securedrive.corp"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <label className="login-label">{t("password")}</label>
          <div className="login-input-wrap">
            <LockIcon />
            <input
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className="login-eye-btn"
              onClick={() => setShowPassword((s) => !s)}
              aria-label="Toggle password"
            >
              <EyeIcon off={showPassword} />
            </button>
          </div>

          <div className="options-row">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              {t("rememberDevice")}
            </label>
            <button
              type="button"
              className="forgot-password-link"
              onClick={() => navigate("/forgot-password")}
            >
              {t("forgotPasswordLink")}
            </button>
          </div>

          {error && (
            <div style={{ color: "#ef4444", marginBottom: "12px", fontSize: "14px" }}>
              {error}
            </div>
          )}

          <button type="submit" className="login-submit-btn" disabled={loading}>
            {loading ? t("signingIn") : t("signIn")}
          </button>

          <div className="login-security-note">
            <LockIcon small /> {t("securedNote")}
          </div>

          <p className="login-footer-note">
            {t("noAccount")} <a href="#contact">{t("itAdmin")}</a>
          </p>
        </form>
      </div>
    </div>
  );
}

function ShieldIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
      <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M2 6l10 7L22 6" />
    </svg>
  );
}

function LockIcon({ small }) {
  const s = small ? 12 : 16;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 018 0v3" />
    </svg>
  );
}

function EyeIcon({ off }) {
  return off ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
      <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M6.5 6.7C4 8.3 2.3 10.6 1 12c1.7 3 5.6 7 11 7 1.8 0 3.4-.4 4.8-1.1M17.9 17.9C20 16.3 21.7 14 23 12c-1.7-3-5.6-7-11-7-1 0-1.9.1-2.8.4" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}