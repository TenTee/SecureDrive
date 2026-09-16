import { useEffect, useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { t } from "../i18n.js";
import { API_BASE } from "../config.js";

export default function SystemSettings() {
  const { user } = useOutletContext();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);

  useEffect(() => {
    const onLang = () => setTick((x) => x + 1);
    window.addEventListener("sd-lang-change", onLang);
    return () => window.removeEventListener("sd-lang-change", onLang);
  }, []);

  useEffect(() => {
    if (user && user.role !== "Super Admin") {
      navigate("/admin/dashboard");
    }
  }, [user, navigate]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API_BASE}/api/dashboard`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok) setStats(data.stats || null);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function formatBytes(bytes) {
    if (!bytes) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div>
      <h2 className="page-heading">{t("systemSettings")}</h2>
      <p className="page-subtext">{t("settingsSub")}</p>

      <div className="dashboard-grid" style={{ marginTop: 8 }}>
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">{t("platform")}</span>
          </div>
          <InfoRow label={t("application")} value="SecureDrive" />
          <InfoRow label={t("environment")} value={t("development")} />
          <InfoRow label={t("frontend")} value="React + Vite" />
          <InfoRow label={t("backend")} value="Node.js + Express" />
          <InfoRow label={t("database")} value="PostgreSQL (Neon)" />
        </div>

        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">{t("storageS3")}</span>
          </div>
          <InfoRow label={t("provider")} value="Amazon S3" />
          <InfoRow label={t("bucket")} value="drivetentee" />
          <InfoRow label={t("encryption")} value="AES-256 (SSE-S3)" />
          <InfoRow label={t("accessModel")} value={t("backendProxy")} />
          <InfoRow
            label={t("filesInS3")}
            value={loading ? "…" : stats ? String(stats.filesCount) : "—"}
          />
          <InfoRow
            label={t("storageUsed")}
            value={loading ? "…" : stats ? formatBytes(stats.storageBytes) : "—"}
          />
        </div>

        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">{t("security")}</span>
          </div>
          <InfoRow label={t("authentication")} value="JWT + bcrypt" />
          <InfoRow label={t("session")} value={t("tokenHours")} />
          <InfoRow label={t("fileIsolation")} value="uploads/{userId}/" />
          <InfoRow label={t("sharePermissions")} value={t("readOnlyReadWrite")} />
          <InfoRow label={t("assumeRole")} value={t("pendingIam")} />
        </div>

        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">{t("appRoles")}</span>
          </div>
          <InfoRow label="Super Admin" value={t("roleSuperAdmin")} />
          <InfoRow label="Manager" value={t("roleManager")} />
          <InfoRow label="User" value={t("roleUser")} />
          <InfoRow
            label={t("totalUsers")}
            value={loading ? "…" : stats ? String(stats.totalUsers) : "—"}
          />
          <InfoRow
            label={t("activeAccounts")}
            value={loading ? "…" : stats ? String(stats.activeAccounts) : "—"}
          />
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-header">
          <span className="panel-title">{t("notes")}</span>
        </div>
        <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", margin: 0 }}>
          {t("settingsNotes")}
        </p>
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "10px 0",
        borderBottom: "1px solid var(--border, #e2e8f0)",
        fontSize: "0.9rem",
      }}
    >
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}