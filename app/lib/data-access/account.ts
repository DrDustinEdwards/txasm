import { and, count, eq, getTableColumns } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import * as schema from "../../db/schema";
import type { DB } from "./core";

// What deleting a person does. The sign-in side goes: sessions, passkeys, linked
// accounts and the user row itself, with the email and name. What the person put
// into a Meeting stays, because abstracts, reviews, registrations and the work done
// for a meeting belong to that meeting and its archive (CLAUDE.md hard rule 2): the
// abstract with its author line as typed, the scores, the payment row. Each of those
// rows is handed to a "Deleted account" user made for the person (handOverRecords),
// so nothing is orphaned and no foreign key breaks. An active admin, chair or
// reviewer grant still blocks deletion: someone who runs a meeting hands that over
// first.

// Every column that refers to user.id without a cascade. tests/authorization.test.ts
// checks this against the real foreign keys, so a new reference cannot be missed.
export const ACCOUNT_REFERENCES: ReadonlyArray<[SQLiteTable, SQLiteColumn]> = [
  [schema.registration, schema.registration.userId],
  [schema.abstract, schema.abstract.submitterId],
  [schema.author, schema.author.userId],
  [schema.abstractFile, schema.abstractFile.uploadedById],
  [schema.reviewAssignment, schema.reviewAssignment.reviewerId],
  [schema.reviewConflict, schema.reviewConflict.reviewerId],
  [schema.review, schema.review.reviewerId],
  [schema.roleGrant, schema.roleGrant.grantedById],
  [schema.invitation, schema.invitation.invitedById],
  [schema.invitation, schema.invitation.acceptedUserId],
  [schema.reviewAssignment, schema.reviewAssignment.assignedById],
  [schema.reviewConflict, schema.reviewConflict.declaredById],
  [schema.decision, schema.decision.decidedById],
  [schema.document, schema.document.generatedById],
  [schema.abstractBook, schema.abstractBook.generatedById],
];

export function createAccount(db: DB) {
  return {
    // Whether the user holds an active admin, chair or reviewer grant, which they hand
    // over before deleting: empty when the account can be deleted.
    async deletionBlockers(userId: string): Promise<Array<"role">> {
      const [{ n }] = await db
        .select({ n: count() })
        .from(schema.roleGrant)
        .where(and(eq(schema.roleGrant.userId, userId), eq(schema.roleGrant.status, "active")));
      return n > 0 ? ["role"] : [];
    },

    // Run just before the user row is deleted. Makes the "Deleted account" user for this
    // person (kept if a first attempt got this far), clears the contact email on their
    // author rows (the name on the abstract stays), and points every record at the new
    // user in one batch. Per person, because a meeting allows one registration per user.
    async handOverRecords(userId: string): Promise<void> {
      const heir = `deleted-${userId}`;
      const repoint = ACCOUNT_REFERENCES.map(([table, column]) => {
        const key = Object.entries(getTableColumns(table)).find(([, c]) => c === column)?.[0];
        if (!key) throw new Error(`no column ${column.name} in its table`);
        return db.update(table).set({ [key]: heir } as never).where(eq(column, userId));
      });
      await db.batch([
        db
          .insert(schema.user)
          .values({ id: heir, name: "Deleted account", email: `${heir}@deleted.invalid` })
          .onConflictDoNothing(),
        db.update(schema.author).set({ email: null }).where(eq(schema.author.userId, userId)),
        ...repoint,
      ]);
    },
  };
}
