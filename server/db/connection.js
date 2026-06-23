import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store the SQLite database at the root of the project.
// Use a separate database file for test runs.
const dbPath = process.env.SQLITE_DB_PATH ? path.resolve(process.env.SQLITE_DB_PATH) : path.resolve(__dirname, '../../', dbFile);

let databaseInstance = null;

try {
  databaseInstance = new DatabaseSync(dbPath);
} catch (error) {
  console.error("Failed to initialize SQLite DatabaseSync:", error);
  process.exit(1);
}

export const db = databaseInstance;
