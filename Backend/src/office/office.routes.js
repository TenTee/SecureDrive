// ONLYOFFICE Document Server integration.
//
//   GET  /api/office/config?key=   -> signed editor config for one file
//   POST /api/office/callback      -> called by the Document Server to save
//   POST /api/office/new           -> create a blank docx / xlsx / pptx (as a draft:
//                                     it reaches the folder only once edited)
//
// Flow: the browser asks for /config, loads the editor with it, the Document
// Server downloads the file through a short-lived presigned S3 URL, users edit
// (same document.key => real-time co-editing), and when the last editor closes
// the Document Server POSTs /callback with the URL of the new version, which we
// copy back to S3 under the same key.
import { Router } from "express";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireAuth } from "../middleware/auth.middleware.js";
import { pool } from "../db/pool.js";
import { logActivity } from "../activity/activity.routes.js";
import { canAccessKey, getKeyPermission } from "../files/access.js";
import { BUCKET_NAME } from "../config/s3Client.js";
import { getTemporaryS3Client } from "../config/stsClient.js";

const router = Router();
const TEMPLATES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../templates");

const UUID_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;

const DOCUMENT_TYPES = {
  word: ["doc", "docx", "docm", "dot", "dotx", "odt", "ott", "rtf", "txt"],
  cell: ["xls", "xlsx", "xlsm", "xlt", "xltx", "ods", "ots", "csv"],
  slide: ["ppt", "pptx", "pptm", "pot", "potx", "odp", "otp"],
  pdf: ["pdf"],
};
// Formats ONLYOFFICE edits natively (others open read-only).
const EDITABLE = new Set(["docx", "docm", "odt", "rtf", "txt", "xlsx", "xlsm", "ods", "csv", "pptx", "pptm", "odp"]);

const MIME = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
  rtf: "application/rtf",
  txt: "text/plain",
  csv: "text/csv",
};

function onlyofficeSecret() {
  const secret = process.env.ONLYOFFICE_JWT_SECRET;
  if (!secret) throw new Error("ONLYOFFICE_JWT_SECRET is not configured");
  return secret;
}

function extOf(name) {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i + 1).toLowerCase();
}

function displayName(fileKey) {
  return (fileKey.split("/").pop() || "file").replace(UUID_PREFIX, "");
}

function documentTypeFor(ext) {
  return Object.keys(DOCUMENT_TYPES).find((type) => DOCUMENT_TYPES[type].includes(ext)) || null;
}

/** drafts/<userId>/... -> { userId } for a new document that was never saved. */
function parseDraftKey(fileKey) {
  const match = /^drafts\/(\d+)\//.exec(fileKey);
  return match ? { userId: Number(match[1]) } : null;
}

async function objectExists(s3, key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function deleteQuietly(s3, key) {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
  } catch (err) {
    console.error("Draft delete failed:", key, err.message);
  }
}

