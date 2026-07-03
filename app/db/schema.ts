import {
  sqliteTable,
  text,
  integer,
  real,
  unique,
  index,
  primaryKey,
} from "drizzle-orm/sqlite-core";

// Column factories. crypto.randomUUID is available in the Workers runtime.
function pk() {
  return text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
}
function createdAt() {
  return integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());
}
function updatedAt() {
  return integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date());
}
function tsMs(name: string) {
  return integer(name, { mode: "timestamp_ms" });
}

// ---------------------------------------------------------------------------
// Auth (Better Auth owns these). Sessions live in KV via Better Auth secondary
// storage, so there is no session table in D1. Keep these column shapes in sync
// with what the Better Auth Drizzle adapter expects, and pass this schema to it.
// ---------------------------------------------------------------------------

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .notNull()
    .default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("ix_account_user").on(t.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: tsMs("expires_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("ix_verification_identifier").on(t.identifier)],
);

// ---------------------------------------------------------------------------
// Editions: the spine. Every domain row below carries edition_id.
// ---------------------------------------------------------------------------

export const edition = sqliteTable(
  "edition",
  {
    id: pk(),
    slug: text("slug").notNull().unique(), // e.g. "spring-2027"
    name: text("name").notNull(), // e.g. "Spring 2027 Meeting"
    season: text("season", { enum: ["spring", "fall"] }).notNull(),
    year: integer("year").notNull(),
    status: text("status", {
      enum: [
        "draft",
        "registration_open",
        "submission_open",
        "review",
        "decisions",
        "scheduled",
        "complete",
        "archived",
      ],
    })
      .notNull()
      .default("draft"),
    registrationOpensAt: tsMs("registration_opens_at"),
    registrationClosesAt: tsMs("registration_closes_at"),
    submissionOpensAt: tsMs("submission_opens_at"),
    submissionDeadline: tsMs("submission_deadline"),
    reviewDeadline: tsMs("review_deadline"),
    abstractWordLimit: integer("abstract_word_limit"), // hard body limit; null uses the default
    meetingStartsAt: tsMs("meeting_starts_at"),
    meetingEndsAt: tsMs("meeting_ends_at"),
    venueName: text("venue_name"),
    venueAddress: text("venue_address"),
    city: text("city"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("uq_edition_season_year").on(t.season, t.year)],
);

// ---------------------------------------------------------------------------
// Roles. admin/chair/reviewer are explicit grants. editionId null means the
// grant is platform-wide (used for admin). author and attendee are NOT stored
// here; they are derived from owning an abstract or holding a paid registration
// in a given edition.
// ---------------------------------------------------------------------------

export const roleGrant = sqliteTable(
  "role_grant",
  {
    id: pk(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["admin", "chair", "reviewer"] }).notNull(),
    editionId: text("edition_id").references(() => edition.id, {
      onDelete: "cascade",
    }), // null = platform-wide
    status: text("status", { enum: ["active", "revoked"] })
      .notNull()
      .default("active"),
    grantedById: text("granted_by_id").references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [
    unique("uq_role_grant").on(t.userId, t.role, t.editionId),
    index("ix_role_grant_user").on(t.userId),
    index("ix_role_grant_edition").on(t.editionId),
  ],
);

// Email invitations for chair/reviewer roles. Accepting one issues a role_grant.
export const invitation = sqliteTable(
  "invitation",
  {
    id: pk(),
    editionId: text("edition_id")
      .notNull()
      .references(() => edition.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role", { enum: ["chair", "reviewer"] }).notNull(),
    token: text("token").notNull().unique(),
    status: text("status", {
      enum: ["pending", "accepted", "expired", "revoked"],
    })
      .notNull()
      .default("pending"),
    invitedById: text("invited_by_id").references(() => user.id),
    expiresAt: tsMs("expires_at").notNull(),
    acceptedAt: tsMs("accepted_at"),
    acceptedUserId: text("accepted_user_id").references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [
    index("ix_invitation_edition").on(t.editionId),
    index("ix_invitation_email").on(t.email),
  ],
);

// ---------------------------------------------------------------------------
// Registration. Categories and fees are per edition.
// ---------------------------------------------------------------------------

export const registrationCategory = sqliteTable(
  "registration_category",
  {
    id: pk(),
    editionId: text("edition_id")
      .notNull()
      .references(() => edition.id, { onDelete: "cascade" }),
    key: text("key", { enum: ["member", "student", "nonmember"] }).notNull(),
    label: text("label").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [unique("uq_reg_category").on(t.editionId, t.key)],
);

export const registration = sqliteTable(
  "registration",
  {
    id: pk(),
    editionId: text("edition_id")
      .notNull()
      .references(() => edition.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    categoryId: text("category_id")
      .notNull()
      .references(() => registrationCategory.id),
    status: text("status", {
      enum: ["pending", "paid", "refunded", "cancelled"],
    })
      .notNull()
      .default("pending"),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    paypalOrderId: text("paypal_order_id"),
    paypalCaptureId: text("paypal_capture_id"),
    paidAt: tsMs("paid_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("uq_registration_user_edition").on(t.editionId, t.userId), // one per user per edition
    index("ix_registration_edition").on(t.editionId),
  ],
);

// ---------------------------------------------------------------------------
// Abstracts and authorship. Authorship is modeled for the book: author rows
// (which may or may not link to a user account), numbered affiliation rows, and
// a join so superscript affiliation numbers render correctly.
// ---------------------------------------------------------------------------

export const abstractCategory = sqliteTable(
  "abstract_category",
  {
    id: pk(),
    editionId: text("edition_id")
      .notNull()
      .references(() => edition.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // e.g. "Environmental Microbiology"
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [unique("uq_abstract_category").on(t.editionId, t.name)],
);

export const abstract = sqliteTable(
  "abstract",
  {
    id: pk(),
    editionId: text("edition_id")
      .notNull()
      .references(() => edition.id, { onDelete: "cascade" }),
    submitterId: text("submitter_id") // owner / corresponding submitter account
      .notNull()
      .references(() => user.id),
    // Topic axis: the per-meeting abstract_category the author picks.
    categoryId: text("category_id").references(() => abstractCategory.id),
    title: text("title").notNull(),
    // Level axis: the presenter's academic standing. Nullable.
    level: text("level", {
      enum: [
        "undergraduate",
        "graduate",
        "education",
        "high_school",
        "postdoctoral",
      ],
    }),
    // Format axis: the decided/archival oral or poster placement. Distinct from
    // presentationPreference, which stays the author's oral/poster/either request.
    format: text("format", { enum: ["oral", "poster"] }),
    // bodyText is the single freeform abstract body going forward. The four
    // section columns below are kept but optional and unused by default; a later
    // migration can drop them once nothing references them.
    bodyText: text("body_text"),
    background: text("background"),
    methods: text("methods"),
    results: text("results"),
    conclusions: text("conclusions"),
    presentationPreference: text("presentation_preference", {
      enum: ["oral", "poster", "either"],
    })
      .notNull()
      .default("either"),
    status: text("status", {
      enum: [
        "draft",
        "submitted",
        "under_review",
        "accepted",
        "rejected",
        "withdrawn",
      ],
    })
      .notNull()
      .default("draft"),
    submittedAt: tsMs("submitted_at"),
    withdrawnAt: tsMs("withdrawn_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("ix_abstract_edition").on(t.editionId),
    index("ix_abstract_submitter").on(t.submitterId),
  ],
);

export const author = sqliteTable(
  "author",
  {
    id: pk(),
    abstractId: text("abstract_id")
      .notNull()
      .references(() => abstract.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id), // null if co-author has no account
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email"),
    ordinal: integer("ordinal").notNull(), // display order on the abstract
    isPresenting: integer("is_presenting", { mode: "boolean" })
      .notNull()
      .default(false),
    isCorresponding: integer("is_corresponding", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index("ix_author_abstract").on(t.abstractId),
    index("ix_author_user").on(t.userId),
  ],
);

export const affiliation = sqliteTable(
  "affiliation",
  {
    id: pk(),
    abstractId: text("abstract_id")
      .notNull()
      .references(() => abstract.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(), // superscript number in the book
    institution: text("institution").notNull(),
    department: text("department"),
    city: text("city"),
    country: text("country"),
  },
  (t) => [unique("uq_affiliation_ordinal").on(t.abstractId, t.ordinal)],
);

export const authorAffiliation = sqliteTable(
  "author_affiliation",
  {
    authorId: text("author_id")
      .notNull()
      .references(() => author.id, { onDelete: "cascade" }),
    affiliationId: text("affiliation_id")
      .notNull()
      .references(() => affiliation.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.authorId, t.affiliationId] })],
);

// R2 uploads: figures, camera-ready files, supplements. r2Key is the object key.
export const abstractFile = sqliteTable(
  "abstract_file",
  {
    id: pk(),
    abstractId: text("abstract_id")
      .notNull()
      .references(() => abstract.id, { onDelete: "cascade" }),
    kind: text("kind", {
      enum: ["figure", "camera_ready", "supplement"],
    }).notNull(),
    r2Key: text("r2_key").notNull().unique(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type"),
    sizeBytes: integer("size_bytes"),
    uploadedById: text("uploaded_by_id").references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [index("ix_abstract_file_abstract").on(t.abstractId)],
);

// ---------------------------------------------------------------------------
// Review. Open review, so author identities are visible. The rubric is data,
// not columns: rubric_criterion rows per edition define the scale and weights,
// and review_score holds one score per criterion. Conflict of interest is
// enforced in the access layer at assignment time; review_conflict records
// declared conflicts beyond plain authorship.
// ---------------------------------------------------------------------------

export const rubricCriterion = sqliteTable(
  "rubric_criterion",
  {
    id: pk(),
    editionId: text("edition_id")
      .notNull()
      .references(() => edition.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    description: text("description"),
    scaleMin: integer("scale_min").notNull().default(1),
    scaleMax: integer("scale_max").notNull().default(5),
    weight: real("weight").notNull().default(1),
    sortOrder: integer("sort_order").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("ix_rubric_edition").on(t.editionId)],
);

export const reviewAssignment = sqliteTable(
  "review_assignment",
  {
    id: pk(),
    editionId: text("edition_id")
      .notNull()
      .references(() => edition.id, { onDelete: "cascade" }),
    abstractId: text("abstract_id")
      .notNull()
      .references(() => abstract.id, { onDelete: "cascade" }),
    reviewerId: text("reviewer_id")
      .notNull()
      .references(() => user.id),
    assignedById: text("assigned_by_id").references(() => user.id),
    status: text("status", {
      enum: ["assigned", "accepted", "declined", "completed"],
    })
      .notNull()
      .default("assigned"),
    dueAt: tsMs("due_at"),
    assignedAt: tsMs("assigned_at")
      .notNull()
      .$defaultFn(() => new Date()),
    createdAt: createdAt(),
  },
  (t) => [
    unique("uq_assignment").on(t.abstractId, t.reviewerId),
    index("ix_assignment_reviewer").on(t.reviewerId),
    index("ix_assignment_edition").on(t.editionId),
  ],
);

export const reviewConflict = sqliteTable(
  "review_conflict",
  {
    id: pk(),
    editionId: text("edition_id")
      .notNull()
      .references(() => edition.id, { onDelete: "cascade" }),
    abstractId: text("abstract_id")
      .notNull()
      .references(() => abstract.id, { onDelete: "cascade" }),
    reviewerId: text("reviewer_id")
      .notNull()
      .references(() => user.id),
    reason: text("reason", {
      enum: ["author", "coauthor", "colleague", "other"],
    }).notNull(),
    note: text("note"),
    declaredById: text("declared_by_id").references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [unique("uq_conflict").on(t.abstractId, t.reviewerId)],
);

export const review = sqliteTable(
  "review",
  {
    id: pk(),
    assignmentId: text("assignment_id")
      .notNull()
      .references(() => reviewAssignment.id, { onDelete: "cascade" }),
    editionId: text("edition_id")
      .notNull()
      .references(() => edition.id, { onDelete: "cascade" }),
    abstractId: text("abstract_id")
      .notNull()
      .references(() => abstract.id, { onDelete: "cascade" }),
    reviewerId: text("reviewer_id")
      .notNull()
      .references(() => user.id),
    recommendation: text("recommendation", {
      enum: ["accept", "reject", "revise"],
    }),
    overallComment: text("overall_comment"), // shared per open-review policy
    confidentialComment: text("confidential_comment"), // chairs only
    status: text("status", { enum: ["draft", "submitted"] })
      .notNull()
      .default("draft"),
    submittedAt: tsMs("submitted_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("uq_review_assignment").on(t.assignmentId)],
);

export const reviewScore = sqliteTable(
  "review_score",
  {
    id: pk(),
    reviewId: text("review_id")
      .notNull()
      .references(() => review.id, { onDelete: "cascade" }),
    criterionId: text("criterion_id")
      .notNull()
      .references(() => rubricCriterion.id),
    score: integer("score").notNull(), // validated against criterion min/max in the access layer
  },
  (t) => [unique("uq_review_score").on(t.reviewId, t.criterionId)],
);

// ---------------------------------------------------------------------------
// Decisions. One per abstract: the chair records accept/reject/revise after
// reading the reviews. presentation_type is set only on accept. decision_message
// is an optional note to the author, stored sanitized. notify_state tracks how
// the author was told; email is deferred, so in-app display is the notification
// for now and the state stays "none" until a later additive step sends mail.
// ---------------------------------------------------------------------------

export const decision = sqliteTable(
  "decision",
  {
    id: pk(),
    editionId: text("edition_id")
      .notNull()
      .references(() => edition.id, { onDelete: "cascade" }),
    abstractId: text("abstract_id")
      .notNull()
      .references(() => abstract.id, { onDelete: "cascade" }),
    outcome: text("outcome", {
      enum: ["accept", "reject", "revise"],
    }).notNull(),
    presentationType: text("presentation_type", {
      enum: ["oral", "poster"],
    }), // set only when outcome is accept
    decisionMessage: text("decision_message"), // optional note to the author, sanitized
    decidedById: text("decided_by_id")
      .notNull()
      .references(() => user.id),
    decidedAt: integer("decided_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    notifyState: text("notify_state", {
      enum: ["none", "in_app", "emailed"],
    })
      .notNull()
      .default("none"),
    notifiedAt: tsMs("notified_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("uq_decision_abstract").on(t.abstractId),
    index("ix_decision_edition").on(t.editionId),
  ],
);

// ---------------------------------------------------------------------------
// Documents. One model for every branch PDF, generated or uploaded: newsletters,
// abstract books, programs, and anything else, optionally tied to a meeting. A
// generated doc (source "generated") is produced by our PDF pipeline and tracks
// its run through genStatus (pending/generating/ready/failed), keeping the one
// generated row per category per edition; an uploaded doc (source "uploaded") is
// a historical PDF in the archive with no genStatus. status (draft/published)
// gates public visibility for either source. category and status mirror the
// vocab arrays in app/lib/vocab.ts; keep them in sync. Files live in R2 under
// r2Key; viewing writes nothing.
// ---------------------------------------------------------------------------

export const document = sqliteTable(
  "document",
  {
    id: pk(),
    category: text("category", {
      enum: ["newsletter", "abstract_book", "program", "other"],
    }).notNull(),
    status: text("status", { enum: ["draft", "published"] })
      .notNull()
      .default("draft"),
    source: text("source", { enum: ["generated", "uploaded"] }).notNull(),
    title: text("title").notNull(),
    year: integer("year"),
    season: text("season", { enum: ["spring", "fall"] }),
    // Abstract books and programs tie to a meeting; newsletters do not. Kept when
    // the meeting is deleted so the archived PDF survives.
    editionId: text("edition_id").references(() => edition.id, {
      onDelete: "set null",
    }),
    editor: text("editor"), // newsletters
    r2Key: text("r2_key"), // set when the PDF is stored
    fileName: text("file_name"),
    slug: text("slug").notNull().unique(),
    abstractCount: integer("abstract_count"), // generated abstract books only
    generatedById: text("generated_by_id").references(() => user.id),
    generatedAt: tsMs("generated_at"),
    genStatus: text("gen_status", {
      enum: ["pending", "generating", "ready", "failed"],
    }), // generated docs only
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("ix_document_category_year_season").on(t.category, t.year, t.season),
    index("ix_document_edition").on(t.editionId),
    index("ix_document_status").on(t.status),
  ],
);

// ---------------------------------------------------------------------------
// Invited speakers and sponsors, per edition. Invited speakers are keynotes and
// award lectures a program item can point to; sponsors show on the public
// program. Both carry an r2Key for an image (headshot, logo) that stays nullable
// now: the upload UI comes with the later assets work, and seeding needs only the
// text. Bios are stored sanitized to the abstract body allowlist (em/sup/sub).
// ---------------------------------------------------------------------------

export const invitedSpeaker = sqliteTable(
  "invited_speaker",
  {
    id: pk(),
    editionId: text("edition_id")
      .notNull()
      .references(() => edition.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    affiliation: text("affiliation"),
    role: text("role", {
      enum: [
        "keynote",
        "goldschmidt_lecture",
        "award_lecture",
        "career",
        "other",
      ],
    }),
    talkTitle: text("talk_title"),
    bio: text("bio"), // sanitized HTML (em/sup/sub)
    headshotR2Key: text("headshot_r2_key"), // upload deferred; key stays nullable
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("ix_invited_speaker_edition").on(t.editionId)],
);

export const sponsor = sqliteTable(
  "sponsor",
  {
    id: pk(),
    editionId: text("edition_id")
      .notNull()
      .references(() => edition.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tier: text("tier"), // e.g. "Gold", free text per meeting
    url: text("url"),
    logoR2Key: text("logo_r2_key"), // upload deferred; key stays nullable
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("ix_sponsor_edition").on(t.editionId)],
);

// ---------------------------------------------------------------------------
// Program. The meeting schedule: ordered sessions, each holding ordered items.
// An item is exactly one of: an accepted abstract (abstractId set), an invited
// speaker (speakerId set), or a plain custom entry like a break (customTitle
// set). That one-of rule is enforced in the data-access layer, not by a DB
// constraint. kind drives the label and public rendering (keynote, break, meal).
// ---------------------------------------------------------------------------

export const programSession = sqliteTable(
  "program_session",
  {
    id: pk(),
    editionId: text("edition_id")
      .notNull()
      .references(() => edition.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    sessionDate: tsMs("session_date"),
    startsAt: tsMs("starts_at"),
    endsAt: tsMs("ends_at"),
    location: text("location"), // room or hall
    moderator: text("moderator"), // optional session moderator, plain text
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("ix_program_session_edition").on(t.editionId)],
);

export const programItem = sqliteTable(
  "program_item",
  {
    id: pk(),
    sessionId: text("session_id")
      .notNull()
      .references(() => programSession.id, { onDelete: "cascade" }),
    abstractId: text("abstract_id").references(() => abstract.id, {
      onDelete: "set null",
    }), // set for an abstract item
    speakerId: text("speaker_id").references(() => invitedSpeaker.id, {
      onDelete: "set null",
    }), // set for an invited-speaker item
    customTitle: text("custom_title"), // set for a plain custom item (break, meal)
    kind: text("kind", {
      enum: [
        "talk",
        "poster",
        "keynote",
        "award",
        "meal",
        "break",
        "business",
        "social",
        "panel",
        "networking",
        "career",
        "other",
      ],
    })
      .notNull()
      .default("talk"),
    note: text("note"),
    startsAt: tsMs("starts_at"), // optional per-item time
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("ix_program_item_session").on(t.sessionId)],
);

// ---------------------------------------------------------------------------
// Institutions. A shared master list that powers the affiliation autocomplete on
// the submission form. It self-grows: when an author types a new institution it
// is appended here (deduped by normalized_name). Affiliation rows still store
// their own institution/city/country text; this table is the type-ahead source.
// ---------------------------------------------------------------------------

export const institution = sqliteTable(
  "institution",
  {
    id: pk(),
    name: text("name").notNull(),
    city: text("city"),
    region: text("region"), // state or province
    country: text("country").default("USA"),
    normalizedName: text("normalized_name").notNull(), // lowercased, trimmed
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("uq_institution_normalized").on(t.normalizedName)],
);

// ---------------------------------------------------------------------------
// Platform settings. A single row (id fixed to 'default', single-row enforced in
// the data-access layer) holding org identity and tunable defaults so nothing is
// hardcoded in the shell: wordmark, names, tagline, founding year, contact,
// social, footer links (JSON array of {label,url}), and the default currency and
// abstract word limit. Read in the root loader and edited on the admin settings
// screen. Currency and word-limit defaults carry DB defaults that mirror the
// named constants in app/lib/vocab.ts.
// ---------------------------------------------------------------------------

export const platformSettings = sqliteTable("platform_settings", {
  id: text("id").primaryKey(), // always 'default'; one row enforced in the data layer
  orgName: text("org_name"), // display name, e.g. "Texas Branch ASM"
  shortName: text("short_name"), // wordmark, e.g. "TXASM"
  orgFullName: text("org_full_name"),
  tagline: text("tagline"),
  foundingYear: integer("founding_year"),
  contactEmail: text("contact_email"),
  facebookUrl: text("facebook_url"),
  footerLinks: text("footer_links"), // JSON array of { label, url }
  defaultCurrency: text("default_currency").notNull().default("usd"),
  defaultAbstractWordLimit: integer("default_abstract_word_limit")
    .notNull()
    .default(250),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// Awards. The branch's named awards and their recipients: a data-driven archive
// maintained by admins each meeting and rendered on the public awardees pages
// (never hardcoded into components). award holds the definition; namesakeBio and
// description are stored sanitized to the abstract body allowlist (em/sup/sub).
// award_recipient is one person's win. editionId ties a recipient to the meeting
// where the award was given when that meeting exists in the system, and is
// nullable and set-null on edition delete because historical years predate it.
// year is text because historical formats vary ("2025-26", "1971"); category and
// placement subdivide a year. Person, institution, mentor, and year are indexed
// for the public search. personName/mentor become person-record links later.
// ---------------------------------------------------------------------------

export const award = sqliteTable("award", {
  id: pk(),
  slug: text("slug").notNull().unique(), // e.g. "s-e-sulkin-award"
  name: text("name").notNull(),
  namesakeBio: text("namesake_bio"), // sanitized HTML (em/sup/sub)
  description: text("description"), // sanitized HTML (em/sup/sub)
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const awardRecipient = sqliteTable(
  "award_recipient",
  {
    id: pk(),
    awardId: text("award_id")
      .notNull()
      .references(() => award.id, { onDelete: "cascade" }),
    editionId: text("edition_id").references(() => edition.id, {
      onDelete: "set null",
    }), // null for historical pre-system years
    year: text("year").notNull(), // text; formats vary ("2025-26", "1971")
    category: text("category"),
    placement: text("placement"), // e.g. "1st", "2nd", "3rd"
    personName: text("person_name").notNull(),
    institution: text("institution"),
    mentor: text("mentor"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("ix_award_recipient_award").on(t.awardId),
    index("ix_award_recipient_edition").on(t.editionId),
    index("ix_award_recipient_person").on(t.personName),
    index("ix_award_recipient_institution").on(t.institution),
    index("ix_award_recipient_mentor").on(t.mentor),
    index("ix_award_recipient_year").on(t.year),
  ],
);

// ---------------------------------------------------------------------------
// Deferred to later phases, named here so the shape is visible but kept out of
// this review: officer, newsletter. Add once the core above is agreed.
// ---------------------------------------------------------------------------
