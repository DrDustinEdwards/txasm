import { logEvent, OWASP_EVENTS } from "@dustinedwards/site-runtime/log";
import { and, eq, inArray } from "drizzle-orm";
import * as schema from "../../db/schema";
import type { DrizzleD1Database } from "drizzle-orm/d1";

// This file is the only place allowed to import ./schema and the Drizzle client.
// Enforce with an Oxlint no-restricted-imports rule on every other module so
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

// Every refusal of a field that does not parse or is out of bounds is one of these, so each writes one
// `input_validation_fail` line (OWASP's name, site-runtime ./log) as it is made: the words the user is shown, scrubbed
// and cut, never more of the request.
export class ValidationError extends Error {
  constructor(message = "invalid input") {
    super(message);
    this.name = "ValidationError";
    logEvent(
      OWASP_EVENTS.inputValidationFailure,
      { reason: message.slice(0, 120) },
      { level: "warn" },
    );
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

// `admin` comes from the env's admin list (getActor in ../data-access.ts), never
// from D1: role_grant rows with role "admin", seeded once at sign-up before
// 2026-10-31, are read past, so taking an address off the list ends its admin.
export async function loadActor(
  db: DB,
  userId: string,
  { admin }: { admin: boolean },
): Promise<Actor> {
  const rows = await db
    .select({ role: schema.roleGrant.role, editionId: schema.roleGrant.editionId })
    .from(schema.roleGrant)
    .where(
      and(
        eq(schema.roleGrant.userId, userId),
        eq(schema.roleGrant.status, "active"),
        inArray(schema.roleGrant.role, ["chair", "reviewer"]),
      ),
    );
  const grants = rows as Grant[];
  return { userId, grants: admin ? [{ role: "admin", editionId: null }, ...grants] : grants };
}

export function isAdmin(actor: Actor): boolean {
  return actor.grants.some((g) => g.role === "admin" && g.editionId === null);
}

export function isChair(actor: Actor, editionId: string): boolean {
  return (
    isAdmin(actor) || actor.grants.some((g) => g.role === "chair" && g.editionId === editionId)
  );
}

export function isReviewer(actor: Actor, editionId: string): boolean {
  return actor.grants.some((g) => g.role === "reviewer" && g.editionId === editionId);
}

// True when the actor holds a reviewer grant in any edition. Used only to decide
// whether to show the Review link in the header; per-edition access is still
// checked with isReviewer everywhere it matters.
export function isReviewerAnywhere(actor: Actor): boolean {
  return actor.grants.some((g) => g.role === "reviewer");
}
