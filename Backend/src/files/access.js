import { pool } from "../db/pool.js";

/** Normalise une clé dossier avec / à la fin */
export function asFolderKey(key) {
  if (!key) return key;
  return key.endsWith("/") ? key : `${key}/`;
}

/**
 * Accès fichier ou dossier partagé (y compris contenu d'un dossier partagé)
 * needWrite = true → il faut "Read & Write"
 */
export async function canAccessKey(fileKey, user, { needWrite = false } = {}) {
  if (!fileKey || !user) return false;

  if (user.role === "Super Admin") return true;

  const uid = user.userId;
  if (
    fileKey.startsWith(`uploads/${uid}/`) ||
    fileKey.startsWith(`trash/${uid}/`)
  ) {
    return true;
  }

  const result = await pool.query(
    `SELECT permission, file_key FROM shares WHERE shared_with_id = $1`,
    [uid]
  );

  for (const row of result.rows) {
    let sharedKey = row.file_key;
    const perm = row.permission || "Read Only";

    const isFolderShare = sharedKey.endsWith("/");
    const folderPrefix = isFolderShare ? sharedKey : null;

    const exactFile = fileKey === sharedKey;
    const exactFolder =
      isFolderShare &&
      (fileKey === sharedKey || fileKey === sharedKey.slice(0, -1));
    const insideFolder = folderPrefix && fileKey.startsWith(folderPrefix);

    if (exactFile || exactFolder || insideFolder) {
      if (needWrite) {
        return perm === "Read & Write";
      }
      return true;
    }
  }

  return false;
}