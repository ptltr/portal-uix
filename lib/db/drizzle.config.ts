import { defineConfig } from "drizzle-kit";
import path from "path";

const isProduction = process.env.NODE_ENV === "production";

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: isProduction ? "postgresql" : "sqlite",
  dbCredentials: {
    url: isProduction ? (process.env.DATABASE_URL || "") : ":memory:",
  },
});
