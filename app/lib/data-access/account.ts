import { and, count, eq, type SQL } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import * as schema from "../../db/schema";
import type { DB } from "./core";

// What a person's own account deletion would take with it. Abstracts, reviews,
// registrations and the work done for a meeting belong to that meeting and its
// archive (CLAUDE.md hard rule 2), and every row below refers to the account
// without a cascade, so D1 refuses the delete while one exists. Until Dustin
// decides what deleting a person does to those rows, an account that holds any
// of them is not deleted here: the page says which kinds, and the person writes
// to the branch. The sign-in rows (sessions, passkeys, linked accounts) and
// revoked grants go with the account.

export type AccountRecordKind = "role" | "registration" | "abstract" | "review" | "work";

// Every column that refers to user.id without a cascade, and the kind each is
// told as. tests/authorization.test.ts checks this against the real foreign keys,
// so a new reference cannot be missed.
export const ACCOUNT_REFERENCES: ReadonlyArray<[SQLiteTable, SQLiteColumn, AccountRecordKind]> = [
  [schema.registration, schema.registration.userId, "registration"],
  [schema.abstract, schema.abstract.submitterId, "abstract"],
  [schema.author, schema.author.userId, "abstract"],
  [schema.abstractFile, schema.abstractFile.uploadedById, "abstract"],
  [schema.reviewAssignment, schema.reviewAssignment.reviewerId, "review"],
  [schema.reviewConflict, schema.reviewConflict.reviewerId, "review"],
  [schema.review, schema.review.reviewerId, "review"],
  [schema.roleGrant, schema.roleGrant.grantedById, "work"],
  [schema.invitation, schema.invitation.invitedById, "work"],
  [schema.invitation, schema.invitation.acceptedUserId, "work"],
  [schema.reviewAssignment, schema.reviewAssignment.assignedById, "work"],
  [schema.reviewConflict, schema.reviewConflict.declaredById, "work"],
  [schema.decision, schema.decision.decidedById, "work"],
  [schema.document, schema.document.generatedById, "work"],
  [schema.abstractBook, schema.abstractBook.generatedById, "work"],
];

export function createAccount(db: DB) {
  return {
    // The kinds of meeting records the user's account holds, in a fixed order;
    // empty when the account can be deleted. An active admin, chair or reviewer
    // grant counts too: someone who runs a meeting hands that over first. One
    // round trip: every count goes in one batch.
    async deletionBlockers(userId: string): Promise<AccountRecordKind[]> {
      const counted = (table: SQLiteTable, where: SQL | undefined) =>
        db.select({ n: count() }).from(table).where(where);
      const [grants, ...references] = await db.batch([
        counted(schema.roleGrant, and(eq(schema.roleGrant.userId, userId), eq(schema.roleGrant.status, "active"))),
        ...ACCOUNT_REFERENCES.map(([table, column]) => counted(table, eq(column, userId))),
      ]);
      const found = new Set<AccountRecordKind>();
      if ((grants[0]?.n ?? 0) > 0) found.add("role");
      references.forEach((rows, i) => {
        if ((rows[0]?.n ?? 0) > 0) found.add(ACCOUNT_REFERENCES[i][2]);
      });
      return (["role", "registration", "abstract", "review", "work"] as const).filter((kind) => found.has(kind));
    },
  };
}
