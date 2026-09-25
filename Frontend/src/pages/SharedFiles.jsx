import { useEffect, useState } from "react";
import { t } from "../i18n.js";
import { API_BASE } from "../config.js";
import FileCard from "../components/FileCard.jsx";
import FilePreviewModal from "../components/FilePreviewModal.jsx";

function guessType(name) {
  const ext = (name || "").split(".").pop().toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext)) return "image";
  if (["mp4", "webm", "ogg", "mov"].includes(ext)) return "video";
  if (ext === "pdf") return "pdf";
  return "file";
}

export default function SharedFiles() {
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [previewModal, setPreviewModal] = useState(null);
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

  async function copyFileLink(fileKey) {
    const link = `${window.location.origin}/file?key=${encodeURIComponent(fileKey)}`;
    try {
      await navigator.clipboard.writeText(link);
      alert(t("linkCopied"));
    } catch {
      window.prompt(t("copyLink"), link);
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
          <div className="file-card-grid">
            {shares.map((item) => {
              const name = item.file_name || "file";
              const folder = item.isFolder === true || item.file_key?.endsWith("/");
              const type = guessType(name);
              return <FileCard key={item.id} item={{ key: item.file_key, name, type, sizeLabel: `${permLabel(item.permission)} · ${formatDate(item.created_at)}` }} folder={folder} showMenu={false} previewable={!folder && type !== "file"} onOpen={(file) => setPreviewModal({ key: file.key, name: file.name })} meta={`${item.target_first_name || ""} ${item.target_last_name || ""}`.trim() || item.target_email} actions={<>{!folder && <button className="btn btn-outline" onClick={() => copyFileLink(item.file_key)}>{t("copyLink")}</button>}<button className="btn btn-outline" onClick={() => handleRemoveShare(item.id)}>{t("removeAccess")}</button></>} />;
            })}
          </div>
        )}
      </div>
      {previewModal && <FilePreviewModal fileKey={previewModal.key} fileName={previewModal.name} onClose={() => setPreviewModal(null)} />}
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