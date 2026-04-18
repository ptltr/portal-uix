import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { setTimeout as wait } from "node:timers/promises";
import { spawn } from "node:child_process";

type CliOptions = {
  intervalMs: number;
  messagePrefix: string;
  noVerify: boolean;
};

type CommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

const parseArgs = (): CliOptions => {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    intervalMs: 4000,
    messagePrefix: "chore: auto-commit",
    noVerify: true,
  };

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];

    if (token === "--interval-ms") {
      const raw = args[i + 1];
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed < 500) {
        throw new Error("--interval-ms debe ser un numero >= 500");
      }
      options.intervalMs = parsed;
      i += 1;
      continue;
    }

    if (token === "--message-prefix") {
      const raw = args[i + 1];
      if (!raw || !raw.trim()) {
        throw new Error("--message-prefix requiere un valor no vacio");
      }
      options.messagePrefix = raw.trim();
      i += 1;
      continue;
    }

    if (token === "--verify") {
      options.noVerify = false;
      continue;
    }

    if (token === "--no-verify") {
      options.noVerify = true;
      continue;
    }

    throw new Error(`Argumento no soportado: ${token}`);
  }

  return options;
};

const runGit = async (args: string[], cwd: string): Promise<CommandResult> => {
  return new Promise((resolve) => {
    const child = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
};

const resolveGitRoot = async (): Promise<string> => {
  const result = await runGit(["rev-parse", "--show-toplevel"], process.cwd());
  if (result.code !== 0 || !result.stdout) {
    throw new Error("No se pudo resolver la raiz del repositorio git.");
  }

  return result.stdout;
};

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const isBusyGitState = async (repoRoot: string): Promise<boolean> => {
  const gitDirResult = await runGit(["rev-parse", "--git-dir"], repoRoot);
  if (gitDirResult.code !== 0 || !gitDirResult.stdout) {
    return false;
  }

  const gitDir = gitDirResult.stdout;
  const mergeHead = `${gitDir}/MERGE_HEAD`;
  const rebaseApply = `${gitDir}/rebase-apply`;
  const rebaseMerge = `${gitDir}/rebase-merge`;

  return (await fileExists(mergeHead)) || (await fileExists(rebaseApply)) || (await fileExists(rebaseMerge));
};

const getStatusFingerprint = async (repoRoot: string): Promise<string> => {
  const result = await runGit(["status", "--porcelain"], repoRoot);
  if (result.code !== 0) {
    return "";
  }

  return result.stdout;
};

const getBranchName = async (repoRoot: string): Promise<string> => {
  const result = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], repoRoot);
  if (result.code !== 0 || !result.stdout) {
    return "unknown";
  }

  return result.stdout;
};

const getCommitMessage = (prefix: string, branch: string): string => {
  const now = new Date();
  const stamp = now.toISOString().replace("T", " ").slice(0, 19);
  return `${prefix} (${branch}) ${stamp}`;
};

const hasCommitBody = async (repoRoot: string): Promise<boolean> => {
  const result = await runGit(["diff", "--cached", "--quiet"], repoRoot);
  return result.code === 1;
};

const commitIfNeeded = async (repoRoot: string, options: CliOptions): Promise<void> => {
  if (await isBusyGitState(repoRoot)) {
    return;
  }

  const addResult = await runGit(["add", "-A"], repoRoot);
  if (addResult.code !== 0) {
    if (addResult.stderr) {
      console.error(`[autocommit] git add fallo: ${addResult.stderr}`);
    }
    return;
  }

  const hasChanges = await hasCommitBody(repoRoot);
  if (!hasChanges) {
    return;
  }

  const branch = await getBranchName(repoRoot);
  const message = getCommitMessage(options.messagePrefix, branch);
  const commitArgs = ["commit", "-m", message];
  if (options.noVerify) {
    commitArgs.push("--no-verify");
  }

  const commitResult = await runGit(commitArgs, repoRoot);
  if (commitResult.code !== 0) {
    if (commitResult.stderr) {
      console.error(`[autocommit] git commit fallo: ${commitResult.stderr}`);
    }
    return;
  }

  console.log(`[autocommit] ${message}`);
  if (commitResult.stdout) {
    console.log(commitResult.stdout);
  }
};

const main = async () => {
  const options = parseArgs();
  const repoRoot = await resolveGitRoot();

  console.log(`[autocommit] activo en ${repoRoot}`);
  console.log(`[autocommit] intervalo: ${options.intervalMs}ms`);

  let lastFingerprint = "";

  for (;;) {
    const currentFingerprint = await getStatusFingerprint(repoRoot);

    if (currentFingerprint !== lastFingerprint) {
      lastFingerprint = currentFingerprint;
      if (currentFingerprint) {
        await commitIfNeeded(repoRoot, options);
        lastFingerprint = await getStatusFingerprint(repoRoot);
      }
    }

    await wait(options.intervalMs);
  }
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[autocommit] error: ${message}`);
  process.exit(1);
});
