import { Router } from "express";
import crypto from "crypto";
import multer from "multer";
import { requireAuth } from "../middleware/auth.middleware.js";
import { pool } from "../db/pool.js";
import { logActivity } from "../activity/activity.routes.js";
import { canAccessKey, getKeyPermission, resolveKeyPermission } from "./access.js";
import {
  PutObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { BUCKET_NAME } from "../config/s3Client.js";
import { getTemporaryS3Client } from "../config/stsClient.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
});

async function listAllKeys(s3, prefix) {
  const keys = [];
  let continuationToken;

  do {
    const response = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );
    keys.push(...(response.Contents || []).flatMap((item) => (item.Key ? [item.Key] : [])));
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

async function deleteKeys(s3, keys) {
  for (let index = 0; index < keys.length; index += 1000) {
    const batch = keys.slice(index, index + 1000);
    if (batch.length === 0) continue;
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: BUCKET_NAME,
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
      })
    );
  }
}

async function objectExists(s3, key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
    return true;
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || ["NotFound", "NoSuchKey"].includes(err?.name)) {
      return false;
    }
    throw err;
  }
}

async function removeSharesForDeletedKey(key, isFolder) {
  if (isFolder) {
    await pool.query(
      `DELETE FROM shares WHERE LEFT(file_key, LENGTH($1)) = $1`,
      [key]
    );
  } else {
    await pool.query(`DELETE FROM shares WHERE file_key = $1`, [key]);
  }
}

function sanitizeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function encodeCopySource(key) {
  return encodeURIComponent(`${BUCKET_NAME}/${key}`).replace(/%2F/g, "/");
}

// POST /api/files/rename
router.post("/rename", requireAuth, async (req, res) => {
  let client;
  let copiedKeys = [];
  let referencesCommitted = false;
  try {
    client = await pool.connect();
    const { key } = req.body;
    const rawName = typeof req.body.newName === "string" ? req.body.newName.trim() : "";
    if (!key || !rawName) return res.status(400).json({ error: "File key and new name are required" });
    if (!key.startsWith("uploads/") || key === "uploads/" || key.endsWith(".keep")) {
      return res.status(400).json({ error: "Only files and folders in uploads/ can be renamed" });
    }
    if (rawName === "." || rawName === ".." || /[\\/]/.test(rawName)) {
      return res.status(400).json({ error: "The new name cannot contain path separators" });
    }
    const safeName = sanitizeFileName(rawName);
    if (!safeName || safeName === "." || safeName === "..") {
      return res.status(400).json({ error: "Invalid name" });
    }
    if (!(await canAccessKey(key, req.user, { needWrite: true }))) {
      return res.status(403).json({ error: "You don't have permission to rename this item." });
    }

    const isFolder = key.endsWith("/");
    const oldLeaf = key.slice(0, isFolder ? -1 : undefined).split("/").pop();
    const parent = key.slice(0, key.lastIndexOf("/") + 1);
    const uuidPrefix = !isFolder
      ? (oldLeaf.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-)/i)?.[1] || "")
      : "";
    const newLeaf = `${uuidPrefix}${safeName}`;
    const newKey = `${parent}${newLeaf}${isFolder ? "/" : ""}`;
    if (newKey === key) return res.status(400).json({ error: "The new name is unchanged" });

    const s3 = await getTemporaryS3Client(`user-${req.user.userId}`);
    const sourceKeys = isFolder ? await listAllKeys(s3, key) : [key];
    if (sourceKeys.length === 0) return res.status(404).json({ error: "Item not found" });
    const destinationStem = isFolder ? newKey.slice(0, -1) : newKey;
    const destinationExists = await objectExists(s3, destinationStem) ||
      (await listAllKeys(s3, `${destinationStem}/`)).length > 0;
    if (destinationExists) return res.status(409).json({ error: "An item with this name already exists" });

    for (const sourceKey of sourceKeys) {
      const destinationKey = `${newKey}${sourceKey.slice(key.length)}`;
      await s3.send(new CopyObjectCommand({
        Bucket: BUCKET_NAME,
        CopySource: encodeCopySource(sourceKey),
        Key: destinationKey,
        MetadataDirective: "COPY",
      }));
      copiedKeys.push(destinationKey);
    }

    await client.query("BEGIN");
    if (isFolder) {
      await client.query(
        `UPDATE shares
         SET file_key = $2 || substring(file_key from length($1) + 1),
             file_name = CASE WHEN file_key = $1 THEN $3 ELSE file_name END
         WHERE file_key = $1 OR LEFT(file_key, LENGTH($1)) = $1`,
        [key, newKey, safeName]
      );
      await client.query(
        `UPDATE favorites
         SET file_key = $2 || substring(file_key from length($1) + 1),
             file_name = CASE WHEN file_key = $1 THEN $3 ELSE file_name END
         WHERE file_key = $1 OR LEFT(file_key, LENGTH($1)) = $1`,
        [key, newKey, safeName]
      );
    } else {
      await client.query(`UPDATE shares SET file_key = $2, file_name = $3 WHERE file_key = $1`, [key, newKey, safeName]);
      await client.query(`UPDATE favorites SET file_key = $2, file_name = $3 WHERE file_key = $1`, [key, newKey, safeName]);
    }
    await client.query("COMMIT");
    referencesCommitted = true;

    try {
      await deleteKeys(s3, sourceKeys);
    } catch (cleanupError) {
      console.error("Old key cleanup after rename failed:", cleanupError.message);
    }
    await logActivity({
      userId: req.user.userId,
      userName: req.user.email || `User #${req.user.userId}`,
      action: isFolder ? "Renamed a folder" : "Renamed a file",
      detail: `${key} → ${newKey}`,
    });
    res.json({ message: "Item renamed", key: newKey, name: safeName, isFolder });
  } catch (err) {
    if (!referencesCommitted) {
      try { await client?.query("ROLLBACK"); } catch { /* transaction may not have started */ }
    }
    if (!referencesCommitted && copiedKeys.length > 0) {
      try { await deleteKeys(await getTemporaryS3Client(`user-${req.user.userId}`), copiedKeys); }
      catch (cleanupError) { console.error("Rename cleanup error:", cleanupError.message); }
    }
    console.error("Rename error:", err.message);
    res.status(500).json({ error: "Could not rename item", details: err.message });
  } finally {
    client?.release();
  }
});

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

    const shareRows = !isSuperAdmin && !prefix.startsWith(`uploads/${userId}/`)
      ? (await pool.query(
          `SELECT permission, file_key FROM shares WHERE shared_with_id = $1`,
          [userId]
        )).rows
      : [];
    const permissionFor = (key) => resolveKeyPermission(key, req.user, shareRows);

    res.json({
      bucket: BUCKET_NAME,
      path: prefix,
      folders: folders.map((folder) => ({ ...folder, permission: permissionFor(folder.key) || "Read Only" })),
      files: files.map((file) => ({ ...file, permission: permissionFor(file.key) || "Read Only" })),
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

    const { originalname, buffer, size } = req.file;
    const contentType = req.file.mimetype || "application/octet-stream";

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
        ContentType: contentType,
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
      type: contentType,
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
    const isVideo = ["mp4", "webm", "ogg", "mov"].includes(ext);
    if (!isImage && !isPdf && !isVideo) {
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

    let type = "image";
    if (isPdf) type = "pdf";
    if (isVideo) type = "video";

    res.json({
      previewUrl,
      fileName: displayName,
      type,
      previewable: true,
    });
  } catch (err) {
    console.error("Preview error:", err.message);
    res.status(500).json({ error: "Could not create preview URL", details: err.message });
  }
});

