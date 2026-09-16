import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { pool } from "../db/pool.js";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { BUCKET_NAME } from "../config/s3Client.js";
import { getTemporaryS3Client } from "../config/stsClient.js";
import { logActivity } from "../activity/activity.routes.js";

const router = Router();
router.use(requireAuth);

// GET /api/favorites/recent
router.get("/recent", async (req, res) => {
  try {
    const s3 = await getTemporaryS3Client(`user-${req.user.userId}`);
    const isAdmin =
      req.user.role === "Super Admin" || req.user.role === "Manager";
    const prefix = isAdmin ? "uploads/" : `uploads/${req.user.userId}/`;

    const listRes = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: prefix,
        MaxKeys: 100,
      })
    );

    const files = (listRes.Contents || [])
      .filter((item) => item.Key && !item.Key.endsWith("/") && !item.Key.endsWith(".keep"))
      .map((item) => {
        const raw = item.Key.split("/").pop();
        const name = raw.replace(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i,
          ""
        );
        return {
          key: item.Key,
          name,
          size: item.Size || 0,
          lastModified: item.LastModified,
        };
      })
      .sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified))
      .slice(0, 30);

    res.json({ count: files.length, files });
  } catch (err) {
    console.error("Recent files error:", err.message);
    res.status(500).json({ error: "Could not load recent files" });
  }
});

// GET /api/favorites
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, file_key, file_name, created_at
       FROM favorites
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.userId]
    );
    res.json({ count: result.rows.length, favorites: result.rows });
  } catch (err) {
    console.error("List favorites error:", err.message);
    res.status(500).json({ error: "Could not load favorites" });
  }
});

// POST /api/favorites
router.post("/", async (req, res) => {
  try {
    const { fileKey, fileName } = req.body;
    if (!fileKey || !fileName) {
      return res.status(400).json({ error: "fileKey and fileName are required" });
    }

    const result = await pool.query(
      `INSERT INTO favorites (user_id, file_key, file_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, file_key) DO NOTHING
       RETURNING id, file_key, file_name, created_at`,
      [req.user.userId, fileKey, fileName]
    );

    if (result.rows.length === 0) {
      return res.json({ message: "Already in favorites" });
    }

    await logActivity({
      userId: req.user.userId,
      userName: req.user.email || `User #${req.user.userId}`,
      action: "Added to favorites",
      detail: fileName,
    });

    res.status(201).json({
      message: "Added to favorites",
      favorite: result.rows[0],
    });
  } catch (err) {
    console.error("Add favorite error:", err.message);
    res.status(500).json({ error: "Could not add favorite" });
  }
});

// DELETE /api/favorites
router.delete("/", async (req, res) => {
  try {
    const { fileKey } = req.body;
    if (!fileKey) {
      return res.status(400).json({ error: "fileKey is required" });
    }

    const result = await pool.query(
      `DELETE FROM favorites
       WHERE user_id = $1 AND file_key = $2
       RETURNING file_name`,
      [req.user.userId, fileKey]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Favorite not found" });
    }

    await logActivity({
      userId: req.user.userId,
      userName: req.user.email || `User #${req.user.userId}`,
      action: "Removed from favorites",
      detail: result.rows[0].file_name,
    });

    res.json({ message: "Removed from favorites" });
  } catch (err) {
    console.error("Remove favorite error:", err.message);
    res.status(500).json({ error: "Could not remove favorite" });
  }
});

export default router;