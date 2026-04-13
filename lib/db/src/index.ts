import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;
const isProduction = process.env.NODE_ENV === "production";

// For development, use a mock database that doesn't require external dependencies
let db;
if (isProduction) {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzle(pool, { schema });
} else {
  // Mock database for development - just enough to make the app work
  const mockDb = {
    select: () => ({
      from: () => ({
        orderBy: () => [],
        where: () => ({})
      })
    }),
    insert: () => ({
      values: () => ({
        returning: () => [{}]
      })
    }),
    delete: () => ({
      where: () => {}
    })
  };
  db = mockDb as any;
}

export { db };
export * from "./schema";
