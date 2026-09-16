import { useEffect, useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { t } from "../i18n.js";
import { API_BASE } from "../config.js";

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("fr-FR");
}

function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  return (
    d.toLocaleDateString("fr-FR") +
    " " +
    d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
  );
}

export default function AdminDashboard() {
  const { user } = useOutletContext();
  const navigate = useNavigate();
  const [, setTick] = useState(0);

  const [data, setData] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const onLang = () => setTick((x) => x + 1);
    window.addEventListener("sd-lang-change", onLang);
    return () => window.removeEventListener("sd-lang-change", onLang);
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const token = localStorage.getItem("token");

        const res = await fetch(`${API_BASE}/api/dashboard`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || "Could not load dashboard");
          return;
        }
        setData(json);

        if (json.canSeeUserStats) {
          const actRes = await fetch(`${API_BASE}/api/activity`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const actJson = await actRes.json();
          if (actRes.ok) {
            setActivities((actJson.activities || []).slice(0, 5));
          }
        }
      } catch {
        setError("Cannot connect to server");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div>
        <h2 className="page-heading">
          {t("goodMorning")}, {user?.firstName} 👋
        </h2>
        <p className="page-subtext">{t("loading")}</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <h2 className="page-heading">
          {t("goodMorning")}, {user?.firstName} 👋
        </h2>
        <p style={{ color: "#ef4444" }}>{error || "No data"}</p>
      </div>
    );
  }

  const { canSeeUserStats, stats, recentFiles } = data;

  if (!canSeeUserStats) {
    return (
      <div>
        <h2 className="page-heading">
          {t("goodMorning")}, {user?.firstName} 👋
        </h2>
        <p className="page-subtext">{t("dashboardSubUser")}</p>

        <div className="stat-grid">
          <StatCard icon={<FolderIcon />} color="blue" value={stats.filesCount} label={t("myFiles")} />
          <StatCard icon={<ShareIcon />} color="purple" value={stats.sharedWithMe} label={t("sharedWithMe")} />
          <StatCard icon={<StorageIcon />} color="green" value={formatBytes(stats.storageBytes)} label={t("storageUsed")} />
          <StatCard icon={<StarIcon />} color="amber" value={stats.favoritesCount ?? 0} label={t("favorites")} />
        </div>

        <div className="dashboard-grid">
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">{t("recentFiles")}</span>
              <span className="panel-link" style={{ cursor: "pointer" }} onClick={() => navigate("/admin/files")}>
                {t("viewAll")} →
              </span>
            </div>
            {recentFiles.length === 0 ? (
              <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>{t("noFilesYet")}</p>
            ) : (
              recentFiles.map((file) => (
                <div className="activity-row" key={file.key}>
                  <div className="activity-text"><b>{file.name}</b></div>
                  <div className="activity-time">
                    {formatBytes(file.size)} · {formatDate(file.lastModified)}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">{t("storage")}</span>
            </div>
            <div style={{ padding: "8px 0" }}>
              <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{formatBytes(stats.storageBytes)}</div>
              <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>{t("of25gb")}</div>
            </div>
            <button className="btn btn-solid" style={{ marginTop: 16 }} onClick={() => navigate("/admin/files")}>
              {t("goToMyFiles")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="page-heading">
        {t("goodMorning")}, {user?.firstName} 👋
      </h2>
      <p className="page-subtext">{t("dashboardSub")}</p>

      <div className="stat-grid">
        <StatCard icon={<UsersIcon />} color="blue" value={stats.totalUsers} label={t("totalUsers")} />
        <StatCard icon={<CheckIcon />} color="green" value={stats.activeAccounts} label={t("activeAccounts")} />
        <StatCard icon={<StorageIcon />} color="purple" value={stats.filesCount} label={t("filesInS3")} />
        <StatCard icon={<PulseIcon />} color="amber" value={formatBytes(stats.storageBytes)} label={t("storageUsed")} />
      </div>

      <div className="dashboard-grid">
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">{t("recentFiles")}</span>
            <span className="panel-link" style={{ cursor: "pointer" }} onClick={() => navigate("/admin/files")}>
              {t("viewAll")} →
            </span>
          </div>
          {recentFiles.length === 0 ? (
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>{t("noFilesYet")}</p>
          ) : (
            recentFiles.map((file) => (
              <div className="activity-row" key={file.key}>
                <div className="activity-text"><b>{file.name}</b></div>
                <div className="activity-time">
                  {formatBytes(file.size)} · {formatDate(file.lastModified)}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">{t("recentActivity")}</span>
            <span className="panel-link" style={{ cursor: "pointer" }} onClick={() => navigate("/admin/activity")}>
              {t("viewAll")} →
            </span>
          </div>
          {activities.length === 0 ? (
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>{t("noActivityYet")}</p>
          ) : (
            activities.map((a) => (
              <div className="activity-row" key={a.id}>
                <div className="activity-text">
                  <b>{a.user_name || (a.user_id ? `User #${a.user_id}` : "User")}</b> {a.action}
                  {a.detail ? ` — ${a.detail}` : ""}
                </div>
                <div className="activity-time">{formatDateTime(a.created_at)}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, color, value, label }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon bg-${color}`}>{icon}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function iconProps() {
  return { width: 19, height: 19, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2 };
}
function UsersIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <circle cx="17.5" cy="9" r="2.6" />
      <path d="M15 14.2c2.6.4 4.5 2.3 4.5 5.3" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    </svg>
  );
}
function StorageIcon() {
  return (
    <svg {...iconProps()}>
      <rect x="3" y="4" width="18" height="6" rx="1.5" />
      <rect x="3" y="14" width="18" height="6" rx="1.5" />
      <path d="M7 7h.01M7 17h.01" />
    </svg>
  );
}
function PulseIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M3 12h4l2 8 4-16 2 8h6" />
    </svg>
  );
}
function FolderIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M3 6a1 1 0 011-1h5l2 2h9a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V6z" />
    </svg>
  );
}
function ShareIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="6" cy="12" r="2.2" />
      <circle cx="18" cy="6" r="2.2" />
      <circle cx="18" cy="18" r="2.2" />
      <path d="M8.2 10.8L15.8 7.2M8.2 13.2l7.6 3.6" />
    </svg>
  );
}
function StarIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M12 3l2.5 6.5L21 10l-5 4.5L17.5 21 12 17.5 6.5 21 8 14.5 3 10l6.5-.5L12 3z" />
    </svg>
  );
}