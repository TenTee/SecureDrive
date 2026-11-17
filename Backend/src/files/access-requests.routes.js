// Access requests for file links.
//
//   GET  /api/access-requests/link?key=     what the link page needs: my access, owner, my request
//   POST /api/access-requests               { fileKey, permission, message }  ask the owner
//   GET  /api/access-requests/incoming      pending requests on my files
//   POST /api/access-requests/:id/approve   { permission }  -> creates the share
//   POST /api/access-requests/:id/deny
import { Router } from "express";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { requireAuth } from "../middleware/auth.middleware.js";
import { pool } from "../db/pool.js";
import { logActivity } from "../activity/activity.routes.js";
import { getKeyPermission } from "./access.js";
import { BUCKET_NAME } from "../config/s3Client.js";
import { getTemporaryS3Client } from "../config/stsClient.js";

const router = Router();
router.use(requireAuth);

const PERMISSIONS = ["Read Only", "Read & Write"];
const UUID_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;

// Created on first load so no manual migration is needed (also in db/schema.sql).
const ready = pool
  .query(
    `CREATE TABLE IF NOT EXISTS access_requests (
       id           SERIAL PRIMARY KEY,
       file_key     TEXT NOT NULL,
       file_name    VARCHAR(255) NOT NULL,
       owner_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       permission   VARCHAR(20) NOT NULL CHECK (permission IN ('Read Only', 'Read & Write')),
       message      TEXT,
       status       VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'denied')),
       created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
       decided_at   TIMESTAMPTZ
     );
     CREATE UNIQUE INDEX IF NOT EXISTS uniq_access_requests_pending
       ON access_requests (file_key, requester_id) WHERE status = 'pending';
     CREATE INDEX IF NOT EXISTS idx_access_requests_owner ON access_requests (owner_id, status);`
  )
  .catch((err) => console.error("access_requests table setup failed:", err.message));

function ownerIdFromKey(fileKey) {
  const match = /^uploads\/(\d+)\//.exec(fileKey || "");
  return match ? Number(match[1]) : null;
}

function displayName(fileKey) {
  return (fileKey.split("/").filter(Boolean).pop() || "file").replace(UUID_PREFIX, "");
}

function fullName(row, prefix = "") {
  const name = [row[`${prefix}first_name`], row[`${prefix}last_name`]].filter(Boolean).join(" ");
  return name || row[`${prefix}email`];
}

async function fileExists(fileKey, userId) {
  const s3 = await getTemporaryS3Client(`user-${userId}`);
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: fileKey }));
    return true;
  } catch {
    return false;
  }
}

