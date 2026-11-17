import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { API_BASE, ONLYOFFICE_URL } from "../config.js";
import { getLang, t } from "../i18n.js";

const EDITOR_ELEMENT_ID = "securedrive-onlyoffice-editor";

let apiScriptPromise = null;
function loadDocsApi() {
  if (window.DocsAPI) return Promise.resolve();
  if (!apiScriptPromise) {
    apiScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `${ONLYOFFICE_URL}/web-apps/apps/api/documents/api.js`;
      script.async = true;
      script.onload = () => (window.DocsAPI ? resolve() : reject(new Error("DocsAPI missing")));
      script.onerror = () => {
        apiScriptPromise = null;
        script.remove();
        reject(new Error("Cannot load ONLYOFFICE api.js"));
      };
      document.body.appendChild(script);
    });
  }
  return apiScriptPromise;
}

export default function DocumentEditor() {
  const [params] = useSearchParams();
  const fileKey = params.get("key");
  const viewOnly = params.get("view") === "1"; // preview modal: read-only
  const embedded = params.get("embed") === "1"; // inside an iframe: no header
  const token = localStorage.getItem("token");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [readOnly, setReadOnly] = useState(false);

  useEffect(() => {
    if (!fileKey || !token) return undefined;
    let cancelled = false;
    let editor = null;

    async function start() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(
          `${API_BASE}/api/office/config?key=${encodeURIComponent(fileKey)}&lang=${getLang()}${viewOnly ? "&view=1" : ""}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not open the document");

        try {
          await loadDocsApi();
        } catch {
          throw new Error(t("editorUnavailable"));
        }
        if (cancelled) return;

        setTitle(data.config.document.title);
        setReadOnly(!data.canEdit);
        if (!embedded) document.title = `${data.config.document.title} – SecureDrive`;

        editor = new window.DocsAPI.DocEditor(EDITOR_ELEMENT_ID, {
          ...data.config,
          width: "100%",
          height: "100%",
          type: embedded ? "embedded" : "desktop",
          events: {
            onAppReady: () => !cancelled && setLoading(false),
            onError: (event) => !cancelled && setError(event?.data?.errorDescription || "Editor error"),
          },
        });
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      }
    }

    start();
    return () => {
      cancelled = true;
      if (editor) editor.destroyEditor();
    };
  }, [fileKey, token, viewOnly, embedded]);

  if (!token) {
    if (fileKey) localStorage.setItem("pendingFileLink", `/editor?key=${encodeURIComponent(fileKey)}`);
    return <Navigate to="/login" replace />;
  }
  if (!fileKey) return <Navigate to="/admin/files" replace />;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#f8fafc" }}>
      {!embedded && <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "8px 16px",
          borderBottom: "1px solid #e2e8f0",
          background: "#fff",
          minHeight: 48,
        }}
      >
        <a href="/admin/files" className="btn btn-outline" style={{ padding: "4px 10px", fontSize: "0.85rem" }}>
          ← SecureDrive
        </a>
        <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</strong>
        {readOnly && !error && (
          <span style={{ fontSize: "0.75rem", padding: "2px 8px", borderRadius: 999, background: "#e2e8f0" }}>
            {t("editorReadOnly")}
          </span>
        )}
      </header>}

      <main style={{ position: "relative", flex: 1, minHeight: 0 }}>
        {error ? (
          <div style={{ padding: 40, textAlign: "center", color: "#ef4444" }}>{error}</div>
        ) : (
          <>
            {loading && (
              <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#64748b" }}>
                {t("editorLoading")}
              </div>
            )}
            <div id={EDITOR_ELEMENT_ID} />
          </>
        )}
      </main>
    </div>
  );
}
