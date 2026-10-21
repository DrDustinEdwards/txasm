import { and, eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import type { DrizzleD1Database } from "drizzle-orm/d1";

// This file is the only place allowed to import ./schema and the Drizzle client.
// Enforce with an eslint no-restricted-imports rule on every other module so
// nothing queries Drizzle directly outside this layer.

export type DB = DrizzleD1Database<typeof schema>;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ForbiddenError extends Error {
  constructor(message = "forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class DeadlinePassedError extends Error {
  constructor(message = "deadline passed") {
    super(message);
    this.name = "DeadlinePassedError";
  }
}

export class ConflictOfInterestError extends Error {
  constructor(message = "reviewer has a conflict of interest") {
    super(message);
    this.name = "ConflictOfInterestError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends Error {
  constructor(message = "invalid input") {
    super(message);
    this.name = "ValidationError";
  }
}

export class AlreadyExistsError extends Error {
  constructor(message = "already exists") {
    super(message);
    this.name = "AlreadyExistsError";
  }
}

// ---------------------------------------------------------------------------
// Actor and authorization helpers. Grants are loaded once per request.
// author and attendee are not roles; they are derived from ownership and a paid
// registration, checked inline where they matter.
// ---------------------------------------------------------------------------

type Role = "admin" | "chair" | "reviewer";

interface Grant {
  role: Role;
  editionId: string | null; // null = platform-wide
}

export interface Actor {
  userId: string;
  grants: Grant[];
}

export async function loadActor(db: DB, userId: string): Promise<Actor> {
  const rows = await db
    .select({ role: schema.roleGrant.role, editionId: schema.roleGrant.editionId })
    .from(schema.roleGrant)
    .where(
      and(
        eq(schema.roleGrant.userId, userId),
        eq(schema.roleGrant.status, "active"),
      ),
    );
  return { userId, grants: rows as Grant[] };
}

export function isAdmin(actor: Actor): boolean {
  return actor.grants.some((g) => g.role === "admin" && g.editionId === null);
}

export function isChair(actor: Actor, editionId: string): boolean {
  return (
    isAdmin(actor) ||
    actor.grants.some((g) => g.role === "chair" && g.editionId === editionId)
  );
}

export function isReviewer(actor: Actor, editionId: string): boolean {
  return actor.grants.some(
    (g) => g.role === "reviewer" && g.editionId === editionId,
  );
}

// True when the actor holds a reviewer grant in any edition. Used only to decide
// whether to show the Review link in the header; per-edition access is still
// checked with isReviewer everywhere it matters.
export function isReviewerAnywhere(actor: Actor): boolean {
  return actor.grants.some((g) => g.role === "reviewer");
}

// A single-column `IN (...)` list must stay under D1's bound-parameter cap, so
// id lists longer than this are queried in batches (see chunk() below, defined
// alongside D1_MAX_BOUND_PARAMS).
export const ID_CHUNK_SIZE = 90;

// D1 rejects a query with more than 100 bound parameters ("too many SQL
// variables"), so a batched insert of many rows must be split. A row binds one
// parameter per column, so the safe batch size is the parameter budget divided
// by the column count. The margin keeps a little headroom under the cap.
const D1_MAX_BOUND_PARAMS = 100;

export function insertChunkSize(columnsPerRow: number): number {
  return Math.max(1, Math.floor((D1_MAX_BOUND_PARAMS - 10) / columnsPerRow));
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

// Split an array into fixed-size chunks, to keep bulk inserts under SQLite's
// bound-parameter ceiling.
export function chunkList<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
