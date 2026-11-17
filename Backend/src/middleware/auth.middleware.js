import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";

// Sliding session: a token lives SESSION_DAYS. While the user keeps using the
// app, the backend hands out a fresh token (X-Refresh-Token header) at most
// once per REFRESH_AFTER_MS, so the session only ends after SESSION_DAYS of
// inactivity (or when the account is disabled).
export const SESSION_DAYS = Number(process.env.SESSION_DAYS) || 30;
const REFRESH_AFTER_MS = 12 * 60 * 60 * 1000; // 12 h

export function signSessionToken({ userId, email, role }) {
  return jwt.sign({ userId, email, role }, process.env.JWT_SECRET, { expiresIn: `${SESSION_DAYS}d` });
}

async function refreshIfNeeded(decoded, res) {
  // Renew when less than (SESSION_DAYS - 12 h) is left. This also upgrades
  // older short-lived tokens (the previous 8 h ones) on their next request.
  const remainingMs = decoded.exp * 1000 - Date.now();
  if (remainingMs > SESSION_DAYS * 24 * 60 * 60 * 1000 - REFRESH_AFTER_MS) return true;
  // Re-read the account on refresh so a disabled user or changed role is picked up.
  const result = await pool.query(`SELECT id, email, role, status FROM users WHERE id = $1`, [decoded.userId]);
  const user = result.rows[0];
  if (!user || (user.status && user.status !== "Active")) return false;
  res.setHeader("X-Refresh-Token", signSessionToken({ userId: user.id, email: user.email, role: user.role }));
  return true;
}

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  const token = authHeader.split(" ")[1];

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Only session tokens: reject other tokens signed with the same secret
    // (e.g. the ONLYOFFICE callback token, which has a "purpose").
    if (!decoded.userId || decoded.purpose) throw new Error("Not a session token");
  } catch {
    return res.status(401).json({ error: "Invalid or expired token." });
  }

  try {
    if (!(await refreshIfNeeded(decoded, res))) {
      return res.status(401).json({ error: "Account disabled or removed." });
    }
  } catch (err) {
    // A database hiccup must not log the user out: keep the current token.
    console.error("Session refresh failed:", err.message);
  }

  req.user = { userId: decoded.userId, email: decoded.email, role: decoded.role };
  next();
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Access denied. Not authenticated." });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Access denied. Insufficient permissions." });
    }

    next();
  };
}
