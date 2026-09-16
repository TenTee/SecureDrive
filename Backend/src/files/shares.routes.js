import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { pool } from "../db/pool.js";
import { logActivity } from "../activity/activity.routes.js";
import { asFolderKey } from "./access.js";

const router = Router();
router.use(requireAuth);

// POST /api/shares  (fichier OU dossier)
router.post("/", async (req, res) => {
  try {
    let { fileKey, fileName, email, permission, isFolder } = req.body;
    const ownerId = req.user.userId;

    if (!fileKey || !fileName || !email || !permission) {
      return res.status(400).json({
        error: "fileKey, fileName, email and permission are required",
      });
    }
    if (!["Read Only", "Read & Write"].includes(permission)) {
      return res.status(400).json({ error: "Invalid permission" });
    }

    // Dossier → clé avec / à la fin
    if (isFolder === true || fileKey.endsWith("/")) {
      fileKey = asFolderKey(fileKey);
      isFolder = true;
    }

    const isOwner = fileKey.startsWith(`uploads/${ownerId}/`);
    const isSuperAdmin = req.user.role === "Super Admin";
    if (!isOwner && !isSuperAdmin) {
      return res.status(403).json({
        error: "You can only share your own files or folders",
      });
    }

    const userResult = await pool.query(
      "SELECT id, email, first_name, last_name, status FROM users WHERE email = $1",
      [email]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found with this email" });
    }

    const target = userResult.rows[0];
    if (target.status === "Disabled") {
      return res.status(400).json({ error: "This account is disabled" });
    }
    if (target.id === ownerId) {
      return res.status(400).json({ error: "You cannot share with yourself" });
    }

    const insert = await pool.query(
      `INSERT INTO shares (file_key, file_name, owner_id, shared_with_id, permission)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (file_key, shared_with_id)
       DO UPDATE SET permission = EXCLUDED.permission, created_at = now()
       RETURNING id, file_key, file_name, permission, created_at`,
      [fileKey, fileName, ownerId, target.id, permission]
    );

    await logActivity({
      userId: req.user.userId,
      userName: req.user.email || `User #${req.user.userId}`,
      action: isFolder ? "Shared a folder" : "Shared a file",
      detail: `${fileName} → ${email} (${permission})`,
    });

    res.status(201).json({
      message: isFolder ? "Folder shared successfully" : "File shared successfully",
      share: insert.rows[0],
      isFolder: !!isFolder,
      sharedWith: {
        id: target.id,
        email: target.email,
        name: `${target.first_name} ${target.last_name}`,
      },
    });
  } catch (err) {
    console.error("Share error:", err.message);
    res.status(500).json({ error: "Could not share" });
  }
});

// GET /api/shares/with-me
router.get("/with-me", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.id, s.file_key, s.file_name, s.permission, s.created_at,
              u.first_name AS owner_first_name,
              u.last_name AS owner_last_name,
              u.email AS owner_email
       FROM shares s
       JOIN users u ON u.id = s.owner_id
       WHERE s.shared_with_id = $1
       ORDER BY s.created_at DESC`,
      [req.user.userId]
    );

    const shares = result.rows.map((row) => ({
      ...row,
      isFolder: typeof row.file_key === "string" && row.file_key.endsWith("/"),
    }));

    res.json({ count: shares.length, shares });
  } catch (err) {
    console.error("Shared with me error:", err.message);
    res.status(500).json({ error: "Could not load shared files" });
  }
});

// GET /api/shares/by-me
router.get("/by-me", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.id, s.file_key, s.file_name, s.permission, s.created_at,
              u.first_name AS target_first_name,
              u.last_name AS target_last_name,
              u.email AS target_email
       FROM shares s
       JOIN users u ON u.id = s.shared_with_id
       WHERE s.owner_id = $1
       ORDER BY s.created_at DESC`,
      [req.user.userId]
    );

    const shares = result.rows.map((row) => ({
      ...row,
      isFolder: typeof row.file_key === "string" && row.file_key.endsWith("/"),
    }));

    res.json({ count: shares.length, shares });
  } catch (err) {
    console.error("Shared by me error:", err.message);
    res.status(500).json({ error: "Could not load shares" });
  }
});

// DELETE /api/shares/:id  → retire l'accès dossier + fichiers de ce share
router.delete("/:id", async (req, res) => {
  try {
    const shareId = req.params.id;
    const result = await pool.query(
      `DELETE FROM shares
       WHERE id = $1 AND (owner_id = $2 OR $3 = 'Super Admin')
       RETURNING id, file_name, file_key`,
      [shareId, req.user.userId, req.user.role]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Share not found or not allowed" });
    }

    const row = result.rows[0];
    const wasFolder = row.file_key && row.file_key.endsWith("/");

    await logActivity({
      userId: req.user.userId,
      userName: req.user.email || `User #${req.user.userId}`,
      action: wasFolder ? "Removed folder share" : "Removed file share",
      detail: row.file_name || `share #${shareId}`,
    });

    res.json({
      message: wasFolder
        ? "Folder share removed (access to folder and its files revoked)"
        : "Share removed",
    });
  } catch (err) {
    console.error("Unshare error:", err.message);
    res.status(500).json({ error: "Could not remove share" });
  }
});

export default router;