import { Router } from "express";
import crypto from "crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { logActivity } from "../activity/activity.routes.js";
import { sendPasswordResetCode } from "../services/email.service.js";

const router = Router();

// --------------------------------------------------
// POST /api/auth/login
// --------------------------------------------------
router.post("/login", async (req, res) => {
  try {
    const email = (req.body.email || "").trim().toLowerCase();
    const password = req.body.password || "";

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const result = await pool.query(
      `SELECT id, first_name, last_name, email, password_hash, role, status, must_change_password
       FROM users
       WHERE LOWER(email) = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const user = result.rows[0];

    if (user.status && user.status !== "Active") {
      return res.status(403).json({ error: "Account is disabled" });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    await logActivity({
      userId: user.id,
      userName: user.email,
      action: "User logged in",
      detail: null,
    });

    res.json({
      token,
      user: {
        id: user.id,
        userId: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        role: user.role,
        mustChangePassword: user.must_change_password === true,
      },
    });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ error: "Could not login" });
  }
});

// --------------------------------------------------
// POST /api/auth/forgot-password  { email }
// --------------------------------------------------
router.post("/forgot-password", async (req, res) => {
  try {
    const email = (req.body.email || "").trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const generic = {
      message: "If an account exists for this email, a reset code has been sent.",
    };

    const userRes = await pool.query(
      `SELECT id, email, status FROM users WHERE LOWER(email) = $1`,
      [email]
    );

    if (userRes.rows.length === 0) {
      return res.json(generic);
    }

    const user = userRes.rows[0];
    if (user.status && user.status !== "Active") {
      return res.json(generic);
    }

    const code = String(crypto.randomInt(100000, 999999));
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    await pool.query(
      `UPDATE password_reset_codes SET used = true
       WHERE user_id = $1 AND used = false`,
      [user.id]
    );

    await pool.query(
      `INSERT INTO password_reset_codes (user_id, email, code, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [user.id, email, code, expires]
    );

    await sendPasswordResetCode({ to: email, code });

    res.json(generic);
  } catch (err) {
    console.error("Forgot password error:", err.message);
    res.status(500).json({ error: "Could not process request" });
  }
});

// --------------------------------------------------
// POST /api/auth/verify-reset-code  { email, code }
// --------------------------------------------------
router.post("/verify-reset-code", async (req, res) => {
  try {
    const email = (req.body.email || "").trim().toLowerCase();
    const code = (req.body.code || "").trim();

    if (!email || !code) {
      return res.status(400).json({ error: "Email and code are required" });
    }

    const result = await pool.query(
      `SELECT id, expires_at, used FROM password_reset_codes
       WHERE LOWER(email) = $1 AND code = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [email, code]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Invalid code" });
    }

    const row = result.rows[0];
    if (row.used) {
      return res.status(400).json({ error: "Code already used" });
    }
    if (new Date(row.expires_at) < new Date()) {
      return res.status(400).json({ error: "Code expired" });
    }

    res.json({ message: "Code valid", valid: true });
  } catch (err) {
    console.error("Verify code error:", err.message);
    res.status(500).json({ error: "Could not verify code" });
  }
});

// --------------------------------------------------
// POST /api/auth/reset-password  { email, code, newPassword }
// --------------------------------------------------
router.post("/reset-password", async (req, res) => {
  try {
    const email = (req.body.email || "").trim().toLowerCase();
    const code = (req.body.code || "").trim();
    const newPassword = req.body.newPassword || "";

    if (!email || !code || !newPassword) {
      return res.status(400).json({
        error: "Email, code and newPassword are required",
      });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({
        error: "Password must be at least 8 characters",
      });
    }

    const result = await pool.query(
      `SELECT id, user_id, expires_at, used FROM password_reset_codes
       WHERE LOWER(email) = $1 AND code = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [email, code]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Invalid code" });
    }

    const row = result.rows[0];
    if (row.used) {
      return res.status(400).json({ error: "Code already used" });
    }
    if (new Date(row.expires_at) < new Date()) {
      return res.status(400).json({ error: "Code expired" });
    }

    const hash = await bcrypt.hash(newPassword, 10);

    await pool.query(
      `UPDATE users
       SET password_hash = $1, must_change_password = false
       WHERE id = $2`,
      [hash, row.user_id]
    );

    await pool.query(
      `UPDATE password_reset_codes SET used = true WHERE id = $1`,
      [row.id]
    );

    res.json({ message: "Password updated successfully. You can log in." });
  } catch (err) {
    console.error("Reset password error:", err.message);
    res.status(500).json({ error: "Could not reset password" });
  }
});

// --------------------------------------------------
// POST /api/auth/change-password  (user connecté)
// --------------------------------------------------
router.post("/change-password", requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "currentPassword and newPassword are required" });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const result = await pool.query(
      `SELECT id, password_hash FROM users WHERE id = $1`,
      [req.user.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(currentPassword, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      `UPDATE users
       SET password_hash = $1, must_change_password = false
       WHERE id = $2`,
      [hash, user.id]
    );

    await logActivity({
      userId: req.user.userId,
      userName: req.user.email || `User #${req.user.userId}`,
      action: "Changed password",
      detail: null,
    });

    res.json({ message: "Password changed successfully" });
  } catch (err) {
    console.error("Change password error:", err.message);
    res.status(500).json({ error: "Could not change password" });
  }
});

export default router;