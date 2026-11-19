// "New document" dialog: creates a blank docx / xlsx / pptx in `parent`
// (your own folder or a shared folder you can write to) and opens it in the editor.
import { useState } from "react";
import { API_BASE } from "../config.js";
import { t } from "../i18n.js";
import { openInEditor } from "../office.js";

const TYPES = [
  ["docx", "docTypeWord"],
  ["xlsx", "docTypeExcel"],
  ["pptx", "docTypePowerPoint"],
];

export default function NewDocumentModal({ parent, initialType, onClose, onCreated }) {
  const [type, setType] = useState(TYPES.some(([value]) => value === initialType) ? initialType : "docx");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setCreating(true);
    setError("");
    // Open the tab now, during the click, so popup blockers allow it.
    const editorTab = window.open("", "_blank");
    try {
      const res = await fetch(`${API_BASE}/api/office/new`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({ type, name: name.trim(), parent }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        editorTab?.close();
        setError(data.error || "Could not create document");
        return;
      }
      if (editorTab) editorTab.location.href = `/editor?key=${encodeURIComponent(data.fileKey)}`;
      else openInEditor(data.fileKey);
      onCreated?.(data);
      onClose();
    } catch {
      editorTab?.close();
      setError("Cannot connect to server");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={() => !creating && onClose()}>
      <form className="modal-card" onClick={(event) => event.stopPropagation()} onSubmit={submit}>
        <div className="modal-title">{t("newDocument")}</div>
        <p style={{ margin: "0 0 16px", color: "var(--text-secondary)" }}>{t("newDocumentHint")}</p>
        <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
          {TYPES.map(([value, label]) => (
            <label key={value} style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
              <input type="radio" name="newDocType" value={value} checked={type === value} onChange={() => setType(value)} />
              {t(label)}
            </label>
          ))}
        </div>
        <input
          className="form-input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={`${t("documentName")} (Report.${type})`}
          autoFocus
        />
        {error && <div style={{ color: "#ef4444", fontSize: "0.85rem", marginTop: 10 }}>{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn btn-outline" disabled={creating} onClick={onClose}>{t("cancel")}</button>
          <button type="submit" className="btn btn-solid" disabled={creating}>{creating ? t("pleaseWait") : t("create")}</button>
        </div>
      </form>
    </div>
  );
}
