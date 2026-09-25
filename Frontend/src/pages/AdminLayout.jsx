import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import Sidebar from "./Sidebar.jsx";
import Topbar from "./Topbar.jsx";
import UploadFile from "./UploadFile.jsx";
import { t } from "../i18n.js";
import { API_BASE } from "../config.js";
import "./AdminDashboard.css";

const ROLE_AVATAR_COLOR = {
  "Super Admin": "#2563eb",
  Manager: "#7c3aed",
  Editor: "#d97706",
  User: "#0891b2",
};

function getPageMeta(pathname) {
  const map = {
    "/admin/dashboard": {
      title: t("dashboard"),
      breadcrumbs: ["SecureDrive", t("dashboard")],
      upload: true,
    },
    "/admin/files": {
      title: t("myFiles"),
      breadcrumbs: ["SecureDrive", t("myFiles")],
      upload: true,
    },
    "/admin/shared-with-me": {
      title: t("sharedWithMe"),
      breadcrumbs: ["SecureDrive", t("sharedWithMe")],
      upload: false,
    },
    "/admin/shared-by-me": {
      title: t("sharedByMe"),
      breadcrumbs: ["SecureDrive", t("sharedByMe")],
      upload: false,
    },
    "/admin/recent": {
      title: t("recent"),
      breadcrumbs: ["SecureDrive", t("recent")],
      upload: false,
    },
    "/admin/favorites": {
      title: t("favorites"),
      breadcrumbs: ["SecureDrive", t("favorites")],
      upload: false,
    },
    "/admin/trash": {
      title: t("trash"),
      breadcrumbs: ["SecureDrive", t("trash")],
      upload: false,
    },
    "/admin/users": {
      title: t("userManagement"),
      breadcrumbs: ["SecureDrive", t("administration"), t("userManagement")],
      upload: false,
    },
    "/admin/activity": {
      title: t("activityLog"),
      breadcrumbs: ["SecureDrive", t("administration"), t("activityLog")],
      upload: false,
    },
    "/admin/settings": {
      title: t("systemSettings"),
      breadcrumbs: ["SecureDrive", t("administration"), t("systemSettings")],
      upload: false,
    },
    "/admin/profile": {
      title: t("myAccount"),
      breadcrumbs: ["SecureDrive", t("myAccount")],
      upload: false,
    },
  };

  return (
    map[pathname] || {
      title: "SecureDrive",
      breadcrumbs: [],
      upload: false,
    }
  );
}

function buildDisplayUser(rawUser) {
  const fullName = `${rawUser.firstName} ${rawUser.lastName}`;
  const initials = (
    (rawUser.firstName?.[0] || "") + (rawUser.lastName?.[0] || "")
  ).toUpperCase();

  return {
    ...rawUser,
    fullName,
    initials,
    avatarColor: ROLE_AVATAR_COLOR[rawUser.role] || "#64748b",
    employeeId: rawUser.employeeId || "—",
    department: rawUser.department || "—",
    status: "Active",
    storageUsedGB: 0,
    storageTotalGB: 25,
    filesOwned: 0,
    sharedByMeCount: 0,
    lastLogin: "Just now",
  };
}

function mapS3File(item) {
  const rawName = item.key.includes("/") ? item.key.split("/").pop() : item.key;
  if (!rawName) return null;

  const name = rawName.replace(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i,
    ""
  );

  const ext = name.split(".").pop()?.toLowerCase() || "";
  let type = "file";
  if (["png", "jpg", "jpeg", "gif", "svg"].includes(ext)) type = "image";
  else if (["doc", "docx"].includes(ext)) type = "doc";
  else if (["xls", "xlsx"].includes(ext)) type = "sheet";
  else if (["ppt", "pptx"].includes(ext)) type = "slides";
  else if (["json", "js", "jsx", "ts", "css"].includes(ext)) type = "code";
  else if (ext === "pdf") type = "pdf";

  const size =
    item.size < 1024
      ? `${item.size} B`
      : item.size < 1024 * 1024
        ? `${(item.size / 1024).toFixed(0)} KB`
        : `${(item.size / (1024 * 1024)).toFixed(1)} MB`;

  const modified = item.lastModified
    ? new Date(item.lastModified).toLocaleDateString("fr-FR")
    : "—";

  return {
    id: item.key,
    name: name || rawName,
    type,
    size,
    modified,
    starred: false,
    fileKey: item.key,
  };
}

function tokenHasExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.exp === "number" && payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

