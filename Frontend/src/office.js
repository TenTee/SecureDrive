// Helpers for the ONLYOFFICE online editor.
const OFFICE_EXTENSIONS = new Set([
  "doc", "docx", "docm", "dot", "dotx", "odt", "ott", "rtf", "txt",
  "xls", "xlsx", "xlsm", "xlt", "xltx", "ods", "ots", "csv",
  "ppt", "pptx", "pptm", "pot", "potx", "odp", "otp",
]);

export function isOfficeFile(name) {
  const ext = (name || "").split(".").pop().toLowerCase();
  return OFFICE_EXTENSIONS.has(ext);
}

/** Opens the document in the editor page, in a new tab. */
export function openInEditor(fileKey) {
  window.open(`/editor?key=${encodeURIComponent(fileKey)}`, "_blank", "noopener");
}
