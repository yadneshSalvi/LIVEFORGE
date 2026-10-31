import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { HttpError } from "./errors";

type Envelope<T> = { revision: number; value: T };
export interface DocumentStore {
  get<T>(id: string): Promise<T | null>;
  create<T>(id: string, value: T): Promise<boolean>;
  update<T, R>(id: string, change: (value: T) => R): Promise<R>;
}
function serialize(value: unknown) {
  const result = JSON.stringify(value);
  if (Buffer.byteLength(result) > 2_000_000)
    throw new HttpError(
      413,
      "storage_budget",
      "Show storage budget reached; create a new show.",
    );
  return result;
}
export class PostgresStore implements DocumentStore {
  private sql;
  private initialized?: Promise<unknown>;
  constructor(url: string) {
    this.sql = neon(url);
  }
  private async ready() {
    this.initialized ??= this
      .sql`CREATE TABLE IF NOT EXISTS liveforge_documents (id text PRIMARY KEY, revision bigint NOT NULL DEFAULT 1, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`.catch(
      (error) => {
        this.initialized = undefined;
        throw error;
      },
    );
    await this.initialized;
  }
  private async envelope<T>(id: string): Promise<Envelope<T> | null> {
    await this.ready();
    const rows = await this
      .sql`SELECT revision, value FROM liveforge_documents WHERE id = ${id}`;
    return rows.length
      ? { revision: Number(rows[0].revision), value: rows[0].value as T }
      : null;
  }
  async get<T>(id: string) {
    return (await this.envelope<T>(id))?.value ?? null;
  }
  async create<T>(id: string, value: T) {
    await this.ready();
    const rows = await this
      .sql`INSERT INTO liveforge_documents (id, value) VALUES (${id}, ${serialize(value)}::jsonb) ON CONFLICT DO NOTHING RETURNING id`;
    return rows.length === 1;
  }
  async update<T, R>(id: string, change: (value: T) => R): Promise<R> {
    for (let retry = 0; retry < 15; retry++) {
      const record = await this.envelope<T>(id);
      if (!record) throw new HttpError(404, "not_found", "Record not found.");
      // The synchronous pure callback can be replayed after a competing writer wins.
      const result = change(record.value);
      const rows = await this
        .sql`UPDATE liveforge_documents SET value = ${serialize(record.value)}::jsonb, revision = revision + 1, updated_at = now() WHERE id = ${id} AND revision = ${record.revision} RETURNING id`;
      if (rows.length) return result;
    }
    throw new HttpError(
      409,
      "concurrent_update",
      "The show changed concurrently; retry the command.",
    );
  }
}
/** Development only. Cross-process lock plus atomic rename; never a production fallback. */
export class LocalFileStore implements DocumentStore {
  constructor(private directory: string) {}
  private filename(id: string) {
    return path.join(
      this.directory,
      Buffer.from(id).toString("base64url") + ".json",
    );
  }
  private async locked<R>(fn: () => Promise<R>): Promise<R> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const lock = path.join(this.directory, ".lock");
    for (let tries = 0; ; tries++) {
      try {
        await mkdir(lock);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (tries > 100)
          throw new HttpError(
            503,
            "local_store_locked",
            "Local store is busy. Remove .local/store/.lock only after stopping all servers if a prior process crashed.",
          );
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }
    try {
      return await fn();
    } finally {
      await rm(lock, { recursive: true, force: true });
    }
  }
  async get<T>(id: string): Promise<T | null> {
    try {
      return JSON.parse(await readFile(this.filename(id), "utf8")) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
  private async put(id: string, value: unknown) {
    const temporary = this.filename(id) + "." + randomUUID();
    await writeFile(temporary, serialize(value), { mode: 0o600 });
    await rename(temporary, this.filename(id));
  }
  async create<T>(id: string, value: T) {
    return this.locked(async () => {
      if (await this.get(id)) return false;
      await this.put(id, value);
      return true;
    });
  }
  async update<T, R>(id: string, change: (value: T) => R): Promise<R> {
    return this.locked(async () => {
      const value = await this.get<T>(id);
      if (!value) throw new HttpError(404, "not_found", "Record not found.");
      const result = change(value);
      await this.put(id, value);
      return result;
    });
  }
}
let singleton: DocumentStore | undefined;
export function getStore(): DocumentStore {
  if (singleton) return singleton;
  if (process.env.DATABASE_URL)
    return (singleton = new PostgresStore(process.env.DATABASE_URL));
  if (process.env.NODE_ENV === "production" || process.env.VERCEL)
    throw new HttpError(
      503,
      "database_unavailable",
      "A durable database must be configured.",
    );
  return (singleton = new LocalFileStore(
    path.join(process.cwd(), ".local", "store"),
  ));
}
