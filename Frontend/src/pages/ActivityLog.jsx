import { useEffect, useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { t } from "../i18n.js";
import { API_BASE } from "../config.js";

export default function ActivityLog() {
  const { user } = useOutletContext();
  const navigate = useNavigate();
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [, setTick] = useState(0);

  useEffect(() => {
    const onLang = () => setTick((x) => x + 1);
    window.addEventListener("sd-lang-change", onLang);
    return () => window.removeEventListener("sd-lang-change", onLang);
  }, []);

  useEffect(() => {
    if (user && user.role !== "Super Admin" && user.role !== "Manager") {
      navigate("/admin/dashboard");
    }
  }, [user, navigate]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    loadActivity();
  }, []);

  async function loadActivity() {
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/api/activity`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not load activity log");
        return;
      }
      setActivities(data.activities || []);
    } catch {
      setError("Cannot connect to server");
    } finally {
      setLoading(false);
    }
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

  function displayUser(a) {
    if (a.user_name && a.user_name.trim().length > 0) return a.user_name;
    return a.user_id ? `User #${a.user_id}` : "System";
  }

  return (
    <div>
      <h2 className="page-heading">{t("activityLogTitle")}</h2>
      <p className="page-subtext">
        {t("activityLogSub")} ({activities.length} {t("entries")}).
      </p>

      {error && (
        <div style={{ color: "#ef4444", marginBottom: 12, fontSize: "0.85rem" }}>
          {error}
        </div>
      )}

      <div className="table-card">
        {loading ? (
          <div style={{ padding: 24, textAlign: "center" }}>{t("loading")}</div>
        ) : activities.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">{t("noActivityTitle")}</div>
            <div className="empty-state-text">{t("noActivityHint")}</div>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("user")}</th>
                <th>{t("action")}</th>
                <th>{t("detail")}</th>
                <th>{t("date")}</th>
              </tr>
            </thead>
            <tbody>
              {activities.map((a) => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 600 }}>{displayUser(a)}</td>
                  <td>{a.action}</td>
                  <td style={{ color: "var(--text-secondary)" }}>{a.detail || "—"}</td>
                  <td>{formatDateTime(a.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}