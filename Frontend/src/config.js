// Configuration centralisée de l'application
const configuredApiBase = import.meta.env.VITE_API_BASE?.trim();
export const API_BASE = (
  configuredApiBase || (import.meta.env.DEV ? "http://localhost:4000" : "")
).replace(/\/+$/, "");

// ONLYOFFICE Document Server (online editing of Word / Excel / PowerPoint)
export const ONLYOFFICE_URL = (import.meta.env.VITE_ONLYOFFICE_URL || "http://localhost:8080").replace(/\/$/, "");
