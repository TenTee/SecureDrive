import { pool } from "../db/pool.js";

/** Normalise une clé dossier avec / à la fin */
export function asFolderKey(key) {
  if (!key) return key;
  return key.endsWith("/") ? key : `${key}/`;
}

/** Résout le droit le plus spécifique pour un fichier ou dossier partagé. */
export function resolveKeyPermission(fileKey, user, shareRows = []) {
  if (!fileKey || !user) return null;

  if (
    user.role === "Super Admin" ||
    fileKey.startsWith(`uploads/${user.userId}/`) ||
    fileKey.startsWith(`trash/${user.userId}/`)
  ) {
    return "Read & Write";
  }

  const orderedShares = [...shareRows].sort(
    (a, b) => b.file_key.length - a.file_key.length || a.file_key.localeCompare(b.file_key)
  );

  for (const row of orderedShares) {
    const sharedKey = row.file_key;
    const isFolderShare = sharedKey.endsWith("/");
    const matches = fileKey === sharedKey ||
      (isFolderShare && (fileKey === sharedKey.slice(0, -1) || fileKey.startsWith(sharedKey)));

    if (matches) return row.permission || "Read Only";
  }

  return null;
}

export async function getKeyPermission(fileKey, user) {
  if (!fileKey || !user) return null;
  if (
    user.role === "Super Admin" ||
    fileKey.startsWith(`uploads/${user.userId}/`) ||
    fileKey.startsWith(`trash/${user.userId}/`)
  ) {
    return "Read & Write";
  }

  const result = await pool.query(
    `SELECT permission, file_key FROM shares WHERE shared_with_id = $1`,
    [user.userId]
  );
  return resolveKeyPermission(fileKey, user, result.rows);
}

/** needWrite = true → il faut "Read & Write" */
export async function canAccessKey(fileKey, user, { needWrite = false } = {}) {
  const permission = await getKeyPermission(fileKey, user);
  return permission !== null && (!needWrite || permission === "Read & Write");
}