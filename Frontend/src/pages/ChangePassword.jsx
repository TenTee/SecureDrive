import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { t } from "../i18n.js";
import { API_BASE } from "../config.js";
import "./Login.css";

function getStrength(pwd) {
  const checks = {
    length: pwd.length >= 8,
    upper: /[A-Z]/.test(pwd),
    number: /[0-9]/.test(pwd),
    special: /[^A-Za-z0-9]/.test(pwd),
  };
  const score = Object.values(checks).filter(Boolean).length;
  const labels = ["", t("weak"), t("fair"), t("good"), t("strong")];
  const classes = ["", "filled-weak", "filled-fair", "filled-good", "filled-strong"];
  return { checks, score, label: labels[score], barClass: classes[score] };
}

export default function ChangePassword() {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [, setTick] = useState(0);

  const { checks, score, label, barClass } = getStrength(newPassword);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const canSubmit = score === 4 && passwordsMatch && currentPassword.length > 0;

  useEffect(() => {
    const onLang = () => setTick((x) => x + 1);
    window.addEventListener("sd-lang-change", onLang);
    return () => window.removeEventListener("sd-lang-change", onLang);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) navigate("/login");
  }, [navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;

    setError("");
    setLoading(true);

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setError("You must be logged in");
        setLoading(false);
        navigate("/login");
        return;
      }

      const res = await fetch(`${API_BASE}/api/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        setLoading(false);
        return;
      }

      setSubmitted(true);
      setTimeout(() => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        navigate("/login");
      }, 900);
    } catch {
      setError("Cannot connect to server. Is the backend running?");
      setLoading(false);
    }
  }

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

      <div className="login-panel-right">
        <form className="login-form" onSubmit={handleSubmit}>
          <h2 className="login-form-title">{t("changePasswordTitle")}</h2>
          <p className="login-form-subtitle">{t("changePasswordSub")}</p>

          <label className="login-label">{t("currentPassword")}</label>
          <div className="login-input-wrap">
            <LockIcon />
            <input
              type="password"
              placeholder={t("passwordGivenByAdmin")}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>

          <label className="login-label">{t("newPassword")}</label>
          <div className="login-input-wrap">
            <LockIcon />
            <input
              type="password"
              placeholder={t("enterNewPassword")}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>
          {newPassword.length > 0 && (
            <>
              <div className="password-strength-track">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`password-strength-bar ${i < score ? barClass : ""}`}
                  />
                ))}
              </div>
              <div
                className="password-strength-label"
                style={{ color: score === 4 ? "#16a34a" : "#64748b" }}
              >
                {label}
              </div>
            </>
          )}

          <label className="login-label">{t("confirmNewPassword")}</label>
          <div className="login-input-wrap">
            <LockIcon />
            <input
              type="password"
              placeholder={t("reenterPassword")}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          {confirmPassword.length > 0 && !passwordsMatch && (
            <p style={{ color: "#dc2626", fontSize: "0.78rem", marginTop: "6px" }}>
              {t("passwordsMatch")}
            </p>
          )}

          <div className="password-requirements">
            <div className="password-requirements-title">{t("passwordRequirements")}</div>
            <Requirement met={checks.length} text={t("reqLength")} />
            <Requirement met={checks.upper} text={t("reqUpper")} />
            <Requirement met={checks.number} text={t("reqNumber")} />
            <Requirement met={checks.special} text={t("reqSpecial")} />
          </div>

          {error && (
            <div style={{ color: "#ef4444", marginBottom: "12px", fontSize: "14px" }}>
              {error}
            </div>
          )}

          <button type="submit" className="login-submit-btn" disabled={!canSubmit || loading}>
            {submitted
              ? t("passwordUpdated")
              : loading
                ? t("updating")
                : t("setNewPassword")}
          </button>

          <p className="login-footer-note">
            <a
              href="/login"
              onClick={(e) => {
                e.preventDefault();
                navigate("/login");
              }}
            >
              &larr; {t("backToSignIn")}
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}

function Requirement({ met, text }) {
  return (
    <div className={`password-requirement ${met ? "met" : ""}`}>
      <span>{met ? "✓" : "○"}</span> {text}
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
function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 018 0v3" />
    </svg>
  );
}