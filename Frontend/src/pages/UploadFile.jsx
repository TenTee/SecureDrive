import { useRef, useState } from "react";

export default function UploadFile({ onClose, onUploadFile }) {
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

  function handleConfirm() {
    if (!selectedFile) return;
    setError("");
    setLoading(true);
    onUploadFile?.(selectedFile);
    onClose();
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