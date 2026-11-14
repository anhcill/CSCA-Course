import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { upsertManualCourseMapping } from "../services/externalCourseMapping.service.js";

/**
 * Explicitly applies operator-verified manual course mappings from a JSON array file.
 * Never infers mappings by course title or slug.
 */
export const applyManualMappingsFromList = async (db, entries = []) => {
  if (!Array.isArray(entries)) {
    throw new Error("Mapping file must contain a JSON array of manual mapping definitions.");
  }
  const results = [];
  for (const entry of entries) {
    results.push(await upsertManualCourseMapping(db, entry));
  }
  return results;
};

const runCli = async () => {
  const fileIndex = process.argv.indexOf("--file");
  const filePath = fileIndex >= 0 ? process.argv[fileIndex + 1] : "";
  if (!filePath) {
    throw new Error("Usage: node backend/scripts/seed_manual_course_mappings.js --file <mappings.json>");
  }
  const resolved = path.resolve(process.cwd(), filePath);
  const raw = fs.readFileSync(resolved, "utf8");
  const parsed = JSON.parse(raw);
  const targetUrl = process.env.COURSE_INTEGRATION_DATABASE_URL;
  if (!targetUrl) throw new Error("Set COURSE_INTEGRATION_DATABASE_URL to the intended database.");
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: targetUrl, connectionTimeoutMillis: 10000 });
  try {
    const saved = await applyManualMappingsFromList({
      query: (text, values) => pool.query(text, values),
      getClient: () => pool.connect(),
    }, parsed);
    console.log(JSON.stringify({ applied: saved.length, mappings: saved }, null, 2));
  } finally {
    await pool.end();
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error("[seed_manual_course_mappings] Failed:", error.message);
    process.exitCode = 1;
  });
}
