import { useEffect, useState } from "react";
import "./ActionModal.css";

export default function ActionModal({
  open,
  mode = "confirm",
  title,
  description,
  itemName,
  initialValue = "",
  inputLabel,
  confirmLabel,
  cancelLabel,
  danger = false,
  onClose,
  onConfirm,
}) {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const isRename = mode === "rename";

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event) {
      if (event.key === "Escape" && !busy) onClose?.();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onClose]);

  if (!open) return null;

  async function submit(event) {
    event?.preventDefault();
    if (busy || (isRename && !value.trim())) return;
    setBusy(true);
    try {
      const result = await onConfirm?.(isRename ? value.trim() : undefined);
      if (result !== false) onClose?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="action-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose?.()}>
      <form className="action-modal" role="dialog" aria-modal="true" aria-labelledby="action-modal-title" onSubmit={submit}>
        <div className={`action-modal-icon${danger ? " is-danger" : ""}`} aria-hidden="true">
          {isRename ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
          ) : danger ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>
          )}
        </div>
        <h2 className="action-modal-title" id="action-modal-title">{title}</h2>
        {description && <p className="action-modal-description">{description}</p>}
        {itemName && <div className="action-modal-item" title={itemName}>{itemName}</div>}
        {isRename && (
          <label className="action-modal-field">
            <span>{inputLabel}</span>
            <input
              autoFocus
              value={value}
              onChange={(event) => setValue(event.target.value)}
              disabled={busy}
              maxLength={255}
            />
          </label>
        )}
        <div className="action-modal-actions">
          <button type="button" className="action-modal-button secondary" disabled={busy} onClick={onClose}>{cancelLabel}</button>
          <button type="submit" className={`action-modal-button primary${danger ? " danger" : ""}`} disabled={busy || (isRename && !value.trim())}>
            {busy ? "…" : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
