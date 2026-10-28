import { asc, eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import {
  type Actor,
  type DB,
  ForbiddenError,
  isAdmin,
  NotFoundError,
  ValidationError,
} from "./core";
import { OFFICER_SECTIONS, type OfficerSection } from "../vocab";

// Branch officers. The public page reads the current officers, the advisory
// board and the past officers grouped by office; admins maintain every row.

export interface Officer {
  role: string;
  name: string;
  affiliation: string;
  location: string;
  phone?: string;
  email?: string;
}

interface BoardMember {
  name: string;
  institution: string;
}

// A past term. name and term are optional because the record has gaps; the
// page shows a muted placeholder, never a made-up value.
export interface PastOfficer {
  term?: string;
  name?: string;
  institution?: string;
}

export interface PastOfficerTab {
  id: string;
  label: string;
  entries: PastOfficer[];
}

export interface BranchOfficersPage {
  officers: Officer[];
  board: BoardMember[];
  pastTabs: PastOfficerTab[];
}

export interface BranchOfficerInput {
  section: OfficerSection;
  role?: string | null;
  name?: string | null;
  affiliation?: string | null;
  location?: string | null;
  phone?: string | null;
  email?: string | null;
  term?: string | null;
  sortOrder?: number;
}

type Row = typeof schema.branchOfficer.$inferSelect;

const optional = (v: string | null) => v ?? undefined;

function tabId(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Rows in sort order, shaped for the page. Past tabs keep the order their
// offices first appear in.
function toPage(rows: Row[]): BranchOfficersPage {
  const officers: Officer[] = [];
  const board: BoardMember[] = [];
  const tabs = new Map<string, PastOfficerTab>();
  for (const r of rows) {
    if (r.section === "officer") {
      officers.push({
        role: r.role ?? "",
        name: r.name ?? "",
        affiliation: r.affiliation ?? "",
        location: r.location ?? "",
        phone: optional(r.phone),
        email: optional(r.email),
      });
    } else if (r.section === "board") {
      board.push({ name: r.name ?? "", institution: r.affiliation ?? "" });
    } else {
      const label = r.role ?? "";
      let tab = tabs.get(label);
      if (!tab) {
        tab = { id: tabId(label), label, entries: [] };
        tabs.set(label, tab);
      }
      tab.entries.push({
        term: optional(r.term),
        name: optional(r.name),
        institution: optional(r.affiliation),
      });
    }
  }
  return { officers, board, pastTabs: [...tabs.values()] };
}

function clean(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return v.length > 0 ? v : null;
}

function validate(input: BranchOfficerInput) {
  if (!OFFICER_SECTIONS.includes(input.section)) {
    throw new ValidationError("Choose current officer, advisory board or past officer.");
  }
  const values = {
    section: input.section,
    role: clean(input.role),
    name: clean(input.name),
    affiliation: clean(input.affiliation),
    location: clean(input.location),
    phone: clean(input.phone),
    email: clean(input.email),
    term: clean(input.term),
    sortOrder: input.sortOrder ?? 0,
  };
  if (values.section !== "past" && !values.name) {
    throw new ValidationError("Name is required.");
  }
  if (values.section !== "board" && !values.role) {
    throw new ValidationError("Office is required.");
  }
  return values;
}

export function createBranchOfficers(db: DB) {
  function listRows() {
    return db
      .select()
      .from(schema.branchOfficer)
      .orderBy(asc(schema.branchOfficer.sortOrder), asc(schema.branchOfficer.name));
  }

  return {
    // Public.
    async getPage(): Promise<BranchOfficersPage> {
      return toPage(await listRows());
    },

    async listAll(actor: Actor) {
      if (!isAdmin(actor)) throw new ForbiddenError();
      return listRows();
    },

    async create(actor: Actor, input: BranchOfficerInput) {
      if (!isAdmin(actor)) throw new ForbiddenError();
      const [created] = await db
        .insert(schema.branchOfficer)
        .values(validate(input))
        .returning();
      return created;
    },

    async update(actor: Actor, id: string, input: BranchOfficerInput) {
      if (!isAdmin(actor)) throw new ForbiddenError();
      const [updated] = await db
        .update(schema.branchOfficer)
        .set(validate(input))
        .where(eq(schema.branchOfficer.id, id))
        .returning();
      if (!updated) throw new NotFoundError();
      return updated;
    },

    async remove(actor: Actor, id: string) {
      if (!isAdmin(actor)) throw new ForbiddenError();
      await db
        .delete(schema.branchOfficer)
        .where(eq(schema.branchOfficer.id, id));
      return { id };
    },
  };
}