// GET /api/files/item?key=  (metadata for a protected deep link)
router.get("/item", requireAuth, async (req, res) => {
  try {
    const fileKey = req.query.key;
    if (!fileKey) return res.status(400).json({ error: "Missing key" });
    const permission = await getKeyPermission(fileKey, req.user);
    if (!permission) {
      return res.status(403).json({ error: "You don't have access to this file." });
    }

    const s3 = await getTemporaryS3Client(`user-${req.user.userId}`);
    const response = await s3.send(
      new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: fileKey })
    );
    res.json({
      key: fileKey,
      size: response.ContentLength,
      lastModified: response.LastModified,
      permission,
    });
  } catch (err) {
    console.error("Get file metadata error:", err.message);
    res.status(404).json({ error: "File not found or no longer available." });
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

    const { buffer } = req.file;
    const contentType = req.file.mimetype || "application/octet-stream";

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: fileKey,
        Body: buffer,
        ContentType: contentType,
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

    const isFolder = key.endsWith("/");
    const sourceKeys = isFolder ? await listAllKeys(s3, key) : [key];

    if (isFolder) {
      await deleteKeys(s3, sourceKeys);
    } else {
      const trashKey = key.replace(/^uploads\//, "trash/");
      await s3.send(
        new CopyObjectCommand({
          Bucket: BUCKET_NAME,
          CopySource: `${BUCKET_NAME}/${key}`,
          Key: trashKey,
        })
      );
      await deleteKeys(s3, sourceKeys);
    }

    let shareCleanupWarning = false;
    try {
      await removeSharesForDeletedKey(key, isFolder);
    } catch (cleanupError) {
      shareCleanupWarning = true;
      console.error("Trash succeeded but share cleanup failed:", cleanupError.message);
    }

    await logActivity({
      userId: req.user.userId,
      userName: req.user.email || `User #${req.user.userId}`,
      action: isFolder ? "Permanently deleted folder" : "Moved file to trash",
      detail: key,
    });

    res.json({
      message: isFolder ? "Folder permanently deleted" : "File moved to trash",
      ...(shareCleanupWarning ? { warning: "File action succeeded, but stale share records could not be cleaned up." } : {}),
      ...(isFolder ? {} : { trashKey }),
    });
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

    const keys = key.endsWith("/") ? await listAllKeys(s3, key) : [key];
    await deleteKeys(s3, keys);
    await removeSharesForDeletedKey(key, key.endsWith("/"));

    await logActivity({
      userId: req.user.userId,
      userName: req.user.email || `User #${req.user.userId}`,
      action: key.endsWith("/") ? "Permanently deleted folder" : "Permanently deleted file",
      detail: key,
    });

    res.json({ message: "File permanently deleted" });
  } catch (err) {
    console.error("Delete forever error:", err.message);
    res.status(500).json({ error: "Could not delete file.", details: err.message });
  }
});

export default router;