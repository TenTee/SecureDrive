import { Router } from "express";
import crypto from "crypto";
import multer from "multer";
import { requireAuth } from "../middleware/auth.middleware.js";
import { pool } from "../db/pool.js";
import { logActivity } from "../activity/activity.routes.js";
import { canAccessKey } from "./access.js";
import {
  PutObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { BUCKET_NAME } from "../config/s3Client.js";
import { getTemporaryS3Client } from "../config/stsClient.js";

const router = Router();

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "application/json",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/svg+xml",
  "text/plain",
  "text/css",
  "text/javascript",
]);

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
});

function sanitizeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

// GET /api/files?path=
router.get("/", requireAuth, async (req, res) => {
  try {
    const s3 = await getTemporaryS3Client(`user-${req.user.userId}`);
    const userId = req.user.userId;
    const isSuperAdmin = req.user.role === "Super Admin";

    let prefix =
      req.query.path || (isSuperAdmin ? "uploads/" : `uploads/${userId}/`);
    if (!prefix.endsWith("/")) prefix += "/";

    // Proprio OU Super Admin OU dossier partagé avec moi
    if (!isSuperAdmin && !prefix.startsWith(`uploads/${userId}/`)) {
      const ok = await canAccessKey(prefix, req.user);
      if (!ok) {
        return res.status(403).json({ error: "Access denied to this path" });
      }
    }

    const response = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: prefix,
        Delimiter: "/",
        MaxKeys: 200,
      })
    );

    const folders = (response.CommonPrefixes || []).map((p) => {
      const full = p.Prefix;
      const parts = full.replace(/\/$/, "").split("/");
      return { key: full, name: parts[parts.length - 1], type: "folder" };
    });

    const files = (response.Contents || [])
      .filter((item) => {
        if (!item.Key || item.Key.endsWith("/")) return false;
        if (item.Key.endsWith(".keep")) return false;
        const relative = item.Key.slice(prefix.length);
        return relative && !relative.includes("/");
      })
      .map((item) => ({
        key: item.Key,
        size: item.Size,
        lastModified: item.LastModified,
        type: "file",
      }));

    res.json({
      bucket: BUCKET_NAME,
      path: prefix,
      folders,
      files,
      count: folders.length + files.length,
    });
  } catch (err) {
    console.error("List files error:", err.message);
    res.status(500).json({
      error: "Could not list files from S3",
      details: err.message,
    });
  }
});

// POST /api/files/folder
router.post("/folder", requireAuth, async (req, res) => {
  try {
    const s3 = await getTemporaryS3Client(`user-${req.user.userId}`);
    const rawName = (req.body.name || "").trim();
    if (!rawName) return res.status(400).json({ error: "Folder name is required" });

    const safe = sanitizeFileName(rawName);
    if (!safe) return res.status(400).json({ error: "Invalid folder name" });

    const userId = req.user.userId;
    let parent = req.body.parent || `uploads/${userId}/`;
    if (!parent.endsWith("/")) parent += "/";

    if (req.user.role !== "Super Admin") {
      const own = parent.startsWith(`uploads/${userId}/`);
      const sharedWrite = await canAccessKey(parent, req.user, { needWrite: true });
      if (!own && !sharedWrite) {
        return res.status(403).json({ error: "Invalid parent path" });
      }
    }

    const folderKey = `${parent}${safe}/`;

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: `${folderKey}.keep`,
        Body: Buffer.from(""),
        ContentType: "application/x-directory",
        ServerSideEncryption: "AES256",
      })
    );

    await logActivity({
      userId: req.user.userId,
      userName: req.user.email || `User #${req.user.userId}`,
      action: "Created folder",
      detail: safe,
    });

    res.status(201).json({ message: "Folder created", folderKey, name: safe });
  } catch (err) {
    console.error("Create folder error:", err.message);
    res.status(500).json({ error: "Could not create folder", details: err.message });
  }
});

// POST /api/files/move
router.post("/move", requireAuth, async (req, res) => {
  try {
    const s3 = await getTemporaryS3Client(`user-${req.user.userId}`);
    const { key, destinationPath } = req.body;

    if (!key || !destinationPath) {
      return res.status(400).json({ error: "Missing key or destinationPath" });
    }
    if (!(await canAccessKey(key, req.user, { needWrite: true }))) {
      return res.status(403).json({ error: "You don't have permission to move this file." });
    }
    if (!key.startsWith("uploads/")) {
      return res.status(400).json({ error: "Only files in uploads/ can be moved." });
    }

    let dest = destinationPath;
    if (!dest.endsWith("/")) dest += "/";

    if (req.user.role !== "Super Admin") {
      const ownDest = dest.startsWith(`uploads/${req.user.userId}/`);
      const sharedDest = await canAccessKey(dest, req.user, { needWrite: true });
      if (!ownDest && !sharedDest) {
        return res.status(403).json({ error: "Invalid destination" });
      }
    }

    const fileName = key.split("/").pop();
    const newKey = `${dest}${fileName}`;
    if (newKey === key) {
      return res.status(400).json({ error: "File is already in this folder" });
    }

    await s3.send(
      new CopyObjectCommand({
        Bucket: BUCKET_NAME,
        CopySource: `${BUCKET_NAME}/${key}`,
        Key: newKey,
      })
    );
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key }));

    await logActivity({
      userId: req.user.userId,
      userName: req.user.email || `User #${req.user.userId}`,
      action: "Moved a file",
      detail: `${key} → ${newKey}`,
    });

    res.json({ message: "File moved", from: key, to: newKey });
  } catch (err) {
    console.error("Move error:", err.message);
    res.status(500).json({ error: "Could not move file", details: err.message });
  }
});

