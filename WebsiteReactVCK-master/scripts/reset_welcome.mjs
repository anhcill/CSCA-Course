import dotenv from "dotenv";
import pg from "pg";
import path from "path";

dotenv.config({ path: path.resolve("backend", ".env") });

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await client.connect();
  console.log("Connected to database.");

  // Update all users who are students (user) or teachers (creator)
  const res = await client.query(`
    UPDATE users 
    SET welcome_seen_at = NULL 
    WHERE role IN ('user', 'creator')
    RETURNING id, username, email, role, welcome_seen_at
  `);

  console.log(`\nSuccessfully reset welcome screen for ${res.rowCount} users!`);
  console.table(res.rows.map(r => ({
    id: r.id,
    username: r.username,
    email: r.email,
    role: r.role,
    welcome_seen_at: r.welcome_seen_at
  })));

  // Check overall stats
  const stats = await client.query(`
    SELECT role, count(*) as total, count(welcome_seen_at) as seen_count 
    FROM users 
    GROUP BY role
  `);
  console.log("\nCurrent status in database:");
  console.table(stats.rows);

  await client.end();
}

run().catch(err => {
  console.error("Error resetting welcome screen:", err);
  process.exit(1);
});
