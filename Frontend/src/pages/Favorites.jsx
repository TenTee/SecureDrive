import { useEffect, useState } from "react";
import { t } from "../i18n.js";
import { API_BASE } from "../config.js";
import ActionModal from "../components/shared/ActionModal.jsx";

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("fr-FR");
}

export default function Favorites() {
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [renameTarget, setRenameTarget] = useState(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const onLang = () => setTick((x) => x + 1);
    window.addEventListener("sd-lang-change", onLang);
    return () => window.removeEventListener("sd-lang-change", onLang);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    loadFavorites();
  }, []);

  async function loadFavorites() {
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/api/favorites`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not load favorites");
        return;
      }
      setFavorites(data.favorites || []);
    } catch {
      setError("Cannot connect to server");
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(item) {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${API_BASE}/api/favorites`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ fileKey: item.file_key }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Could not remove favorite");
        return;
      }
      setFavorites((prev) => prev.filter((f) => f.id !== item.id));
    } catch {
      alert("Cannot connect to server");
    }
  }

  async function handleRename(item) {
    setRenameTarget(item);
  }

  async function submitRename(newName) {
    const item = renameTarget;
    if (!item || !newName.trim() || newName.trim() === item.file_name) return false;
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/api/files/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ key: item.file_key, newName: newName.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "Could not rename file");
        return false;
      }
      setFavorites((current) => current.map((favorite) => favorite.file_key === item.file_key
        ? { ...favorite, file_key: data.key, file_name: data.name }
        : favorite));
        return true;
    } catch {
      alert("Cannot connect to server");
        return false;
    }
  }

  return (
    <div>
      <h2 className="page-heading">{t("favoritesTitle")}</h2>
      <p className="page-subtext">{t("favoritesSub")}</p>

      {error && <div style={{ color: "#ef4444", marginBottom: 12 }}>{error}</div>}

      <div className="table-card">
        {loading ? (
          <div style={{ padding: 24, textAlign: "center" }}>{t("loading")}</div>
        ) : favorites.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">{t("noFavorites")}</div>
            <div className="empty-state-text">{t("noFavoritesHint")}</div>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("fileName")}</th>
                <th>{t("added")}</th>
                <th style={{ textAlign: "right" }}>{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {favorites.map((item) => (
                <tr key={item.id}>
                  <td style={{ fontWeight: 600 }}>⭐ {item.file_name}</td>
                  <td>{formatDate(item.created_at)}</td>
                  <td>
                    <div className="row-actions">
                      {item.permission === "Read & Write" && (
                        <button className="btn btn-outline" onClick={() => handleRename(item)}>{t("rename")}</button>
                      )}
                      <button className="btn btn-outline" onClick={() => handleRemove(item)}>
                        {t("remove")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <ActionModal
        key={renameTarget?.file_key || "rename-closed"}
        open={Boolean(renameTarget)}
        mode="rename"
        title={t("renameTitle")}
        description={t("renameDescription")}
        itemName={renameTarget?.file_name}
        initialValue={renameTarget?.file_name || ""}
        inputLabel={t("renameLabel")}
        confirmLabel={t("saveChanges")}
        cancelLabel={t("cancel")}
        onClose={() => setRenameTarget(null)}
        onConfirm={submitRename}
      />
    </div>
  );
}