// Drafts whose editor never reported back (browser crash, server restart…).
const DRAFT_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
async function cleanupStaleDrafts() {
  try {
    const s3 = await getTemporaryS3Client("draft-cleanup");
    let ContinuationToken;
    do {
      const page = await s3.send(
        new ListObjectsV2Command({ Bucket: BUCKET_NAME, Prefix: "drafts/", ContinuationToken })
      );
      for (const object of page.Contents || []) {
        if (Date.now() - new Date(object.LastModified).getTime() > DRAFT_MAX_AGE_MS) {
          await deleteQuietly(s3, object.Key);
        }
      }
      ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (ContinuationToken);
  } catch (err) {
    console.error("Draft cleanup failed:", err.message);
  }
}
setTimeout(cleanupStaleDrafts, 60 * 1000).unref();
setInterval(cleanupStaleDrafts, 6 * 60 * 60 * 1000).unref();

/** Same file + same version => same key, so everyone joins the same co-editing session. */
function documentKey(fileKey, etag) {
  return crypto.createHash("sha256").update(`${fileKey}:${etag}`).digest("hex").slice(0, 40);
}

// GET /api/office/config?key=
router.get("/config", requireAuth, async (req, res) => {
  try {
    const fileKey = req.query.key;
    if (!fileKey || fileKey.endsWith("/")) return res.status(400).json({ error: "Missing key" });

    // A new, never-edited document lives in drafts/<creatorId>/ (see POST /new):
    // only its creator can open it.
    const draft = parseDraftKey(fileKey);
    const permission = draft
      ? draft.userId === req.user.userId ? "Read & Write" : null
      : await getKeyPermission(fileKey, req.user);
    if (!permission) return res.status(403).json({ error: "You don't have access to this file." });

    const title = displayName(fileKey);
    const ext = extOf(title);
    const documentType = documentTypeFor(ext);
    if (!documentType) {
      return res.status(415).json({ error: "This file type cannot be opened in the editor." });
    }

    const s3 = await getTemporaryS3Client(`user-${req.user.userId}`);
    let head;
    try {
      head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: fileKey }));
    } catch (err) {
      if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
        return res.status(404).json({ error: "This file no longer exists." });
      }
      throw err;
    }

    // Draft: where the document goes on its first save.
    let targetKey = null;
    if (draft) {
      targetKey = decodeURIComponent(head.Metadata?.["target-key"] || "");
      if (!targetKey || !(await canAccessKey(targetKey, req.user, { needWrite: true }))) {
        return res.status(403).json({ error: "You can no longer write to the destination folder." });
      }
    }
    // The Document Server downloads the file itself, from the presigned URL.
    const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: fileKey }), {
      expiresIn: 900,
    });

    // ?view=1 (preview modal) and files in the trash always open read-only.
    const canEdit =
      permission === "Read & Write" &&
      EDITABLE.has(ext) &&
      req.query.view !== "1" &&
      !fileKey.startsWith("trash/");

    const userRow = await pool.query(`SELECT first_name, last_name, email FROM users WHERE id = $1`, [
      req.user.userId,
    ]);
    const u = userRow.rows[0];
    const userName = u ? `${u.first_name} ${u.last_name}`.trim() || u.email : req.user.email;

    // Callback URL carries a token bound to this exact file key, so a forged
    // callback cannot overwrite another file.
    const callbackToken = jwt.sign({ fileKey, targetKey, purpose: "onlyoffice-callback" }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });
    const backendUrl = (process.env.ONLYOFFICE_BACKEND_URL || "http://host.docker.internal:4000").replace(/\/$/, "");

    const config = {
      documentType,
      document: {
        fileType: ext,
        key: documentKey(fileKey, head.ETag || String(head.LastModified?.getTime())),
        title,
        url,
        permissions: {
          edit: canEdit,
          comment: canEdit,
          review: canEdit,
          download: true,
          print: true,
        },
      },
      editorConfig: {
        mode: canEdit ? "edit" : "view",
        lang: req.query.lang === "fr" ? "fr" : "en",
        callbackUrl: `${backendUrl}/api/office/callback?t=${encodeURIComponent(callbackToken)}`,
        user: { id: String(req.user.userId), name: userName },
        coEditing: { mode: "fast", change: true },
        customization: { autosave: true, forcesave: true, compactHeader: false },
      },
    };
    config.token = jwt.sign(config, onlyofficeSecret(), { expiresIn: "2h" });

    res.json({ config, canEdit, permission });
  } catch (err) {
    console.error("ONLYOFFICE config error:", err.message);
    res.status(500).json({ error: "Could not prepare the editor.", details: err.message });
  }
});

// GET /api/office/thumbnail?key=   -> { thumbnailUrl }
// Renders the first page to PNG with the Document Server's conversion service
// and caches it in S3 under thumbnails/<hash of key + version>.png.
const THUMB_TYPES = new Set([...DOCUMENT_TYPES.word, ...DOCUMENT_TYPES.cell, ...DOCUMENT_TYPES.slide, "pdf"]);
const thumbnailJobs = new Map(); // in-flight conversions, so parallel requests share one

