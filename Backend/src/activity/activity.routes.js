import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import { pool } from "../db/pool.js";

const router = Router();

export async function logActivity({ userId, userName, action, detail = null }) {
  console.log("LOG ACTIVITY:", { userId, userName, action, detail });
  try {
    let name = userName;

    // Si ce n'est pas un vrai email, on lit dans Neon
    if (userId && (!name || !String(name).includes("@"))) {
      const r = await pool.query(
        `SELECT email FROM users WHERE id = $1`,
        [userId]
      );
      if (r.rows[0]?.email) {
        name = r.rows[0].email;
      }
    }

    if (!name) {
      name = userId ? `User #${userId}` : "System";
    }

    await pool.query(
      `INSERT INTO activity_logs (user_id, user_name, action, detail)
       VALUES ($1, $2, $3, $4)`,
      [userId ?? null, name, action, detail]
    );
  } catch (err) {
    console.error("Activity log error:", err.message);
  }
}

router.get(
  "/",
  requireAuth,
  requireRole("Super Admin", "Manager"),
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, user_id, user_name, action, detail, created_at
         FROM activity_logs
         ORDER BY created_at DESC
         LIMIT 100`
      );

      res.json({
        count: result.rows.length,
        activities: result.rows,
      });
    } catch (err) {
      console.error("List activity error:", err.message);
      res.status(500).json({ error: "Could not load activity log" });
    }
  }
);

export default router;