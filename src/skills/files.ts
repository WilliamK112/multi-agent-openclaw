import fs from "node:fs/promises";
import path from "node:path";

export type FileReadResult = { ok: boolean; path: string; content?: string; error?: string };
export type FileWriteResult = { ok: boolean; path: string; bytes?: number; error?: string };

function resolveSafe(projectRoot: string, targetPath: string): string {
  const absRoot = path.resolve(projectRoot);
  const absTarget = path.resolve(absRoot, targetPath);
  if (!absTarget.startsWith(absRoot + path.sep) && absTarget !== absRoot) {
    throw new Error(`Path escapes project root: ${targetPath}`);
  }
  return absTarget;
}

export async function fileRead(projectRoot: string, targetPath: string): Promise<FileReadResult> {
  try {
    const abs = resolveSafe(projectRoot, targetPath);
    const content = await fs.readFile(abs, "utf8");
    return { ok: true, path: abs, content };
  } catch (err) {
    return { ok: false, path: targetPath, error: (err as Error).message };
  }
}

export async function fileWrite(projectRoot: string, targetPath: string, content: string): Promise<FileWriteResult> {
  try {
    const abs = resolveSafe(projectRoot, targetPath);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, "utf8");
    return { ok: true, path: abs, bytes: Buffer.byteLength(content, "utf8") };
  } catch (err) {
    return { ok: false, path: targetPath, error: (err as Error).message };
  }
}
