// Target of shared file links (/file?key=… → /admin/open?key=…).
// - access      → opens the file right away (editor for Office files, preview otherwise)
// - no access   → lets the user ask the owner for access, then shows the request status
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE } from "../config.js";
import { t } from "../i18n.js";
import { isOfficeFile } from "../office.js";
import FilePreviewModal from "../components/FilePreviewModal.jsx";

const PREVIEWABLE = ["png", "jpg", "jpeg", "gif", "svg", "webp", "pdf", "mp4", "webm", "ogg", "mov"];

function authHeaders(extra = {}) {
  return { Authorization: `Bearer ${localStorage.getItem("token")}`, ...extra };
}

export default function FileLink() {
  const [params] = useSearchParams();
  const fileKey = params.get("key") || "";
  const navigate = useNavigate();

  const [state, setState] = useState({ loading: true });
  const [permission, setPermission] = useState("Read Only");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState(false);

  async function load() {
    setState({ loading: true });
    try {
      const res = await fetch(`${API_BASE}/api/access-requests/link?key=${encodeURIComponent(fileKey)}`, {
        headers: authHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setState({ error: data.error || t("linkInvalid") });

      if (data.permission && isOfficeFile(data.fileName)) {
        navigate(`/editor?key=${encodeURIComponent(fileKey)}`, { replace: true });
        return;
      }
      setState({ data });
      if (data.permission && PREVIEWABLE.includes(data.fileName.split(".").pop().toLowerCase())) setPreview(true);
    } catch {
      setState({ error: "Cannot connect to server" });
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (fileKey) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileKey]);

  async function requestAccess(e) {
    e.preventDefault();
    setSending(true);
    try {
      const res = await fetch(`${API_BASE}/api/access-requests`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ fileKey, permission, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setState((s) => ({ ...s, formError: data.error || "Request failed" }));
      setState((s) => ({ data: { ...s.data, request: data.request } }));
    } catch {
      setState((s) => ({ ...s, formError: "Cannot connect to server" }));
    } finally {
      setSending(false);
    }
  }

  async function download() {
    const name = state.data.fileName;
    const res = await fetch(`${API_BASE}/api/files/download?key=${encodeURIComponent(fileKey)}`, {
      headers: authHeaders(),
    });
    if (!res.ok) return;
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  const card = {
    maxWidth: 520,
    margin: "48px auto",
    padding: 28,
    borderRadius: 14,
    border: "1px solid var(--border-color, #e2e8f0)",
    background: "var(--card-bg, #fff)",
  };
  const muted = { color: "var(--text-secondary, #64748b)", fontSize: "0.9rem" };

  if (!fileKey) return <div style={card}>{t("linkInvalid")}</div>;
  if (state.loading) return <div style={{ ...card, textAlign: "center", ...muted }}>{t("linkChecking")}</div>;
  if (state.error) {
    return (
      <div style={card}>
        <h3 style={{ marginTop: 0 }}>{t("linkUnavailable")}</h3>
        <p style={muted}>{state.error}</p>
        <button className="btn btn-outline" type="button" onClick={() => navigate("/admin/files")}>{t("myFiles")}</button>
      </div>
    );
  }

  const { data } = state;
  const request = data.request;

  // Has access (non-Office files): preview / download
  if (data.permission) {
    return (
      <div style={card}>
        <h3 style={{ margin: "0 0 6px", wordBreak: "break-word" }}>{data.fileName}</h3>
        <p style={{ ...muted, marginTop: 0 }}>
          {data.owner?.name} · {data.permission}
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {PREVIEWABLE.includes(data.fileName.split(".").pop().toLowerCase()) && (
            <button className="btn btn-solid" type="button" onClick={() => setPreview(true)}>{t("preview")}</button>
          )}
          <button className="btn btn-outline" type="button" onClick={download}>{t("download")}</button>
        </div>
        {preview && <FilePreviewModal fileKey={fileKey} fileName={data.fileName} onClose={() => setPreview(false)} />}
      </div>
    );
  }

  // No access: pending request
  if (request?.status === "pending") {
    return (
      <div style={card}>
        <div style={{ fontSize: 36 }}>⏳</div>
        <h3 style={{ margin: "8px 0 6px" }}>{t("accessRequestPending")}</h3>
        <p style={muted}>
          {t("accessRequestPendingHint").replace("{owner}", data.owner?.name || "").replace("{file}", data.fileName)}
        </p>
        <button className="btn btn-outline" type="button" onClick={load}>{t("refresh")}</button>
      </div>
    );
  }

  // No access: request form (first time or after a refusal)
  return (
    <div style={card}>
      <div style={{ fontSize: 36 }}>🔒</div>
      <h3 style={{ margin: "8px 0 6px" }}>{t("noAccessTitle")}</h3>
      <p style={muted}>
        {t("noAccessHint").replace("{owner}", data.owner?.name || "").replace("{file}", data.fileName)}
      </p>
      {request?.status === "denied" && (
        <p style={{ color: "#ef4444", fontSize: "0.88rem" }}>{t("accessRequestDenied")}</p>
      )}
      <form onSubmit={requestAccess} style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>
          {t("accessLevel")}
          <select
            value={permission}
            onChange={(e) => setPermission(e.target.value)}
            style={{ display: "block", width: "100%", marginTop: 6, padding: "10px 12px", borderRadius: 10, border: "1px solid #e2e8f0" }}
          >
            <option value="Read Only">{t("readOnly")}</option>
            <option value="Read & Write">{t("readWrite")}</option>
          </select>
        </label>
        <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>
          {t("accessMessage")}
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={500}
            rows={3}
            style={{ display: "block", width: "100%", marginTop: 6, padding: "10px 12px", borderRadius: 10, border: "1px solid #e2e8f0", boxSizing: "border-box", resize: "vertical" }}
          />
        </label>
        {state.formError && <div style={{ color: "#ef4444", fontSize: "0.85rem" }}>{state.formError}</div>}
        <button className="btn btn-solid" type="submit" disabled={sending}>
          {sending ? t("sending") : t("requestAccess")}
        </button>
      </form>
    </div>
  );
}
