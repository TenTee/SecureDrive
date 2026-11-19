// "+ New" button (sidebar, or floating button on mobile) and its menu.
//
// The page on screen does the work in the folder it shows: the menu fires a
// cancelable "sd-new" event and a page that can handle it (My Files, a shared
// folder with write access) calls preventDefault(). When nobody handles it,
// the action runs in My Files: uploads go to the root, the rest opens
// /admin/files?new=<action>.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { t } from "../i18n.js";

const DOC_ITEMS = [
  { action: "docx", labelKey: "docTypeWord", color: "#1a73e8", letter: "W" },
  { action: "xlsx", labelKey: "docTypeExcel", color: "#188038", letter: "X" },
  { action: "pptx", labelKey: "docTypePowerPoint", color: "#e37400", letter: "P" },
];

export default function NewMenu({ user, uploadFile, variant = "sidebar", onAction }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    }
    function onKey(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function run(action) {
    setOpen(false);
    onAction?.();
    const event = new CustomEvent("sd-new", { detail: { action }, cancelable: true });
    if (!window.dispatchEvent(event)) return; // handled by the page on screen
    if (action === "upload") inputRef.current?.click();
    else navigate(`/admin/files?new=${action}`);
  }

  function onFileChosen(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !uploadFile) return;
    uploadFile(file, `uploads/${user.userId}/`, () => {
      window.dispatchEvent(new Event("sd-files-changed"));
      navigate("/admin/files");
    });
  }

  return (
    <div className={`new-menu new-menu-${variant}`} ref={rootRef}>
      <button
        type="button"
        className={variant === "fab" ? "new-fab" : "new-btn"}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("newMenu")}
        onClick={() => setOpen((value) => !value)}
      >
        <PlusIcon />
        {variant !== "fab" && <span>{t("newMenu")}</span>}
      </button>
      <input ref={inputRef} type="file" hidden onChange={onFileChosen} />

      {open && (
        <div className="new-menu-panel" role="menu">
          <button type="button" role="menuitem" onClick={() => run("folder")}>
            <FolderPlusIcon /> {t("newFolder")}
          </button>
          <div className="new-menu-sep" />
          <button type="button" role="menuitem" onClick={() => run("upload")}>
            <UploadIcon /> {t("uploadFile")}
          </button>
          <div className="new-menu-sep" />
          {DOC_ITEMS.map((item) => (
            <button key={item.action} type="button" role="menuitem" onClick={() => run(item.action)}>
              <span className="new-menu-doc" style={{ background: item.color }}>{item.letter}</span>
              {t(item.labelKey)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
function FolderPlusIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M3 6.5A1.5 1.5 0 014.5 5H9l2 2h8.5A1.5 1.5 0 0121 8.5v9a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 17.5z" />
      <path d="M12 10.5v5M9.5 13h5" strokeLinecap="round" />
    </svg>
  );
}
function UploadIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
      <path d="M14 3v5h5M12 17v-6M9.5 13.5L12 11l2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
