import { useState, useEffect } from "react";
import { t } from "../i18n.js";
import { API_BASE } from "../config.js";

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

function cleanName(key) {
  const raw = (key || "").split("/").pop() || key;
  return raw.replace(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i,
    ""
  );
}

export default function Trash() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmModal, setConfirmModal] = useState(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const onLang = () => setTick((x) => x + 1);
    window.addEventListener("sd-lang-change", onLang);
    return () => window.removeEventListener("sd-lang-change", onLang);
  }, []);

  async function loadTrash() {
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/api/files/trash`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not load trash");
        return;
      }
      setItems(data.files || []);
    } catch {
      setError("Cannot connect to server");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTrash();
  }, []);

  async function doRestore(item) {
    setBusy(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${API_BASE}/api/files/restore`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ key: item.key }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not restore");
        return;
      }
      setItems((prev) => prev.filter((f) => f.key !== item.key));
      setConfirmModal(null);
    } catch {
      setError("Cannot connect to server");
    } finally {
      setBusy(false);
    }
  }

  async function doDeleteForever(item) {
    setBusy(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${API_BASE}/api/files`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ key: item.key }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not delete");
        return;
      }
      setItems((prev) => prev.filter((f) => f.key !== item.key));
      setConfirmModal(null);
    } catch {
      setError("Cannot connect to server");
    } finally {
      setBusy(false);
    }
  }

  async function doEmptyTrash() {
    setBusy(true);
    const token = localStorage.getItem("token");
    try {
      for (const item of items) {
        const res = await fetch(`${API_BASE}/api/files`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ key: item.key }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || "Could not empty trash completely");
          await loadTrash();
          return;
        }
      }
      setItems([]);
      setConfirmModal(null);
    } catch {
      setError("Cannot connect to server");
    } finally {
      setBusy(false);
    }
  }

  function handleConfirm() {
    if (!confirmModal) return;
    if (confirmModal.type === "restore") doRestore(confirmModal.item);
    if (confirmModal.type === "delete") doDeleteForever(confirmModal.item);
    if (confirmModal.type === "empty") doEmptyTrash();
  }

  const modalTitle =
    confirmModal?.type === "restore"
      ? t("restoreTitle")
      : confirmModal?.type === "delete"
        ? t("deleteForeverTitle")
        : confirmModal?.type === "empty"
          ? t("emptyTrashTitle")
          : "";

  const modalText =
    confirmModal?.type === "restore"
      ? `"${cleanName(confirmModal.item.key)}" ${t("restoreText")}`
      : confirmModal?.type === "delete"
        ? `"${cleanName(confirmModal.item.key)}" ${t("deleteForeverText")}`
        : confirmModal?.type === "empty"
          ? `${items.length} ${t("emptyTrashText")}`
          : "";

  const confirmLabel =
    confirmModal?.type === "restore"
      ? t("restore")
      : confirmModal?.type === "delete"
        ? t("deleteForever")
        : t("emptyTrash");

  const isDanger =
    confirmModal?.type === "delete" || confirmModal?.type === "empty";

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <h2 className="page-heading">{t("trashTitle")}</h2>
          <p className="page-subtext">{t("trashSub")}</p>
        </div>

        {items.length > 0 && (
          <button
            className="btn btn-danger"
            onClick={() => setConfirmModal({ type: "empty" })}
          >
            {t("emptyTrash")}
          </button>
        )}
      </div>

      {error && (
        <div style={{ color: "#ef4444", marginBottom: 12, fontSize: "0.85rem" }}>
          {error}
        </div>
      )}

      <div className="table-card">
        {loading ? (
          <div style={{ padding: 24, textAlign: "center" }}>{t("loadingTrash")}</div>
        ) : items.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><TrashIcon /></div>
            <div className="empty-state-title">{t("trashEmpty")}</div>
            <div className="empty-state-text">{t("trashEmptyHint")}</div>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("fileName")}</th>
                <th>{t("fileSize")}</th>
                <th>{t("deletedDate")}</th>
                <th style={{ textAlign: "right" }}>{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.key}>
                  <td style={{ fontWeight: 600 }}>{cleanName(item.key)}</td>
                  <td>{formatSize(item.size)}</td>
                  <td>{formatDate(item.lastModified)}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="btn btn-outline"
                        onClick={() => setConfirmModal({ type: "restore", item })}
                      >
                        ↺ {t("restore")}
                      </button>
                      <button
                        className="btn btn-danger"
                        onClick={() => setConfirmModal({ type: "delete", item })}
                      >
                        🗑 {t("delete")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {confirmModal && (
        <div className="modal-overlay" onClick={() => !busy && setConfirmModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{modalTitle}</div>
            <p style={{ marginBottom: 20, color: "var(--text-secondary)" }}>{modalText}</p>
            <div className="modal-actions">
              <button
                className="btn btn-outline"
                disabled={busy}
                onClick={() => setConfirmModal(null)}
              >
                {t("cancel")}
              </button>
              <button
                className={isDanger ? "btn btn-danger" : "btn btn-solid"}
                disabled={busy}
                onClick={handleConfirm}
              >
                {busy ? t("pleaseWait") : confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TrashIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 7h16M9 7V4h6v3m-8 0l1 13h8l1-13" />
    </svg>
  );
}