export default function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [darkMode, setDarkMode] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [files, setFiles] = useState([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [, setTick] = useState(0);
  const [uploadTransfer, setUploadTransfer] = useState(null);
  const uploadRequestRef = useRef(null);
  const uploadFinishRef = useRef(null);
  const redirectingRef = useRef(false);

  useEffect(() => {
    function onLang() {
      setTick((x) => x + 1);
    }
    window.addEventListener("sd-lang-change", onLang);
    return () => window.removeEventListener("sd-lang-change", onLang);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const rawUser = localStorage.getItem("user");

    function redirectToLogin() {
      if (redirectingRef.current) return;
      redirectingRef.current = true;
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      navigate("/login", { replace: true });
    }

    if (!token || !rawUser || tokenHasExpired(token)) {
      redirectToLogin();
      return;
    }

    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUser(buildDisplayUser(JSON.parse(rawUser)));
    } catch {
      redirectToLogin();
    }
  }, [navigate]);

  useEffect(() => {
    const originalFetch = window.fetch;

    function redirectToLogin() {
      if (redirectingRef.current) return;
      redirectingRef.current = true;
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      uploadRequestRef.current?.abort();
      navigate("/login", { replace: true });
    }

    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (response.status === 401) redirectToLogin();
      return response;
    };

    const interval = window.setInterval(() => {
      const token = localStorage.getItem("token");
      if (!token || tokenHasExpired(token)) redirectToLogin();
    }, 30000);

    return () => {
      window.fetch = originalFetch;
      window.clearInterval(interval);
    };
  }, [navigate]);

  useEffect(() => {
    async function loadFiles() {
      setFilesLoading(true);
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API_BASE}/api/files`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();

        if (res.ok && data.files) {
          const mapped = data.files.map(mapS3File).filter(Boolean);
          setFiles(mapped);
        }
      } catch (err) {
        console.error("Could not load files from S3:", err);
      } finally {
        setFilesLoading(false);
      }
    }

    loadFiles();
  }, []);

  useEffect(() => {
    document.body.classList.toggle("dark-mode", darkMode);
  }, [darkMode]);

  useEffect(() => () => {
    uploadRequestRef.current?.abort();
    window.clearTimeout(uploadFinishRef.current);
  }, []);

  const meta = getPageMeta(location.pathname);

  function addFile(file) {
    setFiles((prev) => [file, ...prev]);
  }

  function uploadFile(file, path, onSuccess) {
    if (!file) return;
    uploadRequestRef.current?.abort();
    const token = localStorage.getItem("token");
    const formData = new FormData();
    formData.append("file", file);
    if (path) formData.append("path", path);

    const request = new XMLHttpRequest();
    uploadRequestRef.current = request;
    setUploadTransfer({ name: file.name, loaded: 0, total: file.size || 0, progress: 0 });
    request.open("POST", `${API_BASE}/api/files/upload`);
    request.setRequestHeader("Authorization", `Bearer ${token}`);
    request.responseType = "json";
    request.upload.onprogress = (event) => {
      const total = event.lengthComputable ? event.total : file.size || 0;
      setUploadTransfer((current) => current ? {
        ...current,
        loaded: event.loaded,
        total,
        progress: total ? Math.round((event.loaded / total) * 100) : 0,
      } : current);
    };
    request.onload = () => {
      uploadRequestRef.current = null;
      const data = request.response || {};
      if (request.status < 200 || request.status >= 300) {
        if (request.status === 401) {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          navigate("/login", { replace: true });
          return;
        }
        setUploadTransfer({ error: data.error || "Upload failed" });
        return;
      }
      onSuccess?.(data);
      setUploadTransfer((current) => current ? { ...current, progress: 100, complete: true } : current);
      uploadFinishRef.current = window.setTimeout(() => setUploadTransfer(null), 900);
    };
    request.onerror = () => {
      uploadRequestRef.current = null;
      setUploadTransfer({ error: "Cannot connect to server" });
    };
    request.onabort = () => {
      uploadRequestRef.current = null;
      setUploadTransfer(null);
    };
    request.send(formData);
  }

  function cancelUpload() {
    window.clearTimeout(uploadFinishRef.current);
    uploadRequestRef.current?.abort();
    uploadRequestRef.current = null;
    setUploadTransfer(null);
  }

  if (!user) return null;

  return (
    <div className={`admin-shell${sidebarOpen ? " sidebar-open" : ""}`}>
      <div
        className="sidebar-overlay"
        onClick={() => setSidebarOpen(false)}
        aria-hidden={!sidebarOpen}
      />

      <Sidebar user={user} onNavigate={() => setSidebarOpen(false)} />

      <div className="admin-main">
        <Topbar
          title={meta.title}
          breadcrumbs={meta.breadcrumbs}
          user={user}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((d) => !d)}
          onUploadClick={meta.upload ? () => setUploadOpen(true) : null}
          onMenuClick={() => setSidebarOpen((v) => !v)}
        />
        <div className="admin-content">
          <Outlet context={{ user, files, addFile, filesLoading, setFiles, uploadFile }} />
        </div>
      </div>

      {uploadOpen && (
        <UploadFile
          onClose={() => setUploadOpen(false)}
          onUpload={addFile}
          onUploadFile={(file) => uploadFile(file, `uploads/${user.userId}/`, (data) => {
            addFile({
              id: data.fileKey,
              name: data.fileName,
              type: "file",
              size: data.size,
              modified: "Just now",
              starred: false,
              fileKey: data.fileKey,
            });
          })}
        />
      )}

      {uploadTransfer && <UploadProgress transfer={uploadTransfer} onCancel={cancelUpload} />}
    </div>
  );
}

function UploadProgress({ transfer, onCancel }) {
  if (transfer.error) {
    return (
      <div className="upload-progress-panel upload-progress-error" role="alert">
        <strong>{transfer.error}</strong>
        <button type="button" onClick={onCancel}>Fermer</button>
      </div>
    );
  }

  const hasTotal = Boolean(transfer.total);
  return (
    <div className="upload-progress-panel" role="status" aria-live="polite">
      <div className="upload-progress-head">
        <span className="upload-progress-name" title={transfer.name}>{transfer.name}</span>
        <span className="upload-progress-value">{transfer.complete ? "100%" : hasTotal ? `${transfer.progress}%` : "Envoi..."}</span>
      </div>
      <div className="upload-progress-track" aria-hidden="true">
        <div className={`upload-progress-bar${hasTotal ? "" : " indeterminate"}`} style={hasTotal ? { width: `${transfer.progress}%` } : undefined} />
      </div>
      {!transfer.complete && <button className="upload-cancel" type="button" onClick={onCancel}>Annuler le transfert</button>}
    </div>
  );
}