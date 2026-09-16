import "dotenv/config";
import bcrypt from "bcrypt";
import { pool } from "../src/db/pool.js";

const email = "sarah.chen@tentee.com";
const newPassword = "ChangeMe123!";

const hash = await bcrypt.hash(newPassword, 10);

const result = await pool.query(
  `UPDATE users 
   SET password_hash = $1, must_change_password = false, status = 'Active'
   WHERE email = $2
   RETURNING id, email, role`,
  [hash, email]
);

if (result.rows.length === 0) {
  console.log("Utilisateur non trouvé");
} else {
  console.log("Mot de passe réinitialisé pour", result.rows[0].email);
  console.log("Nouveau mot de passe :", newPassword);
}

await pool.end();