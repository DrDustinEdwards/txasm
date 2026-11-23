import { and, asc, eq, inArray } from "drizzle-orm";
import * as schema from "../../db/schema";
import {
  type Actor,
  type DB,
  ForbiddenError,
  isAdmin,
  NotFoundError,
  ValidationError,
} from "./core";

export type GrantableRole = "chair" | "reviewer";

export interface RoleGrantInput {
  editionId: string;
  email: string;
  role: GrantableRole;
}

export interface RoleRevokeInput {
  editionId: string;
  userId: string;
  role: GrantableRole;
}

// Roles: admins grant and revoke chair and reviewer per meeting. admin itself
// is not grantable here; it is the ADMIN_EMAIL and CO_OWNER_EMAILS roster (getActor). Accounts are created
// on first sign-in, so a grant needs the person to have signed in once.
export function createRoles(db: DB) {
  return {
    async listForEdition(actor: Actor, editionId: string) {
      if (!isAdmin(actor)) throw new ForbiddenError();
      return db
        .select({
          userId: schema.roleGrant.userId,
          role: schema.roleGrant.role,
          name: schema.user.name,
          email: schema.user.email,
          createdAt: schema.roleGrant.createdAt,
        })
        .from(schema.roleGrant)
        .innerJoin(schema.user, eq(schema.roleGrant.userId, schema.user.id))
        .where(
          and(
            eq(schema.roleGrant.editionId, editionId),
            eq(schema.roleGrant.status, "active"),
            inArray(schema.roleGrant.role, ["chair", "reviewer"]),
          ),
        )
        .orderBy(asc(schema.roleGrant.role), asc(schema.user.email));
    },

    async grant(actor: Actor, input: RoleGrantInput) {
      if (!isAdmin(actor)) throw new ForbiddenError();
      if (input.role !== "chair" && input.role !== "reviewer") {
        throw new ValidationError("Role must be chair or reviewer.");
      }
      const email = input.email.trim().toLowerCase();
      if (!email) throw new ValidationError("Enter an email address.");

      const person = await db.query.user.findFirst({
        where: eq(schema.user.email, email),
      });
      if (!person) {
        throw new NotFoundError(
          "No account with that email yet. Ask the person to sign in once first, then grant the role.",
        );
      }

      await db
        .insert(schema.roleGrant)
        .values({
          userId: person.id,
          role: input.role,
          editionId: input.editionId,
          grantedById: actor.userId,
        })
        .onConflictDoUpdate({
          target: [schema.roleGrant.userId, schema.roleGrant.role, schema.roleGrant.editionId],
          set: { status: "active", grantedById: actor.userId },
        });

      return { userId: person.id, role: input.role };
    },

    // Delete the grant rather than mark it revoked, so a later grant of the same
    // role reinstates cleanly (a legacy revoked row is made active again). admin grants are never
    // touched here: role is constrained to chair or reviewer and the delete is
    // scoped to a single edition.
    async revoke(actor: Actor, input: RoleRevokeInput) {
      if (!isAdmin(actor)) throw new ForbiddenError();
      if (input.role !== "chair" && input.role !== "reviewer") {
        throw new ValidationError("Role must be chair or reviewer.");
      }
      await db
        .delete(schema.roleGrant)
        .where(
          and(
            eq(schema.roleGrant.userId, input.userId),
            eq(schema.roleGrant.role, input.role),
            eq(schema.roleGrant.editionId, input.editionId),
          ),
        );
      return { userId: input.userId, role: input.role };
    },
  };
}
