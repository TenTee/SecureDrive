import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { pool } from "../db/pool.js";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { BUCKET_NAME } from "../config/s3Client.js";
import { getTemporaryS3Client } from "../config/stsClient.js";

const router = Router();
router.use(requireAuth);

function cleanName(key) {
  const raw = (key || "").split("/").filter(Boolean).pop() || key || "";
  return raw.replace(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i,
    ""
  );
}

// GET /api/search?q=...
router.get("/", async (req, res) => {
  try {
    const q = (req.query.q || "").trim().toLowerCase();
    if (!q || q.length < 1) {
      return res.json({ files: [], users: [], folders: [] });
    }

    const isAdmin =
      req.user.role === "Super Admin" || req.user.role === "Manager";
    const prefix = isAdmin ? "uploads/" : `uploads/${req.user.userId}/`;

    const s3 = await getTemporaryS3Client(`user-${req.user.userId}`);
    const listRes = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: prefix,
        MaxKeys: 500,
      })
    );

    const files = [];
    const folders = [];
    const seenFolders = new Set();

    for (const item of listRes.Contents || []) {
      const key = item.Key;
      if (!key || key.endsWith(".keep")) continue;

      if (key.endsWith("/")) {
        const name = cleanName(key.replace(/\/$/, ""));
        if (name.toLowerCase().includes(q) && !seenFolders.has(key)) {
          seenFolders.add(key);
          folders.push({ key, name, type: "folder" });
        }
        continue;
      }

      const name = cleanName(key);
      if (name.toLowerCase().includes(q)) {
        files.push({
          key,
          name,
          size: item.Size || 0,
          lastModified: item.LastModified,
          type: "file",
        });
      }
    }

    let users = [];
    if (isAdmin) {
      const u = await pool.query(
        `SELECT id, first_name, last_name, email, role
         FROM users
         WHERE LOWER(email) LIKE $1
            OR LOWER(first_name) LIKE $1
            OR LOWER(last_name) LIKE $1
         ORDER BY created_at DESC
         LIMIT 20`,
        [`%${q}%`]
      );
      users = u.rows.map((r) => ({
        id: r.id,
        name: `${r.first_name} ${r.last_name}`.trim(),
        email: r.email,
        role: r.role,
        type: "user",
      }));
    }

    res.json({
      files: files.slice(0, 20),
      folders: folders.slice(0, 10),
      users,
    });
  } catch (err) {
    console.error("Search error:", err.message);
    res.status(500).json({ error: "Search failed", details: err.message });
  }
});

export default router;