import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { t } from "../i18n.js";
import { API_BASE } from "../config.js";
import FilePreviewModal from "../components/FilePreviewModal.jsx";
import FileCard from "../components/FileCard.jsx";
import ActionModal from "../components/shared/ActionModal.jsx";

function formatSize(bytes) {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function cleanName(key) {
  const raw = (key || "").split("/").filter(Boolean).pop() || key || "file";
  return raw.replace(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i,
    ""
  );
}

function guessType(name) {
  const ext = (name || "").split(".").pop().toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext)) return "image";
  if (["mp4", "webm", "ogg", "mov"].includes(ext)) return "video";
  if (["doc", "docx"].includes(ext)) return "doc";
  if (["xls", "xlsx"].includes(ext)) return "sheet";
  if (["ppt", "pptx"].includes(ext)) return "slides";
  if (ext === "pdf") return "pdf";
  return "file";
}

function canPreview(name) {
  const ext = (name || "").split(".").pop().toLowerCase();
  return ["png", "jpg", "jpeg", "gif", "svg", "webp", "pdf", "mp4", "webm", "ogg", "mov"].includes(ext);
}

function getUserRootPath(user) {
  const id = user?.userId || user?.id;
  if (id) return `uploads/${id}/`;
  try {
    const raw = localStorage.getItem("user");
    const u = raw ? JSON.parse(raw) : null;
    const uid = u?.userId || u?.id;
    if (uid) return `uploads/${uid}/`;
  } catch {
    /* ignore */
  }
  return "uploads/";
}