// POST /api/files/upload
router.post("/upload", requireAuth, upload.single("file"), async (req, res) => {
  try {
    const s3 = await getTemporaryS3Client(`user-${req.user.userId}`);
    if (!req.file) return res.status(400).json({ error: "No file received" });

    const { originalname, mimetype, buffer, size } = req.file;
    if (!ALLOWED_TYPES.has(mimetype)) {
      return res.status(415).json({ error: `File type "${mimetype}" is not allowed.` });
    }

    let basePath = (req.body.path || `uploads/${req.user.userId}/`).trim();
    if (!basePath.endsWith("/")) basePath += "/";

    if (req.user.role !== "Super Admin") {
      const own = basePath.startsWith(`uploads/${req.user.userId}/`);
      const sharedWrite = await canAccessKey(basePath, req.user, { needWrite: true });
      if (!own && !sharedWrite) {
        return res.status(403).json({ error: "Invalid upload path" });
      }
    }

    const uniqueId = crypto.randomUUID();
    const safeName = sanitizeFileName(originalname);
    const fileKey = `${basePath}${uniqueId}-${safeName}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: fileKey,
        Body: buffer,
        ContentType: mimetype,
        ServerSideEncryption: "AES256",
      })
    );

    await logActivity({
      userId: req.user.userId,
      userName: req.user.email || `User #${req.user.userId}`,
      action: "Uploaded a file",
      detail: originalname,
    });

    res.status(201).json({
      message: "File uploaded successfully",
      fileKey,
      fileName: originalname,
      size,
      type: mimetype,
    });
  } catch (err) {
    console.error("Upload error:", err.message);
    res.status(500).json({ error: "Could not upload file to S3", details: err.message });
  }
});

// GET /api/files/preview
router.get("/preview", requireAuth, async (req, res) => {
  try {
    const fileKey = req.query.key;
    if (!fileKey) return res.status(400).json({ error: "Missing key" });

    if (!(await canAccessKey(fileKey, req.user))) {
      return res.status(403).json({ error: "You don't have permission to preview this file." });
    }

    const rawName = fileKey.split("/").pop() || "file";
    const displayName = rawName.replace(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i,
      ""
    );
    const ext = (displayName.split(".").pop() || "").toLowerCase();
    const isImage = ["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext);
    const isPdf = ext === "pdf";
    if (!isImage && !isPdf) {
      return res.status(415).json({
        error: "Preview not available for this file type.",
        fileName: displayName,
        previewable: false,
      });
    }

    const s3 = await getTemporaryS3Client(`user-${req.user.userId}`);
    const previewUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key: fileKey }),
      { expiresIn: 600 }
    );

    res.json({
      previewUrl,
      fileName: displayName,
      type: isPdf ? "pdf" : "image",
      previewable: true,
    });
  } catch (err) {
    console.error("Preview error:", err.message);
    res.status(500).json({ error: "Could not create preview URL", details: err.message });
  }
});

// GET /api/files/download
router.get("/download", requireAuth, async (req, res) => {
  try {
    const s3 = await getTemporaryS3Client(`user-${req.user.userId}`);
    const fileKey = req.query.key;
    if (!fileKey) return res.status(400).json({ error: "Missing 'key' query parameter." });

    if (!(await canAccessKey(fileKey, req.user))) {
      return res.status(403).json({ error: "You don't have permission to download this file." });
    }

    const s3Response = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key: fileKey })
    );
    const rawName = fileKey.split("/").pop();
    const displayName = rawName.replace(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i,
      ""
    );

    res.setHeader("Content-Type", s3Response.ContentType || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${displayName}"`);
    s3Response.Body.pipe(res);
  } catch (err) {
    console.error("Download error:", err.message);
    res.status(500).json({ error: "Could not download file.", details: err.message });
  }
});

