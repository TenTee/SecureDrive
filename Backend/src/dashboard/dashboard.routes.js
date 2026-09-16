import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { pool } from "../db/pool.js";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { s3Client, BUCKET_NAME } from "../config/s3Client.js";

const router = Router();

router.use(requireAuth);

// GET /api/dashboard
router.get("/", async (req, res) => {
  try {
    const { userId, role } = req.user;

    // 3 rôles → droits différents
    const canSeeUserStats =
      role === "Super Admin" || role === "Manager";

    const canSeeAllFiles =
      role === "Super Admin" || role === "Manager";

    // --- Stats utilisateurs (Super Admin + Manager seulement) ---
    let totalUsers = 0;
    let activeAccounts = 0;

    if (canSeeUserStats) {
      const usersCount = await pool.query(
        `SELECT COUNT(*)::int AS total FROM users`
      );
      const activeCount = await pool.query(
        `SELECT COUNT(*)::int AS total FROM users WHERE status = 'Active'`
      );
      totalUsers = usersCount.rows[0].total;
      activeAccounts = activeCount.rows[0].total;
    }

    // --- Fichiers S3 ---
    // Super Admin / Manager → tout uploads/
    // User → seulement uploads/{sonId}/
    const prefix = canSeeAllFiles ? "uploads/" : `uploads/${userId}/`;

    const listRes = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: prefix,
        MaxKeys: 200,
      })
    );

    const files = (listRes.Contents || [])
      .filter((item) => item.Key && !item.Key.endsWith("/"))
      .map((item) => ({
        key: item.Key,
        size: item.Size || 0,
        lastModified: item.LastModified,
      }));

    const filesCount = files.length;
    const storageBytes = files.reduce((sum, f) => sum + f.size, 0);

    // --- Partagés avec moi ---
    const sharedRes = await pool.query(
      `SELECT COUNT(*)::int AS total FROM shares WHERE shared_with_id = $1`,
      [userId]
    );
    const sharedWithMe = sharedRes.rows[0].total;

    const favRes = await pool.query(
         `SELECT COUNT(*)::int AS total FROM favorites WHERE user_id = $1`,
          [userId]
      );
     const favoritesCount = favRes.rows[0].total;

    // --- 5 fichiers récents ---
    const recentFiles = [...files]
      .sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified))
      .slice(0, 5)
      .map((f) => {
        const raw = f.key.split("/").pop();
        const name = raw.replace(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i,
          ""
        );
        return {
          name,
          size: f.size,
          lastModified: f.lastModified,
          key: f.key,
        };
      });

    res.json({
      role,
      canSeeUserStats,
      canSeeAllFiles,
      stats: {
        totalUsers,
        activeAccounts,
        filesCount,
        storageBytes,
        sharedWithMe,
        favoritesCount,
      },
      recentFiles,
    });
  } catch (err) {
    console.error("Dashboard error:", err.message);
    res.status(500).json({ error: "Could not load dashboard" });
  }
});

export default router;