import express from "express";
import cors from "cors";
import filesRoutes from "./files/files.routes.js";
import authRoutes from "./auth/auth.routes.js";
import userRoutes from "./users/users.routes.js";
import { pool } from "./db/pool.js";
import shareRoutes from "./files/shares.routes.js";
import activityRoutes from "./activity/activity.routes.js";
import favoritesRoutes from "./files/favorites.routes.js";
import searchRoutes from "./search/search.routes.js";
import notificationsRoutes from "./notifications/notifications.routes.js";
import dashboardRoutes from "./dashboard/dashboard.routes.js";
import officeRoutes from "./office/office.routes.js";
import accessRequestRoutes from "./files/access-requests.routes.js";

const app = express();

app.use(
  cors({
    origin: true,
    credentials: true,
    // Lets the browser read the renewed session token (sliding sessions).
    exposedHeaders: ["X-Refresh-Token"],
  })
);
app.use(express.json());

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch (err) {
    console.error("DB health check failed:", err.message);
    res.status(500).json({ status: "ok", database: "unreachable" });
  }
});

app.use("/api/files", filesRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/shares", shareRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/activity", activityRoutes);
app.use("/api/favorites", favoritesRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/office", officeRoutes);
app.use("/api/access-requests", accessRequestRoutes);

export default app;