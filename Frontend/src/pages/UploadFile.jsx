import { useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

export default function UploadFile({ onClose, onUpload }) {
  const inputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function handleFiles(fileList) {
    if (fileList && fileList[0]) {
      setSelectedFile(fileList[0]);
      setError("");
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragActive(false);
    handleFiles(e.dataTransfer.files);
  }

  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function handleConfirm() {
    if (!selectedFile) return;

    setLoading(true);
    setError("");

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setError("You must be logged in to upload.");
        setLoading(false);
        return;
      }

      // On crée un FormData pour envoyer le fichier
      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await fetch(`${API_BASE}/api/files/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          // Ne PAS mettre Content-Type : le navigateur le met automatiquement avec FormData
        },
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Upload failed");
        setLoading(false);
        return;
      }

      // Succès → on informe le parent (AdminLayout) pour mettre à jour la liste
      onUpload({
        id: data.fileKey,
        name: data.fileName,
        type: guessType(data.fileName),
        size: formatSize(data.size),
        modified: "Just now",
        starred: false,
        fileKey: data.fileKey,
      });

      onClose();
    } catch {
      setError("Cannot connect to server. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Upload Files</div>
        <div className="modal-subtitle">Add a file to your SecureDrive workspace.</div>

        <div
          className={`dropzone-box${dragActive ? " drag-active" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
        >
          <UploadCloudIcon />
          <p className="dropzone-text">
            <b>Click to browse</b> or drag and drop a file here
          </p>
          <input
            ref={inputRef}
            type="file"
            hidden
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>

        {selectedFile && (
          <div className="selected-file-chip">
            <span>📄 {selectedFile.name}</span>
            <span style={{ color: "var(--text-secondary)" }}>
              {formatSize(selectedFile.size)}
            </span>
          </div>
        )}

        {error && (
          <div style={{ color: "#ef4444", marginTop: 12, fontSize: "0.85rem" }}>
            {error}
          </div>
        )}

        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className="btn btn-solid"
            disabled={!selectedFile || loading}
            onClick={handleConfirm}
          >
            {loading ? "Uploading..." : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}

function guessType(name) {
  const ext = name.split(".").pop().toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "svg"].includes(ext)) return "image";
  if (["doc", "docx"].includes(ext)) return "doc";
  if (["xls", "xlsx"].includes(ext)) return "sheet";
  if (["ppt", "pptx"].includes(ext)) return "slides";
  if (["json", "js", "jsx", "ts", "css"].includes(ext)) return "code";
  if (ext === "pdf") return "pdf";
  return "file";
}

function UploadCloudIcon() {
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#2563eb"
      strokeWidth="1.8"
      style={{ margin: "0 auto" }}
    >
      <path d="M7 18a4.5 4.5 0 01-1-8.9A5.5 5.5 0 0116.9 8 4 4 0 0117 16h-1" />
      <path d="M12 12v8M9 15l3-3 3 3" />
    </svg>
  );
}