import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { pool } from "../db/pool.js";

const router = Router();
router.use(requireAuth);

// GET /api/notifications
router.get("/", async (req, res) => {
  try {
    const userId = req.user.userId;
    const items = [];

    // Fichiers partagés AVEC moi (récent)
    try {
      const shares = await pool.query(
        `SELECT s.id, s.file_name, s.permission, s.created_at,
                u.email AS from_email, u.first_name, u.last_name
         FROM shares s
         JOIN users u ON u.id = s.owner_id
         WHERE s.shared_with_id = $1
         ORDER BY s.created_at DESC
         LIMIT 15`,
        [userId]
      );
      for (const s of shares.rows) {
        const who =
          [s.first_name, s.last_name].filter(Boolean).join(" ") || s.from_email;
        items.push({
          id: `share-${s.id}`,
          type: "share",
          title: "File shared with you",
          body: `${who} shared "${s.file_name}" (${s.permission})`,
          createdAt: s.created_at,
        });
      }
    } catch (e) {
      console.error("Notif shares:", e.message);
    }

    // Activité liée à moi (Super Admin / Manager : un peu plus large)
    try {
      const isAdmin =
        req.user.role === "Super Admin" || req.user.role === "Manager";
      const act = isAdmin
        ? await pool.query(
            `SELECT id, user_name, action, detail, created_at
             FROM activity_logs
             ORDER BY created_at DESC
             LIMIT 10`
          )
        : await pool.query(
            `SELECT id, user_name, action, detail, created_at
             FROM activity_logs
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT 10`,
            [userId]
          );

      for (const a of act.rows) {
        items.push({
          id: `act-${a.id}`,
          type: "activity",
          title: a.action,
          body: a.detail ? `${a.user_name} · ${a.detail}` : a.user_name,
          createdAt: a.created_at,
        });
      }
    } catch (e) {
      console.error("Notif activity:", e.message);
    }

    items.sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    res.json({
      count: items.length,
      notifications: items.slice(0, 20),
    });
  } catch (err) {
    console.error("Notifications error:", err.message);
    res.status(500).json({ error: "Could not load notifications" });
  }
});

export default router;