import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getLang, setLang, t } from "../i18n.js";
import { API_BASE } from "../config.js";

function timeAgo(value) {
  if (!value) return "";
  const sec = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (sec < 60) return t("justNow");
  if (sec < 3600) return `${Math.floor(sec / 60)} ${t("minAgo")}`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} ${t("hoursAgo")}`;
  return `${Math.floor(sec / 86400)} ${t("daysAgo")}`;
}

export default function Topbar({
  title,
  breadcrumbs = [],
  user,
  darkMode,
  onToggleDarkMode,
  onUploadClick,
  onMenuClick,
}) {
  const navigate = useNavigate();
  const [lang, setLangState] = useState(getLang());
  const [, setTick] = useState(0);

  const [q, setQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [results, setResults] = useState({ files: [], folders: [], users: [] });

  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notifLoading, setNotifLoading] = useState(false);

  const searchRef = useRef(null);
  const notifRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    function onLang() {
      setLangState(getLang());
      setTick((x) => x + 1);
    }
    window.addEventListener("sd-lang-change", onLang);
    return () => window.removeEventListener("sd-lang-change", onLang);
  }, []);

  function switchLang(next) {
    setLang(next);
    setLangState(next);
    setTick((x) => x + 1);
  }

  useEffect(() => {
    function onDocClick(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setSearchOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults({ files: [], folders: [], users: [] });
      setSearchOpen(false);
      return;
    }
    // eslint-disable-next-line react-hooks/immutability
    debounceRef.current = setTimeout(() => runSearch(q.trim()), 300);
    return () => clearTimeout(debounceRef.current);
  }, [q]);

  async function runSearch(query) {
    const token = localStorage.getItem("token");
    if (!token) return;
    setSearchLoading(true);
    setSearchOpen(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/search?q=${encodeURIComponent(query)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResults({ files: [], folders: [], users: [] });
        return;
      }
      setResults({
        files: data.files || [],
        folders: data.folders || [],
        users: data.users || [],
      });
    } catch {
      setResults({ files: [], folders: [], users: [] });
    } finally {
      setSearchLoading(false);
    }
  }

  async function loadNotifications() {
    const token = localStorage.getItem("token");
    if (!token) return;
    setNotifLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setNotifications(data.notifications || []);
    } catch {
      /* ignore */
    } finally {
      setNotifLoading(false);
    }
  }

  function toggleNotifications(e) {
    e.stopPropagation();
    const next = !showNotifications;
    setShowNotifications(next);
    setSearchOpen(false);
    if (next) loadNotifications();
  }

  function goFiles() {
    setSearchOpen(false);
    setQ("");
    navigate("/admin/files");
  }

  function goUsers() {
    setSearchOpen(false);
    setQ("");
    navigate("/admin/users");
  }

  const hasResults =
    results.files.length + results.folders.length + results.users.length > 0;

  return (
    <header className="topbar">
      <div className="topbar-left">
        {onMenuClick && (
          <button
            type="button"
            className="icon-btn mobile-menu-btn"
            aria-label="Open menu"
            onClick={onMenuClick}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        )}

        {breadcrumbs.length > 0 && (
          <div className="breadcrumb">
            {breadcrumbs.map((crumb, i) => (
              <React.Fragment key={`${crumb}-${i}`}>
                {i > 0 && <span>/</span>}
                <span className={i === breadcrumbs.length - 1 ? "crumb-current" : ""}>
                  {crumb}
                </span>
              </React.Fragment>
            ))}
          </div>
        )}
        <h1 className="topbar-title">{title}</h1>
      </div>

      <div className="topbar-search" ref={searchRef} style={{ position: "relative" }}>
        <SearchIcon />
        <input
          type="text"
          placeholder={t("searchPlaceholder")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => q.trim() && setSearchOpen(true)}
        />

        {searchOpen && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              left: 0,
              right: 0,
              background: "var(--bg-surface, #fff)",
              border: "1px solid var(--border-color, #e2e8f0)",
              borderRadius: 12,
              boxShadow: "var(--shadow-md, 0 8px 24px rgba(0,0,0,0.12))",
              zIndex: 30,
              maxHeight: 360,
              overflowY: "auto",
            }}
          >
            {searchLoading && (
              <div style={{ padding: 12, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                {t("searching")}
              </div>
            )}
            {!searchLoading && !hasResults && (
              <div style={{ padding: 12, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                {t("noResults")} “{q}”
              </div>
            )}
            {!searchLoading &&
              results.folders.map((f) => (
                <button key={f.key} type="button" onClick={goFiles} style={resultRow}>
                  📁 {f.name}
                </button>
              ))}
            {!searchLoading &&
              results.files.map((f) => (
                <button key={f.key} type="button" onClick={goFiles} style={resultRow}>
                  📄 {f.name}
                </button>
              ))}
            {!searchLoading &&
              results.users.map((u) => (
                <button key={u.id} type="button" onClick={goUsers} style={resultRow}>
                  👤 {u.name} · {u.email}
                </button>
              ))}
          </div>
        )}
      </div>

      <div className="topbar-right">
        {onUploadClick && (
          <button className="btn-primary-upload" onClick={onUploadClick}>
            <UploadIcon /> {t("uploadFiles")}
          </button>
        )}

        {/* Language switch EN | FR */}
        <div style={{ display: "flex", gap: 2, alignItems: "center", marginRight: 4 }}>
          <button
            type="button"
            className="icon-btn"
            onClick={() => switchLang("en")}
            title="English"
            style={{
              fontWeight: lang === "en" ? 700 : 400,
              opacity: lang === "en" ? 1 : 0.5,
              fontSize: "0.75rem",
              minWidth: 32,
              padding: "6px 8px",
            }}
          >
            EN
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => switchLang("fr")}
            title="Français"
            style={{
              fontWeight: lang === "fr" ? 700 : 400,
              opacity: lang === "fr" ? 1 : 0.5,
              fontSize: "0.75rem",
              minWidth: 32,
              padding: "6px 8px",
            }}
          >
            FR
          </button>
        </div>

        <button className="icon-btn" onClick={onToggleDarkMode} aria-label="Toggle theme">
          {darkMode ? <SunIcon /> : <MoonIcon />}
        </button>

        <button className="icon-btn" aria-label="Help">
          <HelpIcon />
        </button>

        <div style={{ position: "relative" }} ref={notifRef}>
          <button
            className="icon-btn"
            aria-label="Notifications"
            onClick={toggleNotifications}
          >
            <BellIcon />
            {notifications.length > 0 && (
              <span className="notification-badge">
                {notifications.length > 9 ? "9+" : notifications.length}
              </span>
            )}
          </button>
          {showNotifications && (
            <div
              style={{
                position: "absolute",
                top: 42,
                right: 0,
                width: 300,
                maxWidth: "calc(100vw - 24px)",
                background: "var(--bg-surface)",
                border: "1px solid var(--border-color)",
                borderRadius: 12,
                boxShadow: "var(--shadow-md)",
                padding: 12,
                zIndex: 20,
                maxHeight: 400,
                overflowY: "auto",
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 8, fontSize: "0.9rem" }}>
                {t("notifications")}
              </div>
              {notifLoading && (
                <div style={{ fontSize: "0.83rem", color: "var(--text-secondary)" }}>
                  {t("loading")}
                </div>
              )}
              {!notifLoading && notifications.length === 0 && (
                <div style={{ fontSize: "0.83rem", color: "var(--text-secondary)" }}>
                  {t("noNotifications")}
                </div>
              )}
              {!notifLoading &&
                notifications.map((n) => (
                  <div
                    key={n.id}
                    style={{
                      padding: "8px 4px",
                      borderBottom: "1px solid var(--border-color)",
                    }}
                  >
                    <div style={{ fontSize: "0.83rem", fontWeight: 700 }}>{n.title}</div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                      {n.body}
                    </div>
                    <div
                      style={{
                        fontSize: "0.7rem",
                        color: "var(--text-secondary)",
                        marginTop: 2,
                      }}
                    >
                      {timeAgo(n.createdAt)}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        <div className="topbar-user" onClick={() => navigate("/admin/profile")}>
          <div
            className="avatar-circle"
            style={{ background: user?.avatarColor || "#2563eb" }}
          >
            {user?.initials || "U"}
          </div>
          <div>
            <div className="topbar-user-name">{user?.fullName}</div>
            <div className="topbar-user-role">{user?.role}</div>
          </div>
        </div>
      </div>
    </header>
  );
}

const resultRow = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "10px 12px",
  border: "none",
  background: "transparent",
  cursor: "pointer",
  fontSize: "0.85rem",
};

function iconProps() {
  return {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
  };
}
function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}
function UploadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
      <path d="M12 16V4M6 10l6-6 6 6" />
      <path d="M4 20h16" />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M20 14.5A8.5 8.5 0 019.5 4 8.5 8.5 0 1020 14.5z" />
    </svg>
  );
}
function SunIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </svg>
  );
}
function HelpIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 014.8 1c0 1.6-2.3 1.8-2.3 3.5" />
      <path d="M12 17.5h.01" />
    </svg>
  );
}
function BellIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 01-3.4 0" />
    </svg>
  );
}