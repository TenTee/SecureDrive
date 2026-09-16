import { Router } from "express";
import bcrypt from "bcrypt";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import { pool } from "../db/pool.js";
import { logActivity } from "../activity/activity.routes.js";

const router = Router();

const ALLOWED_ROLES = ["Super Admin", "Manager", "User"];

router.use(requireAuth);

// GET /api/users
router.get("/", requireRole("Super Admin", "Manager"), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, first_name, last_name, email, role, employee_id, department, status, created_at
       FROM users
       ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("List users error:", err.message);
    res.status(500).json({ error: "Could not load users" });
  }
});

// POST /api/users
router.post("/", requireRole("Super Admin", "Manager"), async (req, res) => {
  try {
    const { firstName, lastName, email, role } = req.body;

    if (!firstName || !lastName || !email || !role) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({
        error: "Invalid role. Allowed: Super Admin, Manager, User",
      });
    }

    const tempPassword = "ChangeMe123!";
    const hash = await bcrypt.hash(tempPassword, 10);

    const result = await pool.query(
      `INSERT INTO users (first_name, last_name, email, password_hash, role, status, must_change_password)
       VALUES ($1, $2, $3, $4, $5, 'Active', true)
       RETURNING id, first_name, last_name, email, role, status, created_at`,
      [firstName, lastName, email, hash, role]
    );

    await logActivity({
      userId: req.user.userId,
      userName: req.user.email || `User #${req.user.userId}`,
      action: "Created user account",
      detail: email,
    });

    res.status(201).json({
      user: result.rows[0],
      tempPassword,
    });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Email already exists" });
    }
    console.error("Create user error:", err.message);
    res.status(500).json({ error: "Could not create user" });
  }
});

// PATCH /api/users/:id/status
router.patch("/:id/status", requireRole("Super Admin", "Manager"), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["Active", "Disabled"].includes(status)) {
      return res.status(400).json({ error: "Status must be Active or Disabled" });
    }

    const result = await pool.query(
      `UPDATE users SET status = $1 WHERE id = $2
       RETURNING id, first_name, last_name, email, role, status`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    await logActivity({
      userId: req.user.userId,
      userName: req.user.email,
      action: status === "Disabled" ? "Disabled user account" : "Enabled user account",
      detail: result.rows[0].email,
    });

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Update status error:", err.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// DELETE /api/users/:id
router.delete("/:id", requireRole("Super Admin"), async (req, res) => {
  try {
    const { id } = req.params;

    if (Number(id) === req.user.userId) {
      return res.status(400).json({ error: "You cannot delete your own account" });
    }

    const result = await pool.query(
      "DELETE FROM users WHERE id = $1 RETURNING id, email",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    await logActivity({
      userId: req.user.userId,
      userName: req.user.email,
      action: "Deleted user account",
      detail: result.rows[0].email,
    });

    res.json({ message: "User deleted successfully" });
  } catch (err) {
    console.error("Delete user error:", err.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// POST /api/users/:id/reset-password
router.post("/:id/reset-password", requireRole("Super Admin", "Manager"), async (req, res) => {
  try {
    const { id } = req.params;
    const tempPassword = "ChangeMe123!";
    const hash = await bcrypt.hash(tempPassword, 10);

    const result = await pool.query(
      `UPDATE users
       SET password_hash = $1, must_change_password = true
       WHERE id = $2
       RETURNING id, email`,
      [hash, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    await logActivity({
      userId: req.user.userId,
      userName: req.user.email,
      action: "Reset user password",
      detail: result.rows[0].email,
    });

    res.json({
      message: "Password reset successfully",
      tempPassword,
    });
  } catch (err) {
    console.error("Reset password error:", err.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// PATCH /api/users/:id — modifier nom / rôle
router.patch("/:id", requireRole("Super Admin", "Manager"), async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, role } = req.body;

    const ALLOWED_ROLES = ["Super Admin", "Manager", "User"];

    if (!firstName || !lastName || !role) {
      return res.status(400).json({ error: "firstName, lastName and role are required" });
    }

    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    // Manager ne peut pas promouvoir en Super Admin
    if (req.user.role === "Manager" && role === "Super Admin") {
      return res.status(403).json({ error: "Managers cannot assign Super Admin role" });
    }

    const result = await pool.query(
      `UPDATE users
       SET first_name = $1, last_name = $2, role = $3
       WHERE id = $4
       RETURNING id, first_name, last_name, email, role, status, created_at`,
      [firstName, lastName, role, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    await logActivity({
      userId: req.user.userId,
      userName: req.user.email,
      action: "Updated user account",
      detail: result.rows[0].email,
    });

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Update user error:", err.message);
    res.status(500).json({ error: "Could not update user" });
  }
});
export default router;