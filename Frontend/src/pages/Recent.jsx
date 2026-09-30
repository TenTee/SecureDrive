import { useEffect, useState } from "react";
import { t } from "../i18n.js";
import { API_BASE } from "../config.js";
import ActionModal from "../components/shared/ActionModal.jsx";

function formatSize(bytes) {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("fr-FR");
}

export default function Recent() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [renameTarget, setRenameTarget] = useState(null);
  const [, setTick] = useState(0);

  async function handleRename(file) {
    setRenameTarget(file);
  }

  async function submitRename(newName) {
    const file = renameTarget;
    if (!file || !newName.trim() || newName.trim() === file.name) return false;
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/api/files/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ key: file.key, newName: newName.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "Could not rename file");
        return false;
      }
      setFiles((current) => current.map((entry) => entry.key === file.key
        ? { ...entry, key: data.key, name: data.name }
        : entry));
      return true;
    } catch {
      alert("Cannot connect to server");
      return false;
    }
  }

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
        const res = await fetch(`${API_BASE}/api/favorites/recent`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Could not load recent files");
          return;
        }
        setFiles(data.files || []);
      } catch {
        setError("Cannot connect to server");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div>
      <h2 className="page-heading">{t("recentTitle")}</h2>
      <p className="page-subtext">{t("recentSub")}</p>

      {error && <div style={{ color: "#ef4444", marginBottom: 12 }}>{error}</div>}

      <div className="table-card">
        {loading ? (
          <div style={{ padding: 24, textAlign: "center" }}>{t("loading")}</div>
        ) : files.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">{t("noRecent")}</div>
            <div className="empty-state-text">{t("noRecentHint")}</div>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("name")}</th>
                <th>{t("size")}</th>
                <th>{t("lastModified")}</th>
                <th>{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.key}>
                  <td style={{ fontWeight: 600 }}>{f.name}</td>
                  <td>{formatSize(f.size)}</td>
                  <td>{formatDate(f.lastModified)}</td>
                  <td>
                    {f.permission === "Read & Write" && (
                      <button className="btn btn-outline" onClick={() => handleRename(f)}>{t("rename")}</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <ActionModal
        key={renameTarget?.key || "rename-closed"}
        open={Boolean(renameTarget)}
        mode="rename"
        title={t("renameTitle")}
        description={t("renameDescription")}
        itemName={renameTarget?.name}
        initialValue={renameTarget?.name || ""}
        inputLabel={t("renameLabel")}
        confirmLabel={t("saveChanges")}
        cancelLabel={t("cancel")}
        onClose={() => setRenameTarget(null)}
        onConfirm={submitRename}
      />
    </div>
  );
}