async function convertToThumbnail(s3, fileKey, ext, version) {
  const internalUrl = (process.env.ONLYOFFICE_INTERNAL_URL || "http://localhost:8080").replace(/\/$/, "");
  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: fileKey }), {
    expiresIn: 300,
  });
  const request = {
    async: false,
    filetype: ext,
    key: `thumb-${version}`,
    outputtype: "png",
    thumbnail: { aspect: 1, first: true, width: 480, height: 480 },
    title: `thumbnail.${ext}`,
    url,
  };
  request.token = jwt.sign(request, onlyofficeSecret(), { expiresIn: "5m" });

  // Large files may need a few rounds: the same key resumes the same job.
  for (let attempt = 0; attempt < 10; attempt++) {
    const response = await fetch(`${internalUrl}/converter`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(request),
    });
    const data = await response.json().catch(() => ({}));
    if (data.error) throw new Error(`Conversion error ${data.error}`);
    if (data.endConvert && data.fileUrl) {
      const png = await fetch(data.fileUrl);
      if (!png.ok) throw new Error(`Thumbnail download failed (${png.status})`);
      return Buffer.from(await png.arrayBuffer());
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Conversion timed out");
}

router.get("/thumbnail", requireAuth, async (req, res) => {
  try {
    const fileKey = req.query.key;
    if (!fileKey || fileKey.endsWith("/")) return res.status(400).json({ error: "Missing key" });
    const ext = extOf(displayName(fileKey));
    if (!THUMB_TYPES.has(ext)) return res.status(415).json({ error: "No thumbnail for this file type." });
    if (!(await canAccessKey(fileKey, req.user))) {
      return res.status(403).json({ error: "You don't have access to this file." });
    }

    const s3 = await getTemporaryS3Client(`user-${req.user.userId}`);
    const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: fileKey }));
    const version = documentKey(fileKey, head.ETag || String(head.LastModified?.getTime()));
    const thumbKey = `thumbnails/${version}.png`;

    let exists = true;
    try {
      await s3.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: thumbKey }));
    } catch {
      exists = false;
    }

    if (!exists) {
      if (!thumbnailJobs.has(thumbKey)) {
        const job = convertToThumbnail(s3, fileKey, ext, version)
          .then((png) =>
            s3.send(
              new PutObjectCommand({
                Bucket: BUCKET_NAME,
                Key: thumbKey,
                Body: png,
                ContentType: "image/png",
                CacheControl: "private, max-age=31536000, immutable",
                ServerSideEncryption: "AES256",
              })
            )
          )
          .finally(() => thumbnailJobs.delete(thumbKey));
        thumbnailJobs.set(thumbKey, job);
      }
      await thumbnailJobs.get(thumbKey);
    }

    const thumbnailUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: thumbKey }), {
      expiresIn: 3600,
    });
    res.json({ thumbnailUrl });
  } catch (err) {
    console.error("Thumbnail error:", err.message);
    res.status(502).json({ error: "Could not create thumbnail.", details: err.message });
  }
});

