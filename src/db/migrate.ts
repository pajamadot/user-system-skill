/**
 * Run all SQL migrations in order.
 * Usage: npx tsx src/db/migrate.ts
 */
import { runMigrations } from "./client";

runMigrations()
  .then(() => {
    console.log("Migrations complete.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
