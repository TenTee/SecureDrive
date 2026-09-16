import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { t } from "../i18n.js";
import { API_BASE } from "../config.js";
import "./Login.css";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    const onLang = () => setTick((x) => x + 1);
    window.addEventListener("sd-lang-change", onLang);
    return () => window.removeEventListener("sd-lang-change", onLang);
  }, []);

  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const canSubmit = newPassword.length >= 8 && passwordsMatch && token;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;

    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Reset failed");
        setLoading(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => navigate("/login"), 1200);
    } catch {
      setError("Cannot connect to server");
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="login-screen">
        <div className="login-panel-right" style={{ margin: "auto" }}>
          <div className="login-form">
            <h2 className="login-form-title">{t("invalidLink")}</h2>
            <p className="login-form-subtitle">{t("invalidLinkSub")}</p>
            <button className="login-submit-btn" onClick={() => navigate("/login")}>
              {t("backToSignIn")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <div className="login-panel-right" style={{ margin: "auto" }}>
        <form className="login-form" onSubmit={handleSubmit}>
          <h2 className="login-form-title">{t("resetPasswordTitle")}</h2>
          <p className="login-form-subtitle">{t("resetPasswordSub")}</p>

          <label className="login-label">{t("newPassword")}</label>
          <div className="login-input-wrap">
            <input
              type="password"
              placeholder={t("newPasswordLabel")}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>

          <label className="login-label">{t("confirmNewPassword")}</label>
          <div className="login-input-wrap">
            <input
              type="password"
              placeholder={t("confirmPasswordLabel")}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          {confirmPassword && !passwordsMatch && (
            <p style={{ color: "#dc2626", fontSize: "0.78rem" }}>{t("passwordsMatch")}</p>
          )}
          {error && (
            <div style={{ color: "#ef4444", marginBottom: 12, fontSize: 14 }}>{error}</div>
          )}
          {success && (
            <div style={{ color: "#16a34a", marginBottom: 12, fontSize: 14 }}>
              {t("resetSuccess")}
            </div>
          )}

          <button type="submit" className="login-submit-btn" disabled={!canSubmit || loading}>
            {loading ? t("saving") : t("resetPasswordTitle")}
          </button>
        </form>
      </div>
    </div>
  );
}