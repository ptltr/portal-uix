import { Router, type IRouter } from "express";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
//import pg from "pg";

interface SessionMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
}

interface SessionSignals {
  strengths: Record<string, number>;
  opportunities: Record<string, number>;
}

interface ChatSessionPayload {
  conversationId: number | null;
  messages: SessionMessage[];
  isEvaluationComplete: boolean;
  employeeName: string;
  employeeEmail: string;
  currentStep: number;
  finalReport: string;
  followUpCount: number;
  isInFollowUp: boolean;
  signals: SessionSignals;
  updatedAt: number;
}

const router: IRouter = Router();
const sessionsByEmail = new Map<string, ChatSessionPayload>();
let loadedFromDisk = false;
let persistQueue: Promise<void> = Promise.resolve();
let dbReady = false;

const usingDatabasePersistence = Boolean(process.env.DATABASE_URL);
const dbPool = usingDatabasePersistence
 // ? new pg.Pool({ connectionString: process.env.DATABASE_URL })
  : null;

const normalizeEmail = (value: string): string => value.trim().toLowerCase();

const isValidEmail = (value: string): boolean => {
  return /\S+@\S+\.\S+/.test(value.trim());
};

const getSessionStorePath = (): string => {
  const fromEnv = process.env.CHAT_SESSIONS_FILE?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  return path.resolve(process.cwd(), ".cache", "chat-sessions.json");
};

const getSerializedSessions = (): Record<string, ChatSessionPayload> => {
  const data: Record<string, ChatSessionPayload> = {};
  for (const [email, session] of sessionsByEmail.entries()) {
    data[email] = session;
  }
  return data;
};

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const sanitizeSessionPayload = (raw: unknown, email: string): ChatSessionPayload | null => {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;

  const messages = Array.isArray(data.messages)
    ? data.messages
        .filter((item) => item && typeof item === "object")
        .map((item) => {
          const message = item as Record<string, unknown>;
          const role =
            message.role === "user" || message.role === "assistant" || message.role === "system"
              ? message.role
              : "assistant";

          return {
            id: String(message.id || `msg-${Date.now()}`),
            role,
            content: String(message.content || ""),
          };
        })
    : [];

  const strengthsRaw = (data.signals as Record<string, unknown> | undefined)?.strengths;
  const opportunitiesRaw = (data.signals as Record<string, unknown> | undefined)?.opportunities;

  const strengths: Record<string, number> = {};
  if (strengthsRaw && typeof strengthsRaw === "object") {
    for (const [key, value] of Object.entries(strengthsRaw)) {
      strengths[key] = toNumber(value, 0);
    }
  }

  const opportunities: Record<string, number> = {};
  if (opportunitiesRaw && typeof opportunitiesRaw === "object") {
    for (const [key, value] of Object.entries(opportunitiesRaw)) {
      opportunities[key] = toNumber(value, 0);
    }
  }

  return {
    conversationId: typeof data.conversationId === "number" ? data.conversationId : null,
    messages,
    isEvaluationComplete: Boolean(data.isEvaluationComplete),
    employeeName: String(data.employeeName || ""),
    employeeEmail: email,
    currentStep: toNumber(data.currentStep, 0),
    finalReport: String(data.finalReport || ""),
    followUpCount: toNumber(data.followUpCount, 0),
    isInFollowUp: Boolean(data.isInFollowUp),
    signals: {
      strengths,
      opportunities,
    },
    updatedAt: toNumber(data.updatedAt, Date.now()),
  };
};

const ensureDatabaseReady = async (): Promise<void> => {
  if (!usingDatabasePersistence || !dbPool || dbReady) return;

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      email TEXT PRIMARY KEY,
      session JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  dbReady = true;
};

const loadSessionFromDatabase = async (email: string): Promise<ChatSessionPayload | null> => {
  if (!usingDatabasePersistence || !dbPool) return null;

  await ensureDatabaseReady();

  const result = await dbPool.query<{ session: unknown }>(
    "SELECT session FROM chat_sessions WHERE email = $1 LIMIT 1",
    [email],
  );

  if (!result.rowCount) return null;

  return sanitizeSessionPayload(result.rows[0]?.session, email);
};

const saveSessionToDatabase = async (email: string, session: ChatSessionPayload): Promise<void> => {
  if (!usingDatabasePersistence || !dbPool) return;

  await ensureDatabaseReady();

  await dbPool.query(
    `
      INSERT INTO chat_sessions (email, session, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (email)
      DO UPDATE SET session = EXCLUDED.session, updated_at = NOW()
    `,
    [email, JSON.stringify(session)],
  );
};

const ensureLoadedFromDisk = async (): Promise<void> => {
  if (usingDatabasePersistence) return;
  if (loadedFromDisk) return;

  const storePath = getSessionStorePath();

  try {
    const raw = await readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    for (const [emailKey, sessionData] of Object.entries(parsed)) {
      const email = normalizeEmail(emailKey);
      if (!isValidEmail(email)) continue;

      const sanitized = sanitizeSessionPayload(sessionData, email);
      if (!sanitized) continue;

      sessionsByEmail.set(email, sanitized);
    }
  } catch {
    // If the file does not exist or cannot be parsed, continue with an empty store.
  } finally {
    loadedFromDisk = true;
  }
};

const persistSessionsToDisk = async (): Promise<void> => {
  if (usingDatabasePersistence) return;
  const storePath = getSessionStorePath();
  const dirPath = path.dirname(storePath);
  const tempPath = `${storePath}.tmp`;

  await mkdir(dirPath, { recursive: true });
  await writeFile(tempPath, JSON.stringify(getSerializedSessions(), null, 2), "utf8");
  await rename(tempPath, storePath);
};

const queuePersist = async (): Promise<void> => {
  persistQueue = persistQueue.catch(() => undefined).then(() => persistSessionsToDisk());
  await persistQueue;
};

router.get("/chat-sessions/:email", async (req, res) => {
  const email = normalizeEmail(req.params.email || "");

  if (!isValidEmail(email)) {
    res.status(400).json({ message: "Valid email is required" });
    return;
  }

  let session: ChatSessionPayload | null = null;

  if (usingDatabasePersistence) {
    session = await loadSessionFromDatabase(email);
  } else {
    await ensureLoadedFromDisk();
    session = sessionsByEmail.get(email) || null;
  }

  if (!session) {
    res.status(404).json({ message: "Session not found" });
    return;
  }

  res.status(200).json(session);
});

router.put("/chat-sessions/:email", async (req, res) => {
  const email = normalizeEmail(req.params.email || "");

  if (!isValidEmail(email)) {
    res.status(400).json({ message: "Valid email is required" });
    return;
  }

  if (!usingDatabasePersistence) {
    await ensureLoadedFromDisk();
  }

  const sanitized = sanitizeSessionPayload(req.body, email);
  if (!sanitized) {
    res.status(400).json({ message: "Invalid session payload" });
    return;
  }

  const sessionToStore: ChatSessionPayload = {
    ...sanitized,
    updatedAt: Date.now(),
  };

  try {
    if (usingDatabasePersistence) {
      await saveSessionToDatabase(email, sessionToStore);
    } else {
      sessionsByEmail.set(email, sessionToStore);
      await queuePersist();
    }

    res.status(200).json({ saved: true, updatedAt: sessionToStore.updatedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown persistence error";
    res.status(500).json({ message: `Failed to persist session: ${message}` });
  }
});

export default router;