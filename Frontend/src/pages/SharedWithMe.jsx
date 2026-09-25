import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
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
  const [directFile, setDirectFile] = useState(null);
  const [replacingId, setReplacingId] = useState(null);
  const [folderModal, setFolderModal] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const fileInputRef = useRef(null);
  const uploadInputRef = useRef(null);
  const pendingReplaceRef = useRef(null);
  const [, setTick] = useState(0);
  const [searchParams] = useSearchParams();
  const directKey = searchParams.get("file");

  const [browsePath, setBrowsePath] = useState(null);
  const [browseName, setBrowseName] = useState("");
  const [folderFiles, setFolderFiles] = useState([]);
  const [folderFolders, setFolderFolders] = useState([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browsePerm, setBrowsePerm] = useState("Read Only");
  const [menu, setMenu] = useState(null);
  const menuPanelRef = useRef(null);

  useEffect(() => {
    const onLang = () => setTick((x) => x + 1);
    window.addEventListener("sd-lang-change", onLang);
    return () => window.removeEventListener("sd-lang-change", onLang);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    loadShares();
  }, []);

  useEffect(() => {
    if (directKey) loadDirectFile(directKey);
  }, [directKey]);

  useEffect(() => {
    function closeMenu(event) {
      if (menuPanelRef.current && !menuPanelRef.current.contains(event.target)) {
        if (!event.target.closest?.("[data-menu-btn]")) setMenu(null);
      }
    }
    function closeOnViewportChange() {
      setMenu(null);
    }
    document.addEventListener("mousedown", closeMenu);
    window.addEventListener("scroll", closeOnViewportChange, true);
    window.addEventListener("resize", closeOnViewportChange);
    return () => {
      document.removeEventListener("mousedown", closeMenu);
      window.removeEventListener("scroll", closeOnViewportChange, true);
      window.removeEventListener("resize", closeOnViewportChange);
    };
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

  async function loadDirectFile(fileKey) {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/api/files/item?key=${encodeURIComponent(fileKey)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "You do not have access to this file");
        return;
      }
      const name = cleanName(fileKey);
      const type = guessType(name);
      const file = { key: fileKey, name, type, size: data.size };
      setDirectFile(file);
      if (type !== "file") setPreviewModal({ key: fileKey, name });
    } catch {
      setError("Cannot connect to server");
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

  async function createSharedFolder(event) {
    event.preventDefault();
    if (!folderName.trim() || !browsePath) return;

    setCreatingFolder(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/api/files/folder`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: folderName.trim(), parent: browsePath }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "Could not create folder");
        return;
      }
      setFolderName("");
      setFolderModal(false);
      await openSharedFolder({ file_key: browsePath, file_name: browseName, permission: browsePerm });
    } catch {
      alert("Cannot connect to server");
    } finally {
      setCreatingFolder(false);
    }
  }

  async function uploadToSharedFolder(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !browsePath) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("path", browsePath);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/api/files/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "Could not upload file");
        return;
      }
      await openSharedFolder({ file_key: browsePath, file_name: browseName, permission: browsePerm });
    } catch {
      alert("Cannot connect to server");
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

  async function copyFileLink(fileKey) {
    const link = `${window.location.origin}/file?key=${encodeURIComponent(fileKey)}`;
    try {
      await navigator.clipboard.writeText(link);
      alert(t("linkCopied"));
    } catch {
      window.prompt(t("copyLink"), link);
    }
  }

  function openMenu(event, item, isFolder) {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 210;
    let left = Math.max(8, rect.right - menuWidth);
    if (left + menuWidth > window.innerWidth - 8) left = window.innerWidth - menuWidth - 8;
    const estimatedHeight = isFolder ? 140 : 230;
    let top = rect.bottom + 4;
    if (top + estimatedHeight > window.innerHeight - 8) top = Math.max(8, rect.top - estimatedHeight - 4);
    setMenu({ item, isFolder, permission: item.permission || browsePerm, top, left });
  }

  function openMenuFolder(item) {
    setMenu(null);
    openSharedFolder({ file_key: item.key, file_name: item.name, permission: menu?.permission || browsePerm });
  }

  function renderMenu() {
    if (!menu) return null;
    const item = menu.item;
    const canPreview = !menu.isFolder && ["image", "video", "pdf"].includes(item.type);
    const canWrite = menu.permission === "Read & Write";
    return (
      <div ref={menuPanelRef} className="menu-floating" style={{ top: menu.top, left: menu.left }}>
        {menu.isFolder ? (
          <button type="button" onClick={() => openMenuFolder(item)}>{t("open")}</button>
        ) : (
          <>
            {canPreview && <button type="button" onClick={() => { setMenu(null); setPreviewModal({ key: item.key, name: item.name }); }}>{t("preview")}</button>}
            <button type="button" onClick={() => { setMenu(null); handleDownload(item.key, item.name); }}>{t("download")}</button>
            <button type="button" onClick={() => { setMenu(null); copyFileLink(item.key); }}>{t("copyLink")}</button>
            {canWrite && <button type="button" onClick={() => { setMenu(null); startReplace({ file_key: item.key, id: item.id || item.key }); }}>{t("updateFile")}</button>}
          </>
        )}
      </div>
    );
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
        {browsePerm === "Read & Write" && (
          <div className="myfiles-actions" style={{ marginBottom: 16 }}>
            <input ref={uploadInputRef} type="file" hidden onChange={uploadToSharedFolder} />
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => uploadInputRef.current?.click()}
            >
              {t("uploadHere")}
            </button>
            <button type="button" className="btn btn-solid" onClick={() => setFolderModal(true)}>
              + {t("newFolder")}
            </button>
          </div>
        )}
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
                  onMenu={(event, item) => openMenu(event, { ...item, permission: browsePerm }, true)}
                  onOpen={(key) => openSharedFolder({ file_key: key, file_name: folder.name, permission: browsePerm })}
                />
              ))}
              {folderFiles.map((file) => (
                <FileCard
                  key={file.key}
                  item={{ key: file.key, name: file.name, type: file.type, sizeLabel: formatSize(file.size) }}
                  onMenu={(event, item) => openMenu(event, { ...item, permission: browsePerm }, false)}
                  previewable={file.type !== "file"}
                  onOpen={(selected) => setPreviewModal({ key: selected.key, name: selected.name })}
                />
              ))}
            </div>
          )}
        </div>

        <input ref={fileInputRef} type="file" hidden onChange={onFileChosen} />
        {renderMenu()}
        {previewModal && <FilePreviewModal fileKey={previewModal.key} fileName={previewModal.name} onClose={() => setPreviewModal(null)} />}
        {folderModal && (
          <div className="modal-overlay" onClick={() => !creatingFolder && setFolderModal(false)}>
            <form className="modal-card" onClick={(event) => event.stopPropagation()} onSubmit={createSharedFolder}>
              <div className="modal-title">{t("newFolderTitle")}</div>
              <p style={{ margin: "0 0 16px", color: "var(--text-secondary)" }}>{t("newFolderHint")}</p>
              <input
                className="form-input"
                value={folderName}
                onChange={(event) => setFolderName(event.target.value)}
                placeholder={t("folderName")}
                autoFocus
              />
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" disabled={creatingFolder} onClick={() => setFolderModal(false)}>{t("cancel")}</button>
                <button type="submit" className="btn btn-solid" disabled={creatingFolder || !folderName.trim()}>{creatingFolder ? t("pleaseWait") : t("create")}</button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <h2 className="page-heading">{t("sharedWithMeTitle")}</h2>
      <p className="page-subtext">{t("sharedWithMeSub")}</p>

      <input ref={fileInputRef} type="file" hidden onChange={onFileChosen} />

      {error && <div style={{ color: "#ef4444", marginBottom: 12 }}>{error}</div>}

      {directFile && (
        <div className="table-card" style={{ marginBottom: 16 }}>
          <div style={{ padding: "12px 18px 0", fontWeight: 600 }}>{t("directFile")}</div>
          <div className="file-card-grid">
            <FileCard
              item={{ ...directFile, sizeLabel: formatSize(directFile.size) }}
              onMenu={(event, item) => openMenu(event, item, false)}
              previewable={directFile.type !== "file"}
              onOpen={(file) => setPreviewModal({ key: file.key, name: file.name })}
            />
          </div>
        </div>
      )}

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
                return <FileCard key={item.id} item={{ key: item.file_key, name: item.file_name, type, permission: item.permission, sizeLabel: `${permLabel(item.permission)} · ${formatDate(item.created_at)}` }} folder={folder} onMenu={(event, cardItem, isFolder) => openMenu(event, { ...cardItem, permission: item.permission }, isFolder)} previewable={!folder && type !== "file"} onOpen={(file) => folder ? openSharedFolder(item) : setPreviewModal({ key: file.key, name: file.name })} meta={`${item.owner_first_name || ""} ${item.owner_last_name || ""}`.trim() || item.owner_email} />;
              })}
          </div>
        )}
      </div>
      {renderMenu()}
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