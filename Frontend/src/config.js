// Configuration centralisée de l'application
export const API_BASE = "http://localhost:4000";

// ONLYOFFICE Document Server (online editing of Word / Excel / PowerPoint)
export const ONLYOFFICE_URL = (import.meta.env.VITE_ONLYOFFICE_URL || "http://localhost:8080").replace(/\/$/, "");
