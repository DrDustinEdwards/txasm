// The data-access layer is the security boundary (CLAUDE.md hard rule 1). Only
// this file and the modules under ./data-access/ may import ./schema and the
// Drizzle client; an eslint no-restricted-imports rule enforces it for every other
// module, so nothing queries Drizzle directly outside this layer. Each module
// under ./data-access/ builds one area from the shared db handle; this file
// assembles them and is the only entry point the rest of the app imports.
import { getDb } from "../db/index.server";
import { type Actor, type DB, loadActor } from "./data-access/core";
import { createAbstracts } from "./data-access/abstracts";
import { createReviews, createRoles } from "./data-access/reviews";
import { createDecisions } from "./data-access/decisions";
import { createBooks } from "./data-access/books";
import { createProgram, createProgramSessions } from "./data-access/program";
import { createProgramItems } from "./data-access/program-items";
import { createPublicAbstracts } from "./data-access/public-abstracts";
import {
  createAbstractCategories,
  createEditions,
  createInstitutions,
  createRegistrationCategories,
  createRegistrations,
} from "./data-access/editions";
import {
  createInvitedSpeakers,
  createSponsors,
} from "./data-access/speakers-sponsors";
import { createAwardRecipients, createAwards } from "./data-access/awards";
import { createBranchOfficers } from "./data-access/officers";
import { createDocuments } from "./data-access/documents";
import { createSettings } from "./data-access/settings";
import { createMeetingImporter } from "./data-access/importer";
import { createCarrelPages, createPages } from "./data-access/pages";

export {
  ForbiddenError,
  DeadlinePassedError,
  ConflictOfInterestError,
  NotFoundError,
  ValidationError,
  AlreadyExistsError,
  isAdmin,
  isChair,
  isReviewerAnywhere,
} from "./data-access/core";
export type { Actor } from "./data-access/core";
export type {
  AuthorInput,
  AffiliationInput,
} from "./data-access/abstracts";
export type {
  GrantableRole,
} from "./data-access/reviews";
export type {
  BookAuthor,
  BookAffiliation,
  BookSectionView,
  BookView,
  BookArrangementInput,
  BookRenderEntry,
  BookRenderData,
} from "./data-access/book-model";
export type {
  ProgramSessionResolved,
  ProgramAbstractOption,
  ProgramDay,
  ProgramBookData,
} from "./data-access/program-model";
export type {
  PublicAbstractSummary,
} from "./data-access/public-abstracts";
export type {
  EditionPatch,
  RegistrationCategoryPatch,
} from "./data-access/editions";
export type {
  SponsorPublic,
  SpeakerPublic,
} from "./data-access/speakers-sponsors";
export type {
  AwardRecipientView,
} from "./data-access/awards";
export type {
  Officer,
  PastOfficer,
  PastOfficerTab,
} from "./data-access/officers";
export type {
  FooterLink,
  PlatformSettings,
  PlatformSettingsPatch,
} from "./data-access/settings";
export type { Page, PageWrite } from "./data-access/pages";

// The controlled-vocabulary types live in ./vocab (client-safe, one source).
// Re-export the ones callers reach for through the data-access layer so their
// imports keep resolving here.
export type {
  AbstractFormat,
  AbstractLevel,
  ProgramItemKind,
  Season,
  SpeakerRole,
} from "./vocab";

function createDataAccess(db: DB) {
  return {
    abstracts: createAbstracts(db),
    reviews: createReviews(db),
    roles: createRoles(db),
    decisions: createDecisions(db),
    books: createBooks(db),
    programSessions: createProgramSessions(db),
    programItems: createProgramItems(db),
    program: createProgram(db),
    documents: createDocuments(db),
    invitedSpeakers: createInvitedSpeakers(db),
    sponsors: createSponsors(db),
    awards: createAwards(db),
    awardRecipients: createAwardRecipients(db),
    branchOfficers: createBranchOfficers(db),
    publicAbstracts: createPublicAbstracts(db),
    institutions: createInstitutions(db),
    registrations: createRegistrations(db),
    editions: createEditions(db),
    registrationCategories: createRegistrationCategories(db),
    abstractCategories: createAbstractCategories(db),
    settings: createSettings(db),
    pages: createPages(db),
  };
}

export type DataAccess = ReturnType<typeof createDataAccess>;

// Entry point for loaders and actions: build the data-access layer from the
// request environment (context.cloudflare.env). This is the only data path the
// rest of the app imports; nothing else reaches the Drizzle client or schema.
export function getDataAccess(env: Env) {
  return createDataAccess(getDb(env));
}

// Resolve the acting user's grants through the data-access layer. Used by the
// auth helpers to decide admin access without touching the Drizzle client.
export function getActor(env: Env, userId: string): Promise<Actor> {
  return loadActor(getDb(env), userId);
}

// Build the importer from the environment, parallel to getDataAccess. Server
// only; the offline import script is the only caller.
export function getMeetingImporter(env: Env) {
  return createMeetingImporter(getDb(env));
}

// Carrel's write path, parallel to getMeetingImporter: a machine caller with no
// acting user, authenticated by the site API's key, and audited by the
// page_revision row each write appends. Only app/lib/carrel calls it.
export function getCarrelPages(env: Env) {
  return createCarrelPages(getDb(env));
}
