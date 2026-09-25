import { useEffect, useState, useRef } from "react";
import { t } from "../i18n.js";
import { API_BASE } from "../config.js";
import FileCard from "../components/FileCard.jsx";
import FilePreviewModal from "../components/FilePreviewModal.jsx";

function cleanName(key) {
  const raw = (key || "").split("/").filter(Boolean).pop() || key || "file";
  return raw.replace(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i,
    ""
  );
}

function formatSize(bytes) {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}


export default function SharedWithMe() {
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [previewModal, setPreviewModal] = useState(null);
  const [replacingId, setReplacingId] = useState(null);
  const fileInputRef = useRef(null);
  const pendingReplaceRef = useRef(null);
  const [, setTick] = useState(0);

  const [browsePath, setBrowsePath] = useState(null);
  const [browseName, setBrowseName] = useState("");
  const [folderFiles, setFolderFiles] = useState([]);
  const [folderFolders, setFolderFolders] = useState([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browsePerm, setBrowsePerm] = useState("Read Only");

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
      const res = await fetch(`${API_BASE}/api/shares/with-me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not load shared files");
        return;
      }
      setShares(data.shares || []);
    } catch {
      setError("Cannot connect to server");
    } finally {
      setLoading(false);
    }
  }

  async function openSharedFolder(item) {
    const path = item.file_key.endsWith("/") ? item.file_key : item.file_key + "/";
    setBrowsePath(path);
    setBrowseName(item.file_name || cleanName(path));
    setBrowsePerm(item.permission || "Read Only");
    setBrowseLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${API_BASE}/api/files?path=${encodeURIComponent(path)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not open folder");
        setBrowsePath(null);
        return;
      }
      setFolderFolders(data.folders || []);
      setFolderFiles(
        (data.files || []).map((f) => ({
          key: f.key,
          name: cleanName(f.key),
          size: f.size,
          type: guessType(cleanName(f.key)),
        }))
      );
    } catch {
      setError("Cannot connect to server");
      setBrowsePath(null);
    } finally {
      setBrowseLoading(false);
    }
  }

  function backToShares() {
    setBrowsePath(null);
    setBrowseName("");
    setFolderFiles([]);
    setFolderFolders([]);
  }

  async function handleDownload(fileKey, fileName) {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(
        `${API_BASE}/api/files/download?key=${encodeURIComponent(fileKey)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Download failed");
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || "download";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("Cannot connect to server");
    }
  }

  function startReplace(item) {
    pendingReplaceRef.current = {
      fileKey: item.file_key || item.key,
      shareId: item.id,
    };
    fileInputRef.current?.click();
  }

  async function onFileChosen(e) {
    const file = e.target.files?.[0];
    const pending = pendingReplaceRef.current;
    e.target.value = "";
    if (!file || !pending) return;

    setReplacingId(pending.shareId);
    const token = localStorage.getItem("token");
    try {
      const formData = new FormData();
      formData.append("key", pending.fileKey);
      formData.append("file", file);
      const res = await fetch(`${API_BASE}/api/files/replace`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Could not update file");
        return;
      }
      alert("File updated successfully on SecureDrive");
    } catch {
      alert("Cannot connect to server");
    } finally {
      setReplacingId(null);
      pendingReplaceRef.current = null;
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("fr-FR");
  }

  function isFolderShare(item) {
    return item.isFolder === true || (item.file_key && item.file_key.endsWith("/"));
  }

  function permLabel(p) {
    if (p === "Read Only") return t("readOnly");
    if (p === "Read & Write") return t("readWrite");
    return p;
  }

  if (browsePath) {
    return (
      <div>
        <h2 className="page-heading">📁 {browseName}</h2>
        <p className="page-subtext">
          {t("sharedFolderLabel")} · {permLabel(browsePerm)}
        </p>
        <button
          type="button"
          className="btn btn-outline"
          style={{ marginBottom: 16 }}
          onClick={backToShares}
        >
          ← {t("backToShared")}
        </button>

        {error && <div style={{ color: "#ef4444", marginBottom: 12 }}>{error}</div>}

        <div className="table-card">
          {browseLoading ? (
            <div style={{ padding: 24, textAlign: "center" }}>{t("loading")}</div>
          ) : folderFolders.length === 0 && folderFiles.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-title">{t("emptyFolder")}</div>
            </div>
          ) : (
            <div className="file-card-grid">
              {folderFolders.map((folder) => (
                <FileCard
                  key={folder.key}
                  item={{ key: folder.key, name: folder.name, type: "folder" }}
                  folder
                  showMenu={false}
                  onOpen={(key) => openSharedFolder({ file_key: key, file_name: folder.name, permission: browsePerm })}
                  actions={<button type="button" className="btn btn-outline" onClick={() => openSharedFolder({ file_key: folder.key, file_name: folder.name, permission: browsePerm })}>{t("open")}</button>}
                />
              ))}
              {folderFiles.map((file) => (
                <FileCard
                  key={file.key}
                  item={{ key: file.key, name: file.name, type: file.type, sizeLabel: formatSize(file.size) }}
                  showMenu={false}
                  previewable={file.type !== "file"}
                  onOpen={(selected) => setPreviewModal({ key: selected.key, name: selected.name })}
                  actions={<>
                    <button type="button" className="btn btn-outline" onClick={() => handleDownload(file.key, file.name)}>{t("download")}</button>
                    {browsePerm === "Read & Write" && <button type="button" className="btn btn-outline" onClick={() => startReplace({ file_key: file.key, id: file.key })}>{t("update")}</button>}
                  </>}
                />
              ))}
            </div>
          )}
        </div>

        <input ref={fileInputRef} type="file" hidden onChange={onFileChosen} />
        {previewModal && <FilePreviewModal fileKey={previewModal.key} fileName={previewModal.name} onClose={() => setPreviewModal(null)} />}
      </div>
    );
  }

  return (
    <div>
      <h2 className="page-heading">{t("sharedWithMeTitle")}</h2>
      <p className="page-subtext">{t("sharedWithMeSub")}</p>

      <input ref={fileInputRef} type="file" hidden onChange={onFileChosen} />

      {error && <div style={{ color: "#ef4444", marginBottom: 12 }}>{error}</div>}

      <div className="table-card">
        {loading ? (
          <div style={{ padding: 24, textAlign: "center" }}>{t("loading")}</div>
        ) : shares.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <ShareIcon />
            </div>
            <div className="empty-state-title">{t("nothingShared")}</div>
            <div className="empty-state-text">{t("nothingSharedHint")}</div>
          </div>
        ) : (
          <div className="file-card-grid">
              {shares.map((item) => {
                const folder = isFolderShare(item);
                const type = guessType(item.file_name);
                return <FileCard key={item.id} item={{ key: item.file_key, name: item.file_name, type, sizeLabel: `${permLabel(item.permission)} · ${formatDate(item.created_at)}` }} folder={folder} showMenu={false} previewable={!folder && type !== "file"} onOpen={(file) => folder ? openSharedFolder(item) : setPreviewModal({ key: file.key, name: file.name })} meta={`${item.owner_first_name || ""} ${item.owner_last_name || ""}`.trim() || item.owner_email} actions={folder ? <button className="btn btn-outline" onClick={() => openSharedFolder(item)}>{t("openFolder")}</button> : <><button className="btn btn-outline" onClick={() => handleDownload(item.file_key, item.file_name)}>{t("download")}</button>{item.permission === "Read & Write" && <button className="btn btn-outline" disabled={replacingId === item.id} onClick={() => startReplace(item)}>{replacingId === item.id ? t("updating") : t("updateFile")}</button>}</>} />;
              })}
          </div>
        )}
      </div>
      {previewModal && <FilePreviewModal fileKey={previewModal.key} fileName={previewModal.name} onClose={() => setPreviewModal(null)} />}
    </div>
  );
}

function ShareIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="6" cy="12" r="2.2" />
      <circle cx="18" cy="6" r="2.2" />
      <circle cx="18" cy="18" r="2.2" />
      <path d="M8.2 10.8L15.8 7.2M8.2 13.2l7.6 3.6" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 4v12M6 12l6 6 6-6" />
      <path d="M4 20h16" />
    </svg>
  );
}

function guessType(name) {
  const ext = (name || "").split(".").pop().toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext)) return "image";
  if (["mp4", "webm", "ogg", "mov"].includes(ext)) return "video";
  if (ext === "pdf") return "pdf";
  return "file";
}