import { useEffect, useState } from "react";
import { t } from "../i18n.js";
import { API_BASE } from "../config.js";

export default function SharedFiles() {
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [, setTick] = useState(0);

  useEffect(() => {
    const onLang = () => setTick((x) => x + 1);
    window.addEventListener("sd-lang-change", onLang);
    return () => window.removeEventListener("sd-lang-change", onLang);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    loadShares();
  }, []);

  async function loadShares() {
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/api/shares/by-me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not load shares");
        return;
      }
      setShares(data.shares || []);
    } catch {
      setError("Cannot connect to server");
    } finally {
      setLoading(false);
    }
  }

  async function handleRemoveShare(shareId) {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${API_BASE}/api/shares/${shareId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Could not remove share");
        return;
      }
      setShares((prev) => prev.filter((s) => s.id !== shareId));
    } catch {
      alert("Cannot connect to server");
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("fr-FR");
  }

  function permLabel(p) {
    if (p === "Read Only") return t("readOnly");
    if (p === "Read & Write") return t("readWrite");
    return p;
  }

  return (
    <div>
      <h2 className="page-heading">{t("sharedByMeTitle")}</h2>
      <p className="page-subtext">{t("sharedByMeSub")}</p>

      {error && <div style={{ color: "#ef4444", marginBottom: 12 }}>{error}</div>}

      <div className="table-card">
        {loading ? (
          <div style={{ padding: 24, textAlign: "center" }}>{t("loading")}</div>
        ) : shares.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><SendIcon /></div>
            <div className="empty-state-title">{t("nothingSharedByMe")}</div>
            <div className="empty-state-text">{t("nothingSharedByMeHint")}</div>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("fileName")}</th>
                <th>{t("sharedWith")}</th>
                <th>{t("permissions")}</th>
                <th>{t("dateShared")}</th>
                <th style={{ textAlign: "right" }}>{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {shares.map((item) => (
                <tr key={item.id}>
                  <td style={{ fontWeight: 600 }}>{item.file_name}</td>
                  <td>
                    {item.target_first_name} {item.target_last_name}
                    <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      {item.target_email}
                    </div>
                  </td>
                  <td>
                    <span
                      className={`tag ${
                        item.permission === "Read Only" ? "tag-gray" : "tag-amber"
                      }`}
                    >
                      {permLabel(item.permission)}
                    </span>
                  </td>
                  <td>{formatDate(item.created_at)}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="btn btn-outline"
                        onClick={() => handleRemoveShare(item.id)}
                      >
                        {t("removeAccess")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function SendIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  );
}