// GET /api/access-requests/link?key=
router.get("/link", async (req, res) => {
  try {
    await ready;
    const fileKey = String(req.query.key || "");
    const ownerId = ownerIdFromKey(fileKey);
    if (!ownerId || fileKey.endsWith("/")) return res.status(400).json({ error: "Invalid file link." });

    if (!(await fileExists(fileKey, req.user.userId))) {
      return res.status(404).json({ error: "This file no longer exists or has been moved." });
    }

    const permission = await getKeyPermission(fileKey, req.user);
    const owner = await pool.query(`SELECT first_name, last_name, email FROM users WHERE id = $1`, [ownerId]);
    const latest = await pool.query(
      `SELECT id, status, permission, created_at, decided_at FROM access_requests
       WHERE file_key = $1 AND requester_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [fileKey, req.user.userId]
    );

    res.json({
      fileKey,
      fileName: displayName(fileKey),
      permission, // null = no access
      owner: owner.rows[0] ? { name: fullName(owner.rows[0]) } : null,
      request: latest.rows[0] || null,
    });
  } catch (err) {
    console.error("Access link error:", err.message);
    res.status(500).json({ error: "Could not check access to this file." });
  }
});

// POST /api/access-requests
router.post("/", async (req, res) => {
  try {
    await ready;
    const fileKey = String(req.body.fileKey || "");
    const permission = PERMISSIONS.includes(req.body.permission) ? req.body.permission : "Read Only";
    const message = String(req.body.message || "").trim().slice(0, 500) || null;
    const ownerId = ownerIdFromKey(fileKey);

    if (!ownerId || fileKey.endsWith("/")) return res.status(400).json({ error: "Invalid file link." });
    if (ownerId === req.user.userId) return res.status(400).json({ error: "This is your own file." });

    const current = await getKeyPermission(fileKey, req.user);
    if (current === "Read & Write" || current === permission) {
      return res.status(409).json({ error: "You already have this access." });
    }
    if (!(await fileExists(fileKey, req.user.userId))) {
      return res.status(404).json({ error: "This file no longer exists or has been moved." });
    }

    const inserted = await pool.query(
      `INSERT INTO access_requests (file_key, file_name, owner_id, requester_id, permission, message)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (file_key, requester_id) WHERE status = 'pending'
       DO UPDATE SET permission = EXCLUDED.permission, message = EXCLUDED.message, created_at = now()
       RETURNING id, status, permission, created_at`,
      [fileKey, displayName(fileKey), ownerId, req.user.userId, permission, message]
    );

    await logActivity({
      userId: req.user.userId,
      userName: req.user.email,
      action: "Requested access to a file",
      detail: `${displayName(fileKey)} (${permission})`,
    });

    res.status(201).json({ request: inserted.rows[0] });
  } catch (err) {
    console.error("Access request error:", err.message);
    res.status(500).json({ error: "Could not send the access request." });
  }
});

// GET /api/access-requests/incoming
router.get("/incoming", async (req, res) => {
  try {
    await ready;
    const result = await pool.query(
      `SELECT r.id, r.file_key, r.file_name, r.permission, r.message, r.created_at,
              u.first_name, u.last_name, u.email
       FROM access_requests r
       JOIN users u ON u.id = r.requester_id
       WHERE r.owner_id = $1 AND r.status = 'pending'
       ORDER BY r.created_at DESC`,
      [req.user.userId]
    );
    res.json({
      requests: result.rows.map((row) => ({
        id: row.id,
        fileKey: row.file_key,
        fileName: row.file_name,
        permission: row.permission,
        message: row.message,
        createdAt: row.created_at,
        requester: { name: fullName(row), email: row.email },
      })),
    });
  } catch (err) {
    console.error("Incoming access requests error:", err.message);
    res.status(500).json({ error: "Could not load access requests." });
  }
});

async function loadOwnPendingRequest(id, user) {
  const result = await pool.query(
    `SELECT * FROM access_requests WHERE id = $1 AND status = 'pending'
       AND (owner_id = $2 OR $3 = 'Super Admin')`,
    [id, user.userId, user.role]
  );
  return result.rows[0] || null;
}

// POST /api/access-requests/:id/approve
router.post("/:id/approve", async (req, res) => {
  try {
    await ready;
    const request = await loadOwnPendingRequest(req.params.id, req.user);
    if (!request) return res.status(404).json({ error: "Request not found or already handled." });
    const permission = PERMISSIONS.includes(req.body.permission) ? req.body.permission : request.permission;

    await pool.query(
      `INSERT INTO shares (file_key, file_name, owner_id, shared_with_id, permission)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (file_key, shared_with_id)
       DO UPDATE SET permission = EXCLUDED.permission, created_at = now()`,
      [request.file_key, request.file_name, request.owner_id, request.requester_id, permission]
    );
    await pool.query(
      `UPDATE access_requests SET status = 'approved', permission = $2, decided_at = now() WHERE id = $1`,
      [request.id, permission]
    );

    await logActivity({
      userId: req.user.userId,
      userName: req.user.email,
      action: "Approved an access request",
      detail: `${request.file_name} (${permission})`,
    });
    res.json({ message: "Access granted", permission });
  } catch (err) {
    console.error("Approve access request error:", err.message);
    res.status(500).json({ error: "Could not approve the request." });
  }
});

// POST /api/access-requests/:id/deny
router.post("/:id/deny", async (req, res) => {
  try {
    await ready;
    const request = await loadOwnPendingRequest(req.params.id, req.user);
    if (!request) return res.status(404).json({ error: "Request not found or already handled." });

    await pool.query(`UPDATE access_requests SET status = 'denied', decided_at = now() WHERE id = $1`, [
      request.id,
    ]);
    await logActivity({
      userId: req.user.userId,
      userName: req.user.email,
      action: "Denied an access request",
      detail: request.file_name,
    });
    res.json({ message: "Request denied" });
  } catch (err) {
    console.error("Deny access request error:", err.message);
    res.status(500).json({ error: "Could not deny the request." });
  }
});

export default router;
