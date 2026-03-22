import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

export const sql = postgres(DATABASE_URL, {
  max: 20,
  idle_timeout: 20,
  connect_timeout: 10,
  transform: { undefined: null },
});

export async function runMigrations() {
  const fs = await import("fs");
  const path = await import("path");

  const thisDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
  const schemaDir = path.resolve(thisDir, "../../schema");
  const files = fs.readdirSync(schemaDir).filter((f: string) => f.endsWith(".sql")).sort();

  for (const file of files) {
    const content = fs.readFileSync(path.join(schemaDir, file), "utf-8");
    console.log(`Running migration: ${file}`);
    await sql.unsafe(content);
  }
  console.log("All migrations complete.");
}
