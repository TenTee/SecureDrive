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

    // Demandes d'accès : reçues (en attente) et réponses à mes demandes (30 jours)
    try {
      const incoming = await pool.query(
        `SELECT r.id, r.file_key, r.file_name, r.permission, r.message, r.created_at,
                u.email, u.first_name, u.last_name
         FROM access_requests r
         JOIN users u ON u.id = r.requester_id
         WHERE r.owner_id = $1 AND r.status = 'pending'
         ORDER BY r.created_at DESC
         LIMIT 20`,
        [userId]
      );
      for (const r of incoming.rows) {
        const who = [r.first_name, r.last_name].filter(Boolean).join(" ") || r.email;
        items.push({
          id: `access-${r.id}`,
          type: "access-request",
          requestId: r.id,
          fileKey: r.file_key,
          permission: r.permission,
          title: "Access request",
          body: `${who} wants ${r.permission} access to "${r.file_name}"${r.message ? ` — “${r.message}”` : ""}`,
          createdAt: r.created_at,
        });
      }

      const answered = await pool.query(
        `SELECT id, file_key, file_name, permission, status, decided_at
         FROM access_requests
         WHERE requester_id = $1 AND status <> 'pending' AND decided_at > now() - interval '30 days'
         ORDER BY decided_at DESC
         LIMIT 10`,
        [userId]
      );
      for (const r of answered.rows) {
        items.push({
          id: `access-answer-${r.id}`,
          type: r.status === "approved" ? "access-approved" : "access-denied",
          fileKey: r.file_key,
          title: r.status === "approved" ? "Access granted" : "Access denied",
          body:
            r.status === "approved"
              ? `You now have ${r.permission} access to "${r.file_name}"`
              : `Your request for "${r.file_name}" was declined`,
          createdAt: r.decided_at,
        });
      }
    } catch (e) {
      // Table not created yet (first start) or other DB error: skip this block.
      console.error("Notif access requests:", e.message);
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

    // Pending access requests first (they need an answer), then newest first.
    items.sort(
      (a, b) =>
        (b.type === "access-request") - (a.type === "access-request") ||
        new Date(b.createdAt) - new Date(a.createdAt)
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