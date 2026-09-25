import { useEffect, useState } from "react";
import { API_BASE } from "../config.js";

const FILE_TYPES = {
  pdf: { label: "PDF", color: "#dc2626", path: "M6 3h8l4 4v14H6z M14 3v5h4 M8 13h8 M8 17h6" },
  doc: { label: "DOC", color: "#2563eb", path: "M6 3h8l4 4v14H6z M14 3v5h4 M8 13h8 M8 17h5" },
  sheet: { label: "XLS", color: "#16a34a", path: "M6 3h8l4 4v14H6z M14 3v5h4 M8 13h8 M8 17h8" },
  slides: { label: "PPT", color: "#ea580c", path: "M6 3h8l4 4v14H6z M14 3v5h4 M8 13h8 M8 17h5" },
  code: { label: "</>", color: "#7c3aed", path: "m9 9-3 3 3 3 M15 9l3 3-3 3 M13 7l-2 10" },
  file: { label: "FILE", color: "#64748b", path: "M6 3h8l4 4v14H6z M14 3v5h4 M8 13h8 M8 17h6" },
};

function TypeIcon({ type = "file", folder = false, size = 52 }) {
  const config = folder
    ? { label: "", color: "#f59e0b", path: "M3 7h7l2 2h9v10H3z M3 7V5h7l2 2" }
    : FILE_TYPES[type] || FILE_TYPES.file;

  return (
    <svg aria-hidden="true" className="file-card-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={config.color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={config.path} />
      {!folder && <text x="12" y="20" textAnchor="middle" fill={config.color} stroke="none" fontSize="3.2" fontWeight="700">{config.label}</text>}
    </svg>
  );
}

export default function FileCard({ item, folder = false, favorite = false, onOpen, onMenu }) {
  const [previewUrl, setPreviewUrl] = useState("");
  const isMedia = !folder && (item.type === "image" || item.type === "video");

  useEffect(() => {
    let cancelled = false;
    if (!isMedia) return undefined;

    async function loadThumbnail() {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API_BASE}/api/files/preview?key=${encodeURIComponent(item.key)}`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (!cancelled && res.ok) setPreviewUrl(data.previewUrl || "");
      } catch {
        // Keep the type icon when a thumbnail cannot load.
      }
    }

    loadThumbnail();
    return () => { cancelled = true; };
  }, [isMedia, item.key]);

  function handleOpen() {
    if (folder) onOpen?.(item.key);
    else if (isMedia) onOpen?.(item);
  }

  return (
    <article className="file-card" onDoubleClick={handleOpen}>
      <button className="file-card-preview" type="button" onClick={handleOpen} aria-label={folder ? `Open ${item.name}` : `Preview ${item.name}`}>
        {previewUrl && item.type === "image" ? <img src={previewUrl} alt="" className="file-card-thumbnail" /> : previewUrl && item.type === "video" ? <video src={previewUrl} className="file-card-thumbnail" muted preload="metadata" /> : <TypeIcon type={item.type} folder={folder} />}
      </button>
      <div className="file-card-details">
        <div className="file-card-name" title={item.name}>
          {favorite && <span className="file-card-favorite" aria-label="Favorite">★</span>}
          {item.name}
        </div>
        <div className="file-card-meta">{folder ? "Folder" : item.sizeLabel}</div>
      </div>
      <button className="file-card-menu" type="button" data-menu-btn title="More" aria-label={`More actions for ${item.name}`} onClick={(event) => onMenu?.(event, item, folder)}>⋮</button>
    </article>
  );
}