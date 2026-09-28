import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { pool } from "../db/pool.js";
import { logActivity } from "../activity/activity.routes.js";
import { asFolderKey } from "./access.js";

const router = Router();
router.use(requireAuth);

// GET /api/shares/recipients?fileKey=...  (active users + existing access)
router.get("/recipients", async (req, res) => {
  try {
    const fileKey = req.query.fileKey;
    if (!fileKey) return res.status(400).json({ error: "Missing fileKey" });

    const isFolder = fileKey.endsWith("/");
    const normalizedKey = isFolder ? asFolderKey(fileKey) : fileKey;
    const ownsKey = normalizedKey.startsWith(`uploads/${req.user.userId}/`);
    if (!ownsKey && req.user.role !== "Super Admin") {
      return res.status(403).json({ error: "You can only share your own files or folders" });
    }

    const result = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.email,
              s.permission AS existing_permission
       FROM users u
       LEFT JOIN shares s
         ON s.shared_with_id = u.id
        AND s.owner_id = $1
        AND s.file_key = $2
       WHERE u.status = 'Active' AND u.id <> $1
       ORDER BY u.first_name, u.last_name, u.email`,
      [req.user.userId, normalizedKey]
    );

    res.json({
      recipients: result.rows.map((row) => ({
        id: row.id,
        first_name: row.first_name,
        last_name: row.last_name,
        email: row.email,
        alreadyShared: row.existing_permission !== null,
        permission: row.existing_permission,
      })),
    });
  } catch (err) {
    console.error("Share recipients error:", err.message);
    res.status(500).json({ error: "Could not load share recipients" });
  }
});

// POST /api/shares  (fichier OU dossier)
router.post("/", async (req, res) => {
  try {
    let { fileKey, fileName, email, emails, userIds, revokeUserIds, permissionByUserId, permission, isFolder } = req.body;
    const ownerId = req.user.userId;

    const recipientsInput = Array.isArray(userIds)
      ? userIds
      : Array.isArray(emails)
        ? emails
        : email
          ? [email]
          : [];

    const revokeIds = Array.isArray(revokeUserIds)
      ? [...new Set(revokeUserIds.map(Number).filter(Number.isInteger))]
      : [];
    if (!fileKey || !fileName || (recipientsInput.length === 0 && revokeIds.length === 0)) {
      return res.status(400).json({
        error: "fileKey, fileName and at least one sharing change are required",
      });
    }
    if (!permissionByUserId && !["Read Only", "Read & Write"].includes(permission)) {
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

    const byIds = Array.isArray(userIds);
    const uniqueRecipients = [...new Set(recipientsInput.map((value) => byIds ? Number(value) : String(value).trim().toLowerCase()))];
    const userResult = byIds
      ? await pool.query(
          `SELECT id, email, first_name, last_name FROM users
           WHERE id = ANY($1::int[]) AND status = 'Active' AND id <> $2`,
          [uniqueRecipients, ownerId]
        )
      : await pool.query(
          `SELECT id, email, first_name, last_name FROM users
           WHERE lower(email) = ANY($1::text[]) AND status = 'Active' AND id <> $2`,
          [uniqueRecipients, ownerId]
        );

    if (userResult.rows.length !== uniqueRecipients.length) {
      return res.status(400).json({ error: "One or more selected users are unavailable" });
    }

    const permissionForUser = (userId) => permissionByUserId?.[userId] || permission;
    if (userResult.rows.some((target) => !["Read Only", "Read & Write"].includes(permissionForUser(target.id)))) {
      return res.status(400).json({ error: "Invalid permission for one or more selected users" });
    }

    const existingResult = await pool.query(
      `SELECT shared_with_id FROM shares
       WHERE owner_id = $1 AND file_key = $2 AND shared_with_id = ANY($3::int[])`,
      [ownerId, fileKey, userResult.rows.map((target) => target.id)]
    );
    const existingIds = new Set(existingResult.rows.map((row) => row.shared_with_id));

    let revoked = [];
    if (revokeIds.length) {
      const removeResult = await pool.query(
        `DELETE FROM shares
         WHERE owner_id = $1 AND file_key = $2 AND shared_with_id = ANY($3::int[])
         RETURNING shared_with_id`,
        [ownerId, fileKey, revokeIds]
      );
      revoked = removeResult.rows.map((row) => row.shared_with_id);
    }

    const createdShares = [];
    const updatedShares = [];
    for (const target of userResult.rows) {
      const insert = await pool.query(
        `INSERT INTO shares (file_key, file_name, owner_id, shared_with_id, permission)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (file_key, shared_with_id)
         DO UPDATE SET permission = EXCLUDED.permission, file_name = EXCLUDED.file_name, created_at = now()
         RETURNING id, file_key, file_name, permission, created_at`,
        [fileKey, fileName, ownerId, target.id, permissionForUser(target.id)]
      );
      const saved = { ...insert.rows[0], recipient: target.email };
      if (existingIds.has(target.id)) updatedShares.push(saved);
      else createdShares.push(saved);
    }

    if (createdShares.length || updatedShares.length || revoked.length) {
      await logActivity({
        userId: req.user.userId,
        userName: req.user.email || `User #${req.user.userId}`,
        action: isFolder ? "Shared a folder" : "Shared a file",
        detail: `${fileName}: ${createdShares.length} added, ${updatedShares.length} updated, ${revoked.length} removed`,
      });
    }

    res.status(201).json({
      message: isFolder ? "Folder sharing processed" : "File sharing processed",
      shares: createdShares,
      updatedShares,
      revokedUserIds: revoked,
      isFolder: !!isFolder,
      sharedWith: userResult.rows.map((target) => ({
        id: target.id,
        email: target.email,
        name: `${target.first_name} ${target.last_name}`,
      })),
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