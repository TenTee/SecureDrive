// Run once with: node src/db/seed.js
// Safe to re-run: it skips any email that already exists.
import "dotenv/config";
import bcrypt from "bcrypt";
import { pool } from "./pool.js";

// Every seeded account gets this same temporary password to start.
// must_change_password = true forces them to set a real one on first login.
const TEMP_PASSWORD = "ChangeMe123!";

const usersToSeed = [
  { firstName: "Sarah", lastName: "Chen", email: "sarah.chen@tentee.com", role: "Super Admin", employeeId: "EMP-1", department: "IT Administration" },
  { firstName: "Marc", lastName: "Andreessen", email: "marc@tentee.com", role: "Manager", employeeId: "EMP-2", department: "Operations" },
  { firstName: "James", lastName: "Okafor", email: "j.okafor@tentee.com", role: "User", employeeId: "EMP-3", department: "Engineering" },
  { firstName: "Léa", lastName: "Dupont", email: "lea.dupont@tentee.com", role: "Editor", employeeId: "EMP-4", department: "Design" },
  { firstName: "Priya", lastName: "Sharma", email: "p.sharma@tentee.com", role: "User", employeeId: "EMP-5", department: "Marketing" },
  { firstName: "Daniel", lastName: "Müller", email: "d.muller@tentee.com", role: "Editor", employeeId: "EMP-6", department: "Design" },
];

async function seed() {
  const passwordHash = await bcrypt.hash(TEMP_PASSWORD, 10);

  for (const u of usersToSeed) {
    const result = await pool.query(
      `INSERT INTO users (first_name, last_name, email, password_hash, role, employee_id, department)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (email) DO NOTHING
       RETURNING id, email`,
      [u.firstName, u.lastName, u.email, passwordHash, u.role, u.employeeId, u.department]
    );

    if (result.rows.length > 0) {
      console.log(`Created: ${u.email} (${u.role})`);
    } else {
      console.log(`Skipped (already exists): ${u.email}`);
    }
  }

  console.log(`\nDone. Temporary password for all seeded users: ${TEMP_PASSWORD}`);
  await pool.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