// POST /api/office/callback?t=   (called by the Document Server, not the browser)
router.post("/callback", async (req, res) => {
  try {
    let fileKey;
    let targetKey = null; // set for a new document still in drafts/
    try {
      const decoded = jwt.verify(String(req.query.t || ""), process.env.JWT_SECRET);
      if (decoded.purpose !== "onlyoffice-callback") throw new Error("bad purpose");
      fileKey = decoded.fileKey;
      targetKey = decoded.targetKey || null;
    } catch {
      return res.status(403).json({ error: 1 });
    }

    // Trust only the payload signed by the Document Server.
    let body;
    try {
      if (req.body?.token) {
        body = jwt.verify(req.body.token, onlyofficeSecret());
      } else {
        // JWT_HEADER is AuthorizationJwt in docker-compose.yml (see comment there).
        const header = req.headers.authorizationjwt || req.headers.authorization || "";
        const decoded = jwt.verify(header.replace(/^Bearer\s+/i, ""), onlyofficeSecret());
        body = decoded.payload || decoded;
      }
    } catch {
      return res.status(403).json({ error: 1 });
    }

    // 2 = ready for saving (all editors closed, document changed),
    // 6 = force save while editing. Both only happen after a change.
    if (body.status === 2 || body.status === 6) {
      const response = await fetch(body.url);
      if (!response.ok) throw new Error(`Download from Document Server failed (${response.status})`);
      const buffer = Buffer.from(await response.arrayBuffer());

      const s3 = await getTemporaryS3Client("onlyoffice-save");
      // A draft is saved into its real folder: that is when the new file appears.
      const saveKey = targetKey || fileKey;
      const isNew = Boolean(targetKey) && !(await objectExists(s3, saveKey));
      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: saveKey,
          Body: buffer,
          ContentType: MIME[extOf(saveKey)] || "application/octet-stream",
          ServerSideEncryption: "AES256",
        })
      );
      // Everyone has left: the draft copy is no longer needed.
      if (targetKey && body.status === 2) await deleteQuietly(s3, fileKey);

      const editors = Array.isArray(body.users) ? body.users : [];
      for (const id of editors.length ? editors : [null]) {
        await logActivity({
          userId: id ? Number(id) || null : null,
          action: isNew ? "Created a document" : "Edited a document online",
          detail: displayName(saveKey),
        });
      }
    }

    // 4 = closed with no changes: a new document nobody typed in is dropped.
    if (body.status === 4 && targetKey) {
      const s3 = await getTemporaryS3Client("onlyoffice-save");
      await deleteQuietly(s3, fileKey);
    }

    res.json({ error: 0 });
  } catch (err) {
    console.error("ONLYOFFICE callback error:", err.message);
    // Non-zero tells the Document Server the save failed (it keeps the changes).
    res.status(500).json({ error: 1 });
  }
});

// POST /api/office/new   { type: "docx" | "xlsx" | "pptx", name, parent }
router.post("/new", requireAuth, async (req, res) => {
  try {
    const type = String(req.body.type || "").toLowerCase();
    if (!["docx", "xlsx", "pptx"].includes(type)) {
      return res.status(400).json({ error: "type must be docx, xlsx or pptx" });
    }

    const userId = req.user.userId;
    let parent = req.body.parent || `uploads/${userId}/`;
    if (!parent.endsWith("/")) parent += "/";
    if (req.user.role !== "Super Admin") {
      const own = parent.startsWith(`uploads/${userId}/`);
      const sharedWrite = await canAccessKey(parent, req.user, { needWrite: true });
      if (!own && !sharedWrite) return res.status(403).json({ error: "Invalid destination folder" });
    }

    let base = String(req.body.name || "").trim().replace(/\.(docx|xlsx|pptx)$/i, "");
    if (!base) base = { docx: "Document", xlsx: "Spreadsheet", pptx: "Presentation" }[type];
    const fileName = `${base.replace(/[^a-zA-Z0-9._-]/g, "_")}.${type}`;
    const id = crypto.randomUUID();
    // The blank file goes to a hidden draft. It only lands in `parent` (and in
    // the file list) on its first save, i.e. once someone has edited it; if the
    // editor is closed untouched, the draft is deleted (see /callback).
    const targetKey = `${parent}${id}-${fileName}`;
    const fileKey = `drafts/${userId}/${id}-${fileName}`;

    const body = await fs.readFile(path.join(TEMPLATES_DIR, `blank.${type}`));
    const s3 = await getTemporaryS3Client(`user-${userId}`);
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: fileKey,
        Body: body,
        ContentType: MIME[type],
        Metadata: { "target-key": encodeURIComponent(targetKey) },
        ServerSideEncryption: "AES256",
      })
    );

    res.status(201).json({ fileKey, fileName, draft: true });
  } catch (err) {
    console.error("Create document error:", err.message);
    res.status(500).json({ error: "Could not create the document.", details: err.message });
  }
});

export default router;
