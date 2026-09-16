import { useState, useEffect } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
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

const TAB_KEYS = [
  { id: "Profile", labelKey: "tabProfile" },
  { id: "Security", labelKey: "tabSecurity" },
  { id: "Sessions", labelKey: "tabSessions" },
  { id: "Privacy", labelKey: "tabPrivacy" },
];

export default function MyProfile() {
  const { user } = useOutletContext();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("Security");
  const [, setTick] = useState(0);

  useEffect(() => {
    const onLang = () => setTick((x) => x + 1);
    window.addEventListener("sd-lang-change", onLang);
    return () => window.removeEventListener("sd-lang-change", onLang);
  }, []);

  const storagePct = Math.round((user.storageUsedGB / user.storageTotalGB) * 100);

  function handleSignOut() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  }

  return (
    <div>
      <h2 className="page-heading">{t("myAccount")}</h2>
      <p className="page-subtext">{t("profileSub")}</p>

      <div className="profile-banner-card">
        <div className="profile-banner" />
        <div className="profile-banner-body">
          <div>
            <div
              className="profile-avatar-lg"
              style={{ background: user.avatarColor }}
            >
              {user.initials}
            </div>
          </div>
          <button className="btn btn-outline">✎ {t("editProfile")}</button>
        </div>
        <div style={{ padding: "0 24px 20px" }}>
          <div className="profile-name">{user.fullName}</div>
          <div className="profile-email">{user.email}</div>
        </div>
        <div className="profile-meta-row">
          <div>
            <div className="profile-meta-label">{t("employeeId")}</div>
            <div className="profile-meta-value">{user.employeeId}</div>
          </div>
          <div>
            <div className="profile-meta-label">{t("role")}</div>
            <div className="profile-meta-value">{user.role}</div>
          </div>
          <div>
            <div className="profile-meta-label">{t("department")}</div>
            <div className="profile-meta-value">{user.department}</div>
          </div>
          <div>
            <div className="profile-meta-label">{t("status")}</div>
            <div className="profile-meta-value">{user.status}</div>
          </div>
        </div>
      </div>

      <div className="dashboard-grid" style={{ marginBottom: 20 }}>
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">{t("storageUsage")}</span>
            <span className="tag tag-blue">{storagePct}%</span>
          </div>
          <div className="sidebar-storage-track" style={{ height: 6 }}>
            <div
              className="sidebar-storage-fill"
              style={{ width: `${storagePct}%` }}
            />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 8,
              fontSize: "0.8rem",
              color: "var(--text-secondary)",
            }}
          >
            <span>
              {user.storageUsedGB} {t("gbUsed")}
            </span>
            <span>
              {(user.storageTotalGB - user.storageUsedGB).toFixed(1)} {t("gbFree")}
            </span>
            <span>
              {user.storageTotalGB} {t("gbTotal")}
            </span>
          </div>
        </div>
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">{t("quickStats")}</span>
          </div>
          <div
            className="activity-row"
            style={{ display: "flex", justifyContent: "space-between" }}
          >
            <span>{t("filesOwned")}</span>
            <b>{user.filesOwned}</b>
          </div>
          <div
            className="activity-row"
            style={{ display: "flex", justifyContent: "space-between" }}
          >
            <span>{t("sharedByMeStat")}</span>
            <b>{user.sharedByMeCount}</b>
          </div>
          <div
            className="activity-row"
            style={{
              display: "flex",
              justifyContent: "space-between",
              borderBottom: "none",
            }}
          >
            <span>{t("lastLogin")}</span>
            <b>{user.lastLogin}</b>
          </div>
        </div>
      </div>

      <div className="profile-tabs">
        {TAB_KEYS.map((tab) => (
          <button
            key={tab.id}
            className={`profile-tab${activeTab === tab.id ? " active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      <div className="panel" style={{ maxWidth: 480 }}>
        {activeTab === "Profile" && <ProfileTab user={user} />}
        {activeTab === "Security" && <SecurityTab />}
        {activeTab === "Sessions" && <SessionsTab />}
        {activeTab === "Privacy" && <PrivacyTab />}
      </div>

      <button
        className="btn btn-danger"
        style={{ marginTop: 20 }}
        onClick={handleSignOut}
      >
        &#8618; {t("signOut")}
      </button>
    </div>
  );
}

function ProfileTab({ user }) {
  return (
    <div>
      <div className="form-group">
        <label className="form-label">{t("fullName")}</label>
        <input className="form-input" defaultValue={user.fullName} />
      </div>
      <div className="form-group">
        <label className="form-label">{t("corporateEmail")}</label>
        <input className="form-input" defaultValue={user.email} disabled />
      </div>
      <div className="form-group">
        <label className="form-label">{t("department")}</label>
        <input className="form-input" defaultValue={user.department} disabled />
      </div>
      <button className="btn btn-solid">{t("saveChanges")}</button>
    </div>
  );
}

function SecurityTab() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { checks, score, label, barClass } = getStrength(newPassword);
  const passwordsMatch =
    newPassword.length > 0 && newPassword === confirmPassword;
  const canSubmit =
    score === 4 && passwordsMatch && currentPassword.length > 0;

  async function handleSave(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setError("");
    setLoading(true);

    try {
      const token = localStorage.getItem("token");
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

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setError("Cannot connect to server. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSave}>
      <p
        style={{
          fontSize: "0.85rem",
          color: "var(--text-secondary)",
          marginBottom: 18,
        }}
      >
        {t("securityHint")}
      </p>

      <div className="form-group">
        <label className="form-label">{t("currentPassword")}</label>
        <input
          type="password"
          className="form-input"
          placeholder={t("currentPassword")}
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label className="form-label">{t("newPassword")}</label>
        <input
          type="password"
          className="form-input"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
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
      </div>

      <div className="form-group">
        <label className="form-label">{t("confirmNewPassword")}</label>
        <input
          type="password"
          className="form-input"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        {confirmPassword.length > 0 && !passwordsMatch && (
          <p style={{ color: "#dc2626", fontSize: "0.78rem", marginTop: 6 }}>
            {t("passwordsMatch")}
          </p>
        )}
      </div>

      <div className="password-requirements">
        <div className="password-requirements-title">
          {t("passwordRequirements")}
        </div>
        <Requirement met={checks.length} text={t("reqLength")} />
        <Requirement met={checks.upper} text={t("reqUpper")} />
        <Requirement met={checks.number} text={t("reqNumber")} />
        <Requirement met={checks.special} text={t("reqSpecial")} />
      </div>

      {error && (
        <div style={{ color: "#ef4444", marginTop: 12, fontSize: "0.82rem" }}>
          {error}
        </div>
      )}

      <button
        type="submit"
        className="btn btn-solid"
        style={{ marginTop: 16 }}
        disabled={!canSubmit || loading}
      >
        {saved
          ? t("passwordUpdated")
          : loading
            ? t("updating")
            : t("saveNewPassword")}
      </button>
    </form>
  );
}

function Requirement({ met, text }) {
  return (
    <div className={`password-requirement ${met ? "met" : ""}`}>
      <span>{met ? "✓" : "○"}</span> {text}
    </div>
  );
}

function SessionsTab() {
  return (
    <div>
      <div className="activity-row">
        <div className="activity-text">
          <b>{t("thisDevice")}</b> — Chrome on Windows
        </div>
        <div className="activity-time">{t("activeNow")}</div>
      </div>
      <div className="activity-row" style={{ borderBottom: "none" }}>
        <div className="activity-text">
          <b>iPhone 15</b> — SecureDrive Mobile
        </div>
        <div className="activity-time">2 days ago</div>
      </div>
    </div>
  );
}

function PrivacyTab() {
  return (
    <div>
      <p style={{ fontSize: "0.87rem", color: "var(--text-secondary)" }}>
        {t("privacyText")}
      </p>
    </div>
  );
}