// POST /api/files/replace
router.post("/replace", requireAuth, upload.single("file"), async (req, res) => {
  try {
    const s3 = await getTemporaryS3Client(`user-${req.user.userId}`);
    const fileKey = req.body.key;
    if (!fileKey) return res.status(400).json({ error: "Missing key" });
    if (!req.file) return res.status(400).json({ error: "No file received" });

    if (!(await canAccessKey(fileKey, req.user, { needWrite: true }))) {
      return res.status(403).json({
        error: "You don't have permission to modify this file (need Read & Write).",
      });
    }

    const { mimetype, buffer } = req.file;
    if (!ALLOWED_TYPES.has(mimetype)) {
      return res.status(415).json({ error: `File type "${mimetype}" is not allowed.` });
    }

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: fileKey,
        Body: buffer,
        ContentType: mimetype,
        ServerSideEncryption: "AES256",
      })
    );

    await logActivity({
      userId: req.user.userId,
      userName: req.user.email || `User #${req.user.userId}`,
      action: "Updated/replaced a file",
      detail: fileKey,
    });

    res.json({ message: "File replaced successfully", fileKey });
  } catch (err) {
    console.error("Replace error:", err.message);
    res.status(500).json({ error: "Could not replace file.", details: err.message });
  }
});

// POST /api/files/trash
router.post("/trash", requireAuth, async (req, res) => {
  try {
    const s3 = await getTemporaryS3Client(`user-${req.user.userId}`);
    const { key } = req.body;
    if (!key) return res.status(400).json({ error: "Missing key" });

    if (!(await canAccessKey(key, req.user, { needWrite: true }))) {
      return res.status(403).json({ error: "You don't have permission to trash this file." });
    }
    if (!key.startsWith("uploads/")) {
      return res.status(400).json({ error: "Only files in uploads/ can be moved to trash." });
    }

    const trashKey = key.replace(/^uploads\//, "trash/");
    await s3.send(
      new CopyObjectCommand({
        Bucket: BUCKET_NAME,
        CopySource: `${BUCKET_NAME}/${key}`,
        Key: trashKey,
      })
    );
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key }));

    await logActivity({
      userId: req.user.userId,
      userName: req.user.email || `User #${req.user.userId}`,
      action: "Moved file to trash",
      detail: key,
    });

    res.json({ message: "File moved to trash", trashKey });
  } catch (err) {
    console.error("Trash error:", err.message);
    res.status(500).json({ error: "Could not move file to trash.", details: err.message });
  }
});

// GET /api/files/trash
router.get("/trash", requireAuth, async (req, res) => {
  try {
    const s3 = await getTemporaryS3Client(`user-${req.user.userId}`);
    const isSuperAdmin = req.user.role === "Super Admin";
    const response = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        MaxKeys: 100,
        Prefix: isSuperAdmin ? "trash/" : `trash/${req.user.userId}/`,
      })
    );
    const files = (response.Contents || [])
      .filter((item) => item.Key && !item.Key.endsWith("/"))
      .map((item) => ({
        key: item.Key,
        size: item.Size,
        lastModified: item.LastModified,
      }));
    res.json({ count: files.length, files });
  } catch (err) {
    console.error("List trash error:", err.message);
    res.status(500).json({ error: "Could not list trash.", details: err.message });
  }
});

// POST /api/files/restore
router.post("/restore", requireAuth, async (req, res) => {
  try {
    const s3 = await getTemporaryS3Client(`user-${req.user.userId}`);
    const { key } = req.body;
    if (!key) return res.status(400).json({ error: "Missing key" });
    if (!(await canAccessKey(key, req.user))) {
      return res.status(403).json({ error: "You don't have permission to restore this file." });
    }
    if (!key.startsWith("trash/")) {
      return res.status(400).json({ error: "Only files in trash/ can be restored." });
    }

    const restoreKey = key.replace(/^trash\//, "uploads/");
    await s3.send(
      new CopyObjectCommand({
        Bucket: BUCKET_NAME,
        CopySource: `${BUCKET_NAME}/${key}`,
        Key: restoreKey,
      })
    );
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key }));

    await logActivity({
      userId: req.user.userId,
      userName: req.user.email || `User #${req.user.userId}`,
      action: "Restored file from trash",
      detail: key,
    });

    res.json({ message: "File restored", restoreKey });
  } catch (err) {
    console.error("Restore error:", err.message);
    res.status(500).json({ error: "Could not restore file.", details: err.message });
  }
});

// DELETE /api/files
router.delete("/", requireAuth, async (req, res) => {
  try {
    const s3 = await getTemporaryS3Client(`user-${req.user.userId}`);
    const { key } = req.body;
    if (!key) return res.status(400).json({ error: "Missing key" });
    if (!(await canAccessKey(key, req.user, { needWrite: true }))) {
      return res.status(403).json({ error: "You don't have permission to delete this file." });
    }

    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key }));

    await logActivity({
      userId: req.user.userId,
      userName: req.user.email || `User #${req.user.userId}`,
      action: "Permanently deleted file",
      detail: key,
    });

    res.json({ message: "File permanently deleted" });
  } catch (err) {
    console.error("Delete forever error:", err.message);
    res.status(500).json({ error: "Could not delete file.", details: err.message });
  }
});

export default router;