import { drizzle } from "drizzle-orm/d1";
import type { BatchItem } from "drizzle-orm/batch";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDatabase>;
export type DatabaseInput = Database | D1Database;

/**
 * Creates a request-scoped Drizzle client around the Workers D1 binding.
 *
 * Keep this factory cheap and stateless: Workers may reuse a module between
 * requests, while the binding/session belongs to the current request context.
 */
export function createDatabase(binding: D1Database) {
  return drizzle(binding, { schema });
}

export function useDatabase(input: DatabaseInput): Database {
  return "$client" in input ? input : createDatabase(input);
}

export async function runBatch(
  db: Database,
  statements: BatchItem<"sqlite">[],
): Promise<void> {
  const [first, ...rest] = statements;
  if (!first) return;
  await db.batch([first, ...rest]);
}
