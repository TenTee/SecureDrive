import { useEffect, useState } from "react";
import { API_BASE } from "../config.js";

export default function FilePreviewModal({ fileKey, fileName, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [type, setType] = useState(""); // "image" | "pdf"

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(
          `${API_BASE}/api/files/preview?key=${encodeURIComponent(fileKey)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();
        if (!res.ok) {
          if (!cancelled) setError(data.error || "Preview failed");
          return;
        }
        if (!cancelled) {
          setPreviewUrl(data.previewUrl);
          setType(data.type);
        }
      } catch {
        if (!cancelled) setError("Cannot connect to server");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (fileKey) load();
    return () => {
      cancelled = true;
    };
  }, [fileKey]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        style={{ maxWidth: 900, width: "92vw", maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <div className="modal-title" style={{ margin: 0, fontSize: "1.05rem" }}>
            {fileName || "Preview"}
          </div>
          <button className="btn btn-outline" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        {loading && (
          <div style={{ padding: 40, textAlign: "center" }}>Loading preview…</div>
        )}

        {error && (
          <div style={{ color: "#ef4444", padding: 24, textAlign: "center" }}>{error}</div>
        )}

        {!loading && !error && type === "image" && (
          <div style={{ textAlign: "center", overflow: "auto", maxHeight: "75vh" }}>
            <img
              src={previewUrl}
              alt={fileName}
              style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: 8 }}
            />
          </div>
        )}

        {!loading && !error && type === "pdf" && (
          <iframe
            title={fileName}
            src={previewUrl}
            style={{
              width: "100%",
              height: "75vh",
              border: "1px solid var(--border, #e2e8f0)",
              borderRadius: 8,
            }}
          />
        )}
      </div>
    </div>
  );
}
