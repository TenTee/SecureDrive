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

app.get("/", (req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#0b1220" />
    <title>SecureDrive — API</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      * { box-sizing: border-box; }
      body { min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 24px; color: #e5e7eb; background: radial-gradient(ellipse at 50% 0%, #172554 0, #0b1220 55%); }
      main { width: min(100%, 640px); padding: 48px; border: 1px solid #263449; border-radius: 24px; background: rgb(15 23 42 / 88%); box-shadow: 0 24px 80px rgb(0 0 0 / 30%); }
      .brand { display: flex; align-items: center; gap: 12px; color: #fff; font-size: 15px; font-weight: 700; letter-spacing: .04em; }
      .icon { display: grid; width: 40px; height: 40px; place-items: center; border-radius: 12px; color: #bfdbfe; background: #1e3a8a; }
      h1 { margin: 36px 0 12px; color: #fff; font-size: clamp(32px, 7vw, 48px); letter-spacing: -.04em; }
      p { margin: 0; color: #aab6c8; font-size: 16px; line-height: 1.7; }
      .status { display: inline-flex; align-items: center; gap: 10px; margin-top: 30px; padding: 10px 14px; border: 1px solid #334155; border-radius: 999px; color: #cbd5e1; font-size: 14px; }
      .dot { width: 9px; height: 9px; border-radius: 50%; background: #fbbf24; }
      .status[data-state="ok"] .dot { background: #34d399; box-shadow: 0 0 12px rgb(52 211 153 / 55%); }
      .status[data-state="error"] .dot { background: #fb7185; }
      a { display: inline-block; margin-top: 28px; color: #93c5fd; font-size: 14px; text-decoration: none; }
      a:hover { color: #dbeafe; text-decoration: underline; }
      footer { margin-top: 44px; padding-top: 20px; border-top: 1px solid #263449; color: #718096; font-size: 12px; }
      @media (max-width: 520px) { main { padding: 32px 24px; } }
    </style>
  </head>
  <body>
    <main>
      <div class="brand"><span class="icon" aria-hidden="true">S</span> SECUREDRIVE</div>
      <h1>API SecureDrive</h1>
      <p>Le service backend est prêt à recevoir les requêtes de l’application SecureDrive.</p>
      <div class="status" id="status" role="status" aria-live="polite">
        <span class="dot" aria-hidden="true"></span>
        <span id="status-text">Vérification du service…</span>
      </div>
      <a href="/api/health">Consulter le point de santé de l’API <span aria-hidden="true">→</span></a>
      <footer>SecureDrive · Service API</footer>
    </main>
    <script>
      fetch("/api/health")
        .then((response) => {
          const status = document.getElementById("status");
          status.dataset.state = response.ok ? "ok" : "error";
          document.getElementById("status-text").textContent = response.ok
            ? "Service opérationnel"
            : "Service temporairement indisponible";
        })
        .catch(() => {
          document.getElementById("status").dataset.state = "error";
          document.getElementById("status-text").textContent = "Service temporairement indisponible";
        });
    </script>
  </body>
</html>`);
});

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