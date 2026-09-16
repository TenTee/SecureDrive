import { useEffect, useState } from "react";
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

    if (!token || !rawUser) {
      navigate("/login");
      return;
    }

    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUser(buildDisplayUser(JSON.parse(rawUser)));
    } catch {
      navigate("/login");
    }
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

  const meta = getPageMeta(location.pathname);

  function addFile(file) {
    setFiles((prev) => [file, ...prev]);
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
          <Outlet context={{ user, files, addFile, filesLoading, setFiles }} />
        </div>
      </div>

      {uploadOpen && (
        <UploadFile onClose={() => setUploadOpen(false)} onUpload={addFile} />
      )}
    </div>
  );
}