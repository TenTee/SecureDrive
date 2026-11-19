import { useEffect, useRef, useState } from "react";
import { API_BASE } from "../config.js";
import { isOfficeFile } from "../office.js";

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
    ? { label: "", color: "#5f6368", path: "M3 7h7l2 2h9v10H3z M3 7V5h7l2 2" }
    : FILE_TYPES[type] || FILE_TYPES.file;

  return (
    <svg aria-hidden="true" className="file-card-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={config.color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={config.path} />
      {!folder && <text x="12" y="20" textAnchor="middle" fill={config.color} stroke="none" fontSize="3.2" fontWeight="700">{config.label}</text>}
    </svg>
  );
}

// Small coloured icon shown before the name (folder, Word, Excel, PDF…).
const SMALL_ICONS = {
  doc: { color: "#1a73e8", letter: "W" },
  sheet: { color: "#188038", letter: "X" },
  slides: { color: "#e37400", letter: "P" },
  pdf: { color: "#d93025", letter: "PDF" },
  image: { color: "#d93025", glyph: "M7 16l3-4 2.5 3 2-2.5L17 16z" },
  video: { color: "#d93025", glyph: "M10 8.5v7l5.5-3.5z" },
  code: { color: "#7c3aed", letter: "</>" },
  file: { color: "#5f6368", glyph: "M8 9h8M8 12h8M8 15h5" },
};

function SmallTypeIcon({ type = "file", folder = false }) {
  if (folder) {
    return (
      <svg className="file-card-type-icon file-card-folder-icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8z" />
      </svg>
    );
  }
  const config = SMALL_ICONS[type] || SMALL_ICONS.file;
  const long = config.letter && config.letter.length > 1;
  return (
    <svg className="file-card-type-icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="4" fill={config.color} />
      {config.letter ? (
        <text x="12" y={long ? 15 : 16.5} textAnchor="middle" fill="#fff" fontSize={long ? 7 : 12} fontWeight="700" fontFamily="Arial, sans-serif">{config.letter}</text>
      ) : (
        <path d={config.glyph} fill={type === "file" ? "none" : "#fff"} stroke={type === "file" ? "#fff" : "none"} strokeWidth="1.8" strokeLinecap="round" />
      )}
    </svg>
  );
}

export default function FileCard({ item, folder = false, favorite = false, onOpen, onMenu, meta, actions, showMenu = true, previewable = false, onFileDrop, dropHint }) {
  const [previewUrl, setPreviewUrl] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const dragDepth = useRef(0);
  const isMedia = !folder && (item.type === "image" || item.type === "video");
  // Word / Excel / PowerPoint / PDF: first-page thumbnail rendered by ONLYOFFICE.
  const isDocument = !folder && (item.type === "pdf" || isOfficeFile(item.name));

  useEffect(() => {
    let cancelled = false;
    if (!isMedia && !isDocument) return undefined;

    async function loadThumbnail() {
      try {
        const token = localStorage.getItem("token");
        const endpoint = isDocument ? "/api/office/thumbnail" : "/api/files/preview";
        const res = await fetch(`${API_BASE}${endpoint}?key=${encodeURIComponent(item.key)}`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (!cancelled && res.ok) setPreviewUrl(data.thumbnailUrl || data.previewUrl || "");
      } catch {
        // Keep the type icon when a thumbnail cannot load.
      }
    }

    loadThumbnail();
    return () => { cancelled = true; };
  }, [isMedia, isDocument, item.key]);

  function handleOpen() {
    if (folder) onOpen?.(item.key);
    else if (previewable) onOpen?.(item);
  }

  // A click anywhere on the card opens it, except on the ⋮ menu and action buttons.
  function handleCardClick(event) {
    if (event.target.closest("[data-menu-btn], .file-card-actions")) return;
    handleOpen();
  }

  function handleDragEnter(event) {
    if (!onFileDrop || !event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current += 1;
    setDragActive(true);
  }

  function handleDragOver(event) {
    if (!onFileDrop || !event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleDragLeave(event) {
    if (!onFileDrop) return;
    event.stopPropagation();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragActive(false);
  }

  function handleDrop(event) {
    if (!onFileDrop || !event.dataTransfer.files?.length) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current = 0;
    setDragActive(false);
    onFileDrop(Array.from(event.dataTransfer.files));
  }

  // Folders without extra info are compact rows (icon + name), like in Drive.
  const compact = folder && !meta && !actions;

  return (
    <article
      className={`file-card${compact ? " file-card-compact" : ""}${dragActive ? " file-card-drop-target" : ""}${folder || previewable ? " file-card-openable" : ""}`}
      onClick={handleCardClick}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragActive && <div className="file-card-drop-hint" aria-hidden="true">{dropHint}</div>}
      <div className="file-card-head">
        <SmallTypeIcon type={item.type} folder={folder} />
        <div className="file-card-name" title={item.name}>
          {favorite && <span className="file-card-favorite" aria-label="Favorite">★</span>}
          {item.name}
        </div>
        {showMenu && <button className="file-card-menu" type="button" data-menu-btn title="More" aria-label={`More actions for ${item.name}`} onClick={(event) => onMenu?.(event, item, folder)}>⋮</button>}
      </div>
      {!compact && (
        <>
          <button className="file-card-preview" type="button" aria-label={folder ? `Open ${item.name}` : `Preview ${item.name}`}>
            {previewUrl && isDocument ? (
              <img src={previewUrl} alt="" className="file-card-thumbnail file-card-doc-thumbnail" onError={() => setPreviewUrl("")} />
            ) : previewUrl && item.type === "image" ? <img src={previewUrl} alt="" className="file-card-thumbnail" /> : previewUrl && item.type === "video" ? <video src={previewUrl} className="file-card-thumbnail" muted preload="metadata" /> : <TypeIcon type={item.type} folder={folder} size={64} />}
          </button>
          <div className="file-card-meta">{meta || (folder ? "Folder" : item.sizeLabel)}</div>
          {actions && <div className="file-card-actions">{actions}</div>}
        </>
      )}
    </article>
  );
}