export default function MyFiles() {
  const outlet = useOutletContext() || {};
  const user = outlet.user;
  const setFilesGlobal = outlet.setFiles;
  const uploadFile = outlet.uploadFile;

  const [path, setPath] = useState(() => getUserRootPath(user));
  const [folders, setFolders] = useState([]);
  const [moveFolderOptions, setMoveFolderOptions] = useState([]);
  const [files, setFiles] = useState([]);
  const [favoriteKeys, setFavoriteKeys] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [folderModal, setFolderModal] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [creating, setCreating] = useState(false);
  const [menu, setMenu] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [renameTarget, setRenameTarget] = useState(null);
  const [moveModal, setMoveModal] = useState(null);
  const [shareModal, setShareModal] = useState(null);
  const [shareRecipients, setShareRecipients] = useState([]);
  const [shareRecipientsLoading, setShareRecipientsLoading] = useState(false);
  const [shareRecipientsError, setShareRecipientsError] = useState("");
  const [shareSearch, setShareSearch] = useState("");
  const [selectedShareUserIds, setSelectedShareUserIds] = useState([]);
  const [recipientPermissions, setRecipientPermissions] = useState({});
  const [sharePermission, setSharePermission] = useState("Read Only");
  const [sharing, setSharing] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [, setTick] = useState(0);
  const [previewModal, setPreviewModal] = useState(null);
  const [dropActive, setDropActive] = useState(false);

  const uploadInputRef = useRef(null);
  const menuPanelRef = useRef(null);

  useEffect(() => {
    const onLang = () => setTick((x) => x + 1);
    window.addEventListener("sd-lang-change", onLang);
    return () => window.removeEventListener("sd-lang-change", onLang);
  }, []);

  function showToast(message, type = "ok") {
    // eslint-disable-next-line react-hooks/purity
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 5000);
  }

  async function loadFavorites() {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/api/favorites`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setFavoriteKeys(new Set((data.favorites || []).map((f) => f.file_key || f.key)));
    } catch {
      /* ignore */
    }
  }

  async function load(currentPath = path) {
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${API_BASE}/api/files?path=${encodeURIComponent(currentPath)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not load files");
        return;
      }
      const folderList = data.folders || [];
      const fileList = (data.files || []).map((f) => {
        const name = cleanName(f.key);
        return {
          key: f.key,
          name,
          size: f.size,
          lastModified: f.lastModified,
          type: guessType(name),
          sizeLabel: formatSize(f.size),
        };
      });
      setFolders(folderList);
      setFiles(fileList);
      if (typeof setFilesGlobal === "function") setFilesGlobal(fileList);
      if (data.path) setPath(data.path);
    } catch {
      setError("Cannot connect to server");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const root = getUserRootPath(user);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPath(root);
    load(root);
    loadFavorites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.userId || user?.id]);

  useEffect(() => {
    function onDoc(e) {
      if (menuPanelRef.current && !menuPanelRef.current.contains(e.target)) {
        if (e.target.closest?.("[data-menu-btn]")) return;
        setMenu(null);
      }
    }
    function onScroll() {
      setMenu(null);
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  function openMenu(e, item, isFolder) {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 210;
    const gap = 4;
    let left = rect.right - menuWidth;
    if (left < 8) left = 8;
    if (left + menuWidth > window.innerWidth - 8) {
      left = window.innerWidth - menuWidth - 8;
    }
    let top = rect.bottom + gap;
    const estimatedHeight = isFolder ? 180 : 280;
    if (top + estimatedHeight > window.innerHeight - 8) {
      top = Math.max(8, rect.top - estimatedHeight - gap);
    }
    setMenu({
      key: item.key,
      isFolder,
      item: { ...item, type: isFolder ? "folder" : item.type },
      top,
      left,
    });
  }

  function openFolder(folderKey) {
    setMenu(null);
    setPath(folderKey);
    load(folderKey);
  }

  function goUp() {
    const root = getUserRootPath(user);
    if (path === root || path.length <= root.length) return;
    const trimmed = path.replace(/\/$/, "");
    const parts = trimmed.split("/");
    parts.pop();
    let parent = parts.join("/") + "/";
    if (!parent.startsWith(root)) parent = root;
    setPath(parent);
    load(parent);
  }

  function breadcrumbParts() {
    const root = getUserRootPath(user);
    const relative = path.startsWith(root) ? path.slice(root.length) : path;
    return relative.split("/").filter(Boolean);
  }

  async function handleCreateFolder(e) {
    e.preventDefault();
    if (!folderName.trim()) return;
    setCreating(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/api/files/folder`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: folderName.trim(), parent: path }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || "Could not create folder", "error");
        return;
      }
      setFolderName("");
      setFolderModal(false);
      showToast(`Folder "${data.name || folderName}" created`);
      load(path);
    } catch {
      showToast("Cannot connect to server", "error");
    } finally {
      setCreating(false);
    }
  }

  async function handleUploadHere(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadFile?.(file, path, () => {
      showToast(`"${file.name}" uploaded`);
      load(path);
    });
    e.target.value = "";
  }

  async function uploadDroppedFiles(fileList, destinationPath = path) {
    const droppedFiles = Array.from(fileList || []);
    if (!droppedFiles.length) return;

    const token = localStorage.getItem("token");
    const results = await Promise.all(droppedFiles.map(async (file) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("path", destinationPath);
      try {
        const response = await fetch(`${API_BASE}/api/files/upload`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        const data = await response.json().catch(() => ({}));
        return { ok: response.ok, error: data.error };
      } catch {
        return { ok: false, error: "Cannot connect to server" };
      }
    }));

    const uploadedCount = results.filter((result) => result.ok).length;
    if (uploadedCount) {
      showToast(`${uploadedCount} ${t("dropUploadComplete")}`);
      load(path);
    }
    const failure = results.find((result) => !result.ok);
    if (failure) showToast(failure.error || t("dropUploadFailed"), "error");
  }

  function handleFolderDrop(event, destinationPath = path) {
    event.preventDefault();
    setDropActive(false);
    uploadDroppedFiles(event.dataTransfer.files, destinationPath);
  }

  function handlePreview(file) {
    setMenu(null);
    setPreviewModal({ key: file.key, name: file.name });
  }

  async function copyFileLink(file) {
    setMenu(null);
    const link = `${window.location.origin}/file?key=${encodeURIComponent(file.key)}`;
    try {
      await navigator.clipboard.writeText(link);
      showToast(t("linkCopied"));
    } catch {
      window.prompt(t("copyLink"), link);
    }
  }

  async function renameItem(item) {
    setMenu(null);
    setRenameTarget(item);
  }

  async function submitRename(newName) {
    const item = renameTarget;
    if (!item || !newName.trim() || newName.trim() === item.name) return false;
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/api/files/rename`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ key: item.key, newName: newName.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || "Could not rename item", "error");
        return false;
      }
      showToast(t("renameSuccess"));
      await load(path);
      loadFavorites();
      return true;
    } catch {
      showToast("Cannot connect to server", "error");
      return false;
    }
  }

  function requestDownload(file) {
    setMenu(null);
    setConfirm({
      title: t("download") + "?",
      message: `${t("download")} "${file.name}"?`,
      confirmLabel: t("download"),
      danger: false,
      onConfirm: () => doDownload(file),
    });
  }

  async function doDownload(file) {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(
        `${API_BASE}/api/files/download?key=${encodeURIComponent(file.key)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || "Download failed", "error");
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name || "download";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast(`Downloading "${file.name}"`);
    } catch {
      showToast("Cannot connect to server", "error");
    }
  }

  function requestTrash(item, isFolder) {
    setMenu(null);
    setConfirm({
      title: isFolder ? t("deleteFolder") + "?" : t("moveToTrash") + "?",
      message: `"${item.name}"`,
      confirmLabel: isFolder ? t("deleteFolder") : t("moveToTrash"),
      danger: true,
      onConfirm: () => doTrash(item),
    });
  }

  async function doTrash(item) {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${API_BASE}/api/files/trash`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ key: item.key }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || "Could not move to trash", "error");
        return;
      }
      showToast(
        item.key.endsWith("/")
          ? `"${item.name}" ${t("deleteFolder")}`
          : `"${item.name}" → trash`
      );
      load(path);
    } catch {
      showToast("Cannot connect to server", "error");
    }
  }

  async function toggleFavorite(file) {
    setMenu(null);
    const token = localStorage.getItem("token");
    const isFav = favoriteKeys.has(file.key);
    try {
      const res = await fetch(`${API_BASE}/api/favorites`, {
        method: isFav ? "DELETE" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(
          isFav ? { fileKey: file.key } : { fileKey: file.key, fileName: file.name }
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || "Favorite failed", "error");
        return;
      }
      setFavoriteKeys((prev) => {
        const next = new Set(prev);
        if (isFav) next.delete(file.key);
        else next.add(file.key);
        return next;
      });
      showToast(
        isFav
          ? `"${file.name}" ${t("removeFavorite")}`
          : `"${file.name}" ${t("addFavorite")}`
      );
    } catch {
      showToast("Cannot connect to server", "error");
    }
  }

  async function openMoveModal(item) {
    setMenu(null);
    setMoveModal(item);
    setMoveFolderOptions([]);

    const token = localStorage.getItem("token");
    const rootPath = getUserRootPath(user);

    try {
      const resRoot = await fetch(
        `${API_BASE}/api/files?path=${encodeURIComponent(rootPath)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const dataRoot = await resRoot.json();
      const fromRoot = resRoot.ok ? dataRoot.folders || [] : [];
      const fromHere = folders || [];

      const map = new Map();
      [...fromRoot, ...fromHere].forEach((f) => {
        const key = f.key.endsWith("/") ? f.key : `${f.key}/`;
        map.set(key, { key, name: f.name });
      });
      setMoveFolderOptions([...map.values()]);
    } catch {
      setMoveFolderOptions(
        (folders || []).map((f) => ({
          key: f.key.endsWith("/") ? f.key : `${f.key}/`,
          name: f.name,
        }))
      );
    }
  }

  async function openShareModal(item) {
    setShareModal(item);
    setShareRecipients([]);
    setSelectedShareUserIds([]);
    setShareSearch("");
    setShareRecipientsError("");
    setShareRecipientsLoading(true);
    const isFolder =
      (typeof item.key === "string" && item.key.endsWith("/")) || item.type === "folder";
    let fileKey = item.key;
    if (isFolder && fileKey && !fileKey.endsWith("/")) {
      fileKey = `${fileKey}/`;
    }

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/api/shares/recipients?fileKey=${encodeURIComponent(fileKey)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setShareRecipientsError(data.error || "Could not load users");
        return;
      }
      const recipients = data.recipients || [];
      setShareRecipients(recipients);
      setSelectedShareUserIds(recipients.filter((recipient) => recipient.alreadyShared).map((recipient) => recipient.id));
      setRecipientPermissions(Object.fromEntries(recipients.map((recipient) => [recipient.id, recipient.permission || sharePermission])));
    } catch {
      setShareRecipientsError("Cannot connect to server");
    } finally {
      setShareRecipientsLoading(false);
    }
  }

  function toggleShareRecipient(userId) {
    setSelectedShareUserIds((current) => current.includes(userId)
      ? current.filter((id) => id !== userId)
      : [...current, userId]);
  }

  function setRecipientPermission(userId, permission) {
    setRecipientPermissions((current) => ({ ...current, [userId]: permission }));
  }

  async function handleShare(e) {
    e.preventDefault();
    if (!shareModal) return;
    setSharing(true);
    const token = localStorage.getItem("token");

    const isFolder =
      (typeof shareModal.key === "string" && shareModal.key.endsWith("/")) ||
      shareModal.type === "folder";
    let fileKey = shareModal.key;
    if (isFolder && fileKey && !fileKey.endsWith("/")) fileKey = `${fileKey}/`;
    const revokeUserIds = shareRecipients
      .filter((recipient) => recipient.alreadyShared && !selectedShareUserIds.includes(recipient.id))
      .map((recipient) => recipient.id);
    if (selectedShareUserIds.length === 0 && revokeUserIds.length === 0) {
      setSharing(false);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/shares`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fileKey,
          fileName: shareModal.name,
          userIds: selectedShareUserIds,
          revokeUserIds,
          permissionByUserId: Object.fromEntries(selectedShareUserIds.map((id) => [id, recipientPermissions[id] || sharePermission])),
          isFolder: !!isFolder,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || "Share failed", "error");
        return;
      }
      const sharedCount = data.shares?.length || 0;
      const updatedCount = data.updatedShares?.length || 0;
      const revokedCount = data.revokedUserIds?.length || 0;
      showToast(`${t("shareComplete")}: ${sharedCount} · ${t("permissionsUpdated")}: ${updatedCount} · ${t("accessRemoved")}: ${revokedCount}`);
      setShareModal(null);
    } catch {
      showToast("Cannot connect to server", "error");
    } finally {
      setSharing(false);
    }
  }

  function doMove(file, destinationPath) {
    setMoveModal(null);
    setConfirm({
      title: t("move") + "?",
      message: `${t("move")} "${file.name}"?`,
      confirmLabel: t("move"),
      danger: false,
      onConfirm: async () => {
        const token = localStorage.getItem("token");
        try {
          const res = await fetch(`${API_BASE}/api/files/move`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ key: file.key, destinationPath }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            showToast(data.error || "Move failed", "error");
            return;
          }
          showToast(`"${file.name}" ${t("move")}`);
          load(path);
        } catch {
          showToast("Cannot connect to server", "error");
        }
      },
    });
  }

  const crumbs = breadcrumbParts();
  const root = getUserRootPath(user);
  const canGoUp = path !== root && path.length > root.length;

  const moveDestinations = [];
  if (moveModal) {
    const fileKey = moveModal.key || "";
    const relative = fileKey.startsWith(root) ? fileKey.slice(root.length) : "";
    const parts = relative.split("/").filter(Boolean);

    let currentDir = root;
    if (parts.length > 1) {
      currentDir = root + parts.slice(0, -1).join("/") + "/";
    }

    if (parts.length > 1) {
      moveDestinations.push({ key: root, name: t("leaveRoot") });
    }
    if (parts.length > 2) {
      const parentPath = root + parts.slice(0, -2).join("/") + "/";
      moveDestinations.push({ key: parentPath, name: t("parentFolder") });
    }
    moveFolderOptions.forEach((f) => {
      const dest = f.key.endsWith("/") ? f.key : `${f.key}/`;
      if (dest === currentDir) return;
      moveDestinations.push({
        key: dest,
        name: `${t("goToFolder")} “${f.name}”`,
      });
    });
  }

  const shareIsFolder =
    shareModal &&
    ((typeof shareModal.key === "string" && shareModal.key.endsWith("/")) ||
      shareModal.type === "folder");

  return (
    <div className="myfiles-page">
      <style>{`
        .myfiles-page { width: 100%; max-width: 100%; }
        .myfiles-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 8px;
        }
        .myfiles-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .myfiles-breadcrumb {
          margin: 12px 0 16px;
          font-size: 0.9rem;
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .file-card-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
          gap: 14px;
          padding: 18px;
        }
        .file-card {
          position: relative;
          min-width: 0;
          overflow: hidden;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          background: #fff;
          transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
        }
        .file-card:hover {
          transform: translateY(-2px);
          border-color: #cbd5e1;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.1);
        }
        .file-card-preview {
          display: flex;
          width: 100%;
          height: 142px;
          align-items: center;
          justify-content: center;
          border: 0;
          border-bottom: 1px solid #eef2f7;
          background: linear-gradient(135deg, #f8fafc, #eef2ff);
          cursor: pointer;
        }
        .file-card-thumbnail { width: 100%; height: 100%; object-fit: cover; }
        .file-card-details { padding: 12px 42px 13px 13px; }
        .file-card-name { overflow: hidden; color: #0f172a; font-size: 0.9rem; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
        .file-card-meta { margin-top: 5px; color: #64748b; font-size: 0.78rem; }
        .file-card-favorite { margin-right: 5px; color: #f59e0b; }
        .file-card-menu { position: absolute; top: 8px; right: 8px; border: 0; border-radius: 8px; background: rgba(255,255,255,0.92); color: #475569; cursor: pointer; font-size: 18px; line-height: 1; padding: 6px 9px; }
        .file-card-menu:hover { background: #fff; color: #0f172a; }
        .menu-floating {
          position: fixed;
          z-index: 10050;
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          box-shadow: 0 12px 40px rgba(15,23,42,0.18);
          min-width: 200px;
          padding: 6px;
          text-align: left;
        }
        .menu-floating button {
          display: block;
          width: 100%;
          text-align: left;
          padding: 11px 14px;
          border: none;
          background: transparent;
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.9rem;
          color: #0f172a;
        }
        .menu-floating button:hover { background: #f1f5f9; }
        .menu-floating button.danger { color: #dc2626; }
        @media (max-width: 768px) {
          .myfiles-header {
            flex-direction: column;
            align-items: stretch;
          }
          .myfiles-actions { width: 100%; }
          .myfiles-actions .btn {
            flex: 1;
            justify-content: center;
            min-height: 42px;
          }
          .page-heading { font-size: 1.35rem !important; }
          .page-subtext { font-size: 0.85rem; }
          .file-card-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 12px; gap: 10px; }
          .file-card-preview { height: 112px; }
          .menu-floating {
            min-width: min(240px, calc(100vw - 24px));
          }
        }
      `}</style>

      <div
        style={{
          position: "fixed",
          bottom: 24,
          right: 16,
          left: 16,
          zIndex: 10060,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          alignItems: "flex-end",
          pointerEvents: "none",
        }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            style={{
              pointerEvents: "auto",
              background: toast.type === "error" ? "#991b1b" : "#0f172a",
              color: "#fff",
              padding: "12px 16px",
              borderRadius: 10,
              fontSize: "0.9rem",
              maxWidth: 360,
              boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
            }}
          >
            {toast.message}
          </div>
        ))}
      </div>

      <div className="myfiles-header">
        <div>
          <h2 className="page-heading">{t("myFilesTitle")}</h2>
          <p className="page-subtext">{t("myFilesSub")}</p>
        </div>
        <div className="myfiles-actions">
          <input
            ref={uploadInputRef}
            type="file"
            accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.json,.zip,.txt,.css,.js"
            hidden
            onChange={handleUploadHere}
          />
          <button
            className="btn btn-outline"
            type="button"
            onClick={() => {
              if (uploadInputRef.current) {
                uploadInputRef.current.value = "";
                uploadInputRef.current.click();
              }
            }}
          >
            {t("uploadHere")}
          </button>
          <button className="btn btn-solid" type="button" onClick={() => setFolderModal(true)}>
            + {t("newFolder")}
          </button>
        </div>
      </div>

      <div className="myfiles-breadcrumb">
        <button
          type="button"
          className="btn btn-outline"
          style={{ padding: "4px 10px", fontSize: "0.8rem" }}
          onClick={() => {
            setPath(root);
            load(root);
          }}
        >
          {t("myFiles")}
        </button>
        {crumbs.map((c, i) => (
          <span key={`${c}-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ opacity: 0.5 }}>/</span>
            <span style={{ fontWeight: i === crumbs.length - 1 ? 600 : 400 }}>{c}</span>
          </span>
        ))}
        {canGoUp && (
          <button
            type="button"
            className="btn btn-outline"
            style={{ padding: "4px 10px", fontSize: "0.8rem", marginLeft: 4 }}
            onClick={goUp}
          >
            ↑ {t("up")}
          </button>
        )}
      </div>

      {error && (
        <div style={{ color: "#ef4444", marginBottom: 12, fontSize: "0.85rem" }}>{error}</div>
      )}

      <div
        className={`table-card myfiles-table-wrap${dropActive ? " files-drop-active" : ""}`}
        onDragEnter={(event) => {
          if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDropActive(true); }
        }}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("Files")) event.preventDefault();
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setDropActive(false);
        }}
        onDrop={(event) => handleFolderDrop(event, path)}
      >
        {dropActive && <div className="files-drop-hint">{t("dropFilesHere")}</div>}
        {loading ? (
          <div style={{ padding: 24, textAlign: "center" }}>{t("loading")}</div>
        ) : folders.length === 0 && files.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">{t("emptyFolder")}</div>
            <div className="empty-state-text">{t("emptyFolderHint")}</div>
          </div>
        ) : (
          <div className="file-card-grid">
            {folders.map((folder) => (
              <FileCard
                key={folder.key}
                item={folder}
                folder
                onOpen={openFolder}
                onMenu={openMenu}
                dropHint={t("dropFilesIntoFolder")}
                onFileDrop={(droppedFiles) => uploadDroppedFiles(droppedFiles, folder.key)}
              />
            ))}
            {files.map((file) => (
              <FileCard key={file.key} item={file} favorite={favoriteKeys.has(file.key)} onOpen={handlePreview} onMenu={openMenu} />
            ))}
          </div>
        )}
      </div>

      {menu && (
        <div
          ref={menuPanelRef}
          className="menu-floating"
          style={{ top: menu.top, left: menu.left }}
        >
          {menu.isFolder ? (
            <>
              <button type="button" onClick={() => openFolder(menu.item.key)}>
                {t("open")}
              </button>
              <button type="button" onClick={() => renameItem(menu.item)}>{t("rename")}</button>
              <button
                type="button"
                onClick={() => {
                  setMenu(null);
                  openShareModal(menu.item);
                }}
              >
                {t("shareEllipsis")}
              </button>
              <button type="button" onClick={() => openMoveModal(menu.item)}>
                {t("moveEllipsis")}
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => requestTrash(menu.item, true)}
              >
                {t("deleteFolder")}
              </button>
            </>
          ) : (
            <>
              {canPreview(menu.item.name) && (
                <button type="button" onClick={() => handlePreview(menu.item)}>
                  {t("preview")}
                </button>
              )}
              <button type="button" onClick={() => requestDownload(menu.item)}>
                {t("download")}
              </button>
              <button type="button" onClick={() => renameItem(menu.item)}>{t("rename")}</button>
              <button type="button" onClick={() => copyFileLink(menu.item)}>
                {t("copyLink")}
              </button>
              <button type="button" onClick={() => toggleFavorite(menu.item)}>
                {favoriteKeys.has(menu.item.key) ? t("removeFavorite") : t("addFavorite")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenu(null);
                  openShareModal(menu.item);
                }}
              >
                {t("shareEllipsis")}
              </button>
              <button type="button" onClick={() => openMoveModal(menu.item)}>
                {t("moveToFolder")}
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => requestTrash(menu.item, false)}
              >
                {t("moveToTrash")}
              </button>
            </>
          )}
        </div>
      )}

      {folderModal && (
        <Modal onClose={() => setFolderModal(false)}>
          <h3 style={{ margin: "0 0 6px", fontSize: "1.15rem" }}>{t("newFolderTitle")}</h3>
          <p style={{ margin: "0 0 16px", color: "#64748b", fontSize: "0.9rem" }}>
            {t("newFolderHint")}
          </p>
          <form onSubmit={handleCreateFolder}>
            <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>{t("folderName")}</label>
            <input
              type="text"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="e.g. Project"
              style={inputStyle}
              autoFocus
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button type="button" className="btn btn-outline" onClick={() => setFolderModal(false)}>
                {t("cancel")}
              </button>
              <button
                type="submit"
                className="btn btn-solid"
                disabled={creating || !folderName.trim()}
              >
                {creating ? t("creating") : t("create")}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {shareModal && (
        <Modal onClose={() => setShareModal(null)}>
          <h3 style={{ margin: "0 0 6px", fontSize: "1.15rem" }}>
            {shareIsFolder ? t("shareFolder") : t("shareFile")}
          </h3>
          <p style={{ margin: "0 0 16px", color: "#64748b", fontSize: "0.9rem" }}>
            <b>{shareModal.name}</b>
          </p>
          <form onSubmit={handleShare}>
            <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>{t("selectUsers")}</label>
            <input
              type="search"
              value={shareSearch}
              onChange={(e) => setShareSearch(e.target.value)}
              placeholder={t("searchUsers")}
              style={inputStyle}
              autoFocus
            />
            <div style={{ marginTop: 8, maxHeight: 240, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 10 }}>
              {shareRecipientsLoading ? (
                <div style={{ padding: 16, color: "#64748b", textAlign: "center" }}>{t("loading")}</div>
              ) : shareRecipientsError ? (
                <div style={{ padding: 12, color: "#dc2626" }}>{shareRecipientsError}</div>
              ) : shareRecipients.filter((recipient) => `${recipient.first_name} ${recipient.last_name} ${recipient.email}`.toLowerCase().includes(shareSearch.trim().toLowerCase())).length === 0 ? (
                <div style={{ padding: 16, color: "#64748b", textAlign: "center" }}>{t("noUsersToShare")}</div>
              ) : (
                shareRecipients
                  .filter((recipient) => `${recipient.first_name} ${recipient.last_name} ${recipient.email}`.toLowerCase().includes(shareSearch.trim().toLowerCase()))
                  .map((recipient) => (
                    <label
                      key={recipient.id}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: "1px solid #f1f5f9", cursor: "pointer", opacity: sharing ? 0.65 : 1 }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedShareUserIds.includes(recipient.id)}
                        disabled={sharing}
                        onChange={() => toggleShareRecipient(recipient.id)}
                      />
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: "block", fontWeight: 600 }}>{recipient.first_name} {recipient.last_name}</span>
                        <span style={{ display: "block", color: "#64748b", fontSize: "0.8rem" }}>{recipient.email}</span>
                      </span>
                      {recipient.alreadyShared && (
                        <span className="tag tag-gray">
                          {selectedShareUserIds.includes(recipient.id) ? t("alreadyShared") : t("accessWillBeRemoved")}
                        </span>
                      )}
                      {selectedShareUserIds.includes(recipient.id) && (
                        <select
                          aria-label={`${t("permission")} ${recipient.email}`}
                          value={recipientPermissions[recipient.id] || sharePermission}
                          disabled={sharing}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => setRecipientPermission(recipient.id, event.target.value)}
                          style={{ ...inputStyle, width: "auto", minWidth: 120, margin: 0, padding: "6px 8px" }}
                        >
                          <option value="Read Only">{t("readOnly")}</option>
                          <option value="Read & Write">{t("readWrite")}</option>
                        </select>
                      )}
                    </label>
                  ))
              )}
            </div>
            <div style={{ marginTop: 6, fontSize: "0.8rem", color: "#64748b" }}>
              {t("selectedUsers")}: {selectedShareUserIds.length}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button type="button" className="btn btn-outline" onClick={() => setShareModal(null)}>
                {t("cancel")}
              </button>
              <button
                type="submit"
                className="btn btn-solid"
                disabled={sharing || shareRecipientsLoading || shareRecipientsError !== "" || (selectedShareUserIds.length === 0 && !shareRecipients.some((recipient) => recipient.alreadyShared))}
              >
                {sharing ? t("sharing") : t("applySharingChanges")}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {moveModal && (
        <Modal onClose={() => setMoveModal(null)}>
          <h3 style={{ margin: "0 0 6px", fontSize: "1.15rem" }}>{t("move")}</h3>
          <p style={{ margin: "0 0 16px", color: "#64748b", fontSize: "0.9rem" }}>
            <b>{moveModal.name}</b>
            <br />
            {t("moveHint")}
          </p>
          {moveDestinations.length === 0 ? (
            <p style={{ color: "#64748b" }}>{t("noDestination")}</p>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                maxHeight: 280,
                overflowY: "auto",
              }}
            >
              {moveDestinations.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => doMove(moveModal, d.key)}
                  style={{
                    textAlign: "left",
                    padding: "12px 14px",
                    borderRadius: 10,
                    border: "1px solid #e2e8f0",
                    background: "#f8fafc",
                    cursor: "pointer",
                    fontWeight: 500,
                  }}
                >
                  {d.name}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
            <button type="button" className="btn btn-outline" onClick={() => setMoveModal(null)}>
              {t("cancel")}
            </button>
          </div>
        </Modal>
      )}

      {confirm && (
        <ActionModal
          open
          title={confirm.title}
          description={confirm.message}
          confirmLabel={confirm.confirmLabel}
          cancelLabel={t("cancel")}
          danger={confirm.danger}
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            const fn = confirm.onConfirm;
            setConfirm(null);
            fn?.();
          }}
        />
      )}

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

      {previewModal && (
        <FilePreviewModal
          fileKey={previewModal.key}
          fileName={previewModal.name}
          onClose={() => setPreviewModal(null)}
        />
      )}
    </div>
  );
}

function Modal({ children, onClose }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10040,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 14,
          padding: 24,
          width: "100%",
          maxWidth: 420,
          boxShadow: "0 20px 50px rgba(0,0,0,0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  marginTop: 6,
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid #e2e8f0",
  fontSize: "0.95rem",
  boxSizing: "border-box",
};