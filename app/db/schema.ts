import {
  sqliteTable,
  text,
  integer,
  real,
  unique,
  index,
  primaryKey,
  uniqueIndex,
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
// Auth (Better Auth owns these). Sessions and the sign-in rate limit live here in
// D1, which is consistent everywhere at once, so a sign-out holds at once and the
// limiter counts in one atomic step (KV is neither). Keep these column shapes in
// sync with what the Better Auth Drizzle adapter expects, and pass this schema to it.
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
    accessTokenExpiresAt: tsMs("access_token_expires_at"),
    refreshTokenExpiresAt: tsMs("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("ix_account_user").on(t.userId)],
);

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: tsMs("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    // Where the session was last active, as Cloudflare places the request (city, region,
    // country); written with updatedAt by touchSession in app/lib/auth.server.ts.
    location: text("location"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("ix_session_user").on(t.userId)],
);

export const rateLimit = sqliteTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: integer("last_request").notNull(),
});

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

// A person's passkeys (site-runtime ./sign-in, Better Auth's passkey plugin).
export const passkey = sqliteTable(
  "passkey",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    publicKey: text("public_key").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    credentialID: text("credential_id").notNull(),
    counter: integer("counter").notNull(),
    deviceType: text("device_type").notNull(),
    backedUp: integer("backed_up", { mode: "boolean" }).notNull(),
    transports: text("transports"),
    createdAt: tsMs("created_at"),
    aaguid: text("aaguid"),
  },
  (t) => [index("ix_passkey_user").on(t.userId), index("ix_passkey_credential").on(t.credentialID)],
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
      enum: ["pending", "paid", "refunded", "cancelled"], // codespell:ignore (a stored value)
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
        "staff",
        "fellow",
        "faculty",
      ],
    }),
    // Format axis: the decided/archival oral or poster placement. Distinct from
    // presentationPreference, which stays the author's oral/poster/either request.
    format: text("format", { enum: ["oral", "poster"] }),
    // The book abstract code (for example UO1, GP3, PP2) and its provenance.
    // code_source guarantees a generated code is never shown as printed. Null for
    // null-level items (career, invited, awardee talks) that carry no code.
    code: text("code"),
    codeSource: text("code_source", { enum: ["printed", "generated"] }),
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
  (t) => [
    unique("uq_review_assignment").on(t.assignmentId),
    // Decisions and the chair's review list read submitted reviews by abstract.
    index("ix_review_abstract").on(t.abstractId, t.status),
  ],
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
      enum: ["newsletter", "abstract_book", "program", "brand_image", "other"],
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
    r2Key: text("r2_key"), // set when the file is stored
    fileName: text("file_name"),
    // The stored file's MIME and coarse kind. mimeType drives the served
    // Content-Type; fileKind (pdf|image) is the viewer's branch. Both default to
    // PDF so existing rows and generated books backfill correctly. The kind is
    // stored, never inferred from category at read time.
    mimeType: text("mime_type").notNull().default("application/pdf"),
    fileKind: text("file_kind", { enum: ["pdf", "image"] })
      .notNull()
      .default("pdf"),
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
// Abstract book layer. The chair-driven book builder for NEW meetings: one
// abstract_book per edition holds the arrangement; book_section groups accepted
// abstracts into the derived sections; book_entry is one abstract's placement,
// carrying its computed presentation code (per-prefix running number) and its
// position. Codes live here, never on abstract.code, which stays the archive's
// printed record. publishedHtml is the frozen render stored on publish. Archive
// abstracts never get a book row. See app/lib/book-numbering.ts for the reflow.
// ---------------------------------------------------------------------------

export const abstractBook = sqliteTable(
  "abstract_book",
  {
    id: pk(),
    editionId: text("edition_id")
      .notNull()
      .references(() => edition.id, { onDelete: "cascade" })
      .unique(), // v1: one book per edition
    status: text("status", { enum: ["draft", "published"] })
      .notNull()
      .default("draft"),
    numberingScheme: text("numbering_scheme").notNull().default("prefix"),
    publishedHtml: text("published_html"), // frozen render, set on publish
    publishedAt: tsMs("published_at"),
    generatedById: text("generated_by_id").references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
);

export const bookSection = sqliteTable(
  "book_section",
  {
    id: pk(),
    bookId: text("book_id")
      .notNull()
      .references(() => abstractBook.id, { onDelete: "cascade" }),
    title: text("title").notNull(), // derived label, editable
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("ix_book_section_book").on(t.bookId)],
);

export const bookEntry = sqliteTable(
  "book_entry",
  {
    id: pk(),
    bookId: text("book_id")
      .notNull()
      .references(() => abstractBook.id, { onDelete: "cascade" }),
    sectionId: text("section_id")
      .notNull()
      .references(() => bookSection.id, { onDelete: "cascade" }),
    abstractId: text("abstract_id")
      .notNull()
      .references(() => abstract.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0), // position within section
    code: text("code"), // computed/frozen presentation code; null for null-level items
    included: integer("included", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("uq_book_entry").on(t.bookId, t.abstractId),
    index("ix_book_entry_book").on(t.bookId),
    index("ix_book_entry_section").on(t.sectionId),
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

// The branch officers page: the current officers, the advisory board and the
// past officers, one row each. A past officer's role is the office, which
// groups the page's tabs; tabs and rows follow sort_order. Past rows may lack
// a name or term where the record has gaps.
export const branchOfficer = sqliteTable(
  "branch_officer",
  {
    id: pk(),
    section: text("section", { enum: ["officer", "board", "past"] }).notNull(),
    role: text("role"), // the office; null for the advisory board
    name: text("name"),
    affiliation: text("affiliation"), // institution for board and past rows
    location: text("location"),
    phone: text("phone"),
    email: text("email"),
    term: text("term"), // past rows, e.g. "2024-2025"
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("ix_branch_officer_section").on(t.section, t.sortOrder)],
);

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

// Site pages Carrel edits through the site API (app/lib/carrel). Each row backs
// a route that already exists (home, award-nominations), so the set is fixed by
// the site: Carrel edits, schedules and publishes, never creates or takes one down. source
// is Carrel's working copy (front matter and markdown); title, description and
// html are what the route shows, set only on publish, html rendered by Prelum at
// renderVersion. page_revision is the machine path's audit log (hard rule 4's
// pattern): every Carrel write appends one, in the same batch, naming the change
// (a schedule and its cancel included, with the page's source as it stands).
/** A page's published search fields beside its description; image is a library path, sized from the library. */
export type PageSearch = {
  searchTitle?: string;
  image?: { url: string; width: number | null; height: number | null; alt?: string };
  canonical?: string;
  noindex?: boolean;
};

export const page = sqliteTable("page", {
  slug: text("slug").primaryKey(),
  source: text("source").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  html: text("html").notNull(),
  renderVersion: text("render_version").notNull(),
  // site-api's search fields beside description, as published (PageSearch); null when none.
  searchFields: text("search_fields", { mode: "json" }).$type<PageSearch>(),
  publishedAt: tsMs("published_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const pageRevision = sqliteTable(
  "page_revision",
  {
    id: pk(),
    pageSlug: text("page_slug")
      .notNull()
      .references(() => page.slug, { onDelete: "cascade" }),
    event: text("event", { enum: ["save", "publish", "schedule", "unschedule"] }).notNull(),
    changeId: text("change_id").notNull(),
    version: text("version").notNull(),
    source: text("source").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("ix_page_revision_page").on(t.pageSlug, t.createdAt)],
);

// The media library: the pictures Carrel uploads for the pages above, served at /media/<key>
// (app/routes/media.$.ts) from the UPLOADS bucket under media/. key is the R2 key and the
// site-api media id. rev is the version every editable write checks and bumps in one statement,
// so a stale write is refused rather than lost (datetime resolution would let two writes in one
// second share a version). sha256 is the current bytes', for duplicates. tags is a JSON array.
// placeholder (a tiny blurred WebP data: URI) and color (#rrggbb) are site-api's, for Carrel's library.
// Abstract book and program covers are not here: they are inline SVG drawn by app/lib/cover.ts.
export const media = sqliteTable(
  "media",
  {
    key: text("key").primaryKey(),
    filename: text("filename"),
    contentType: text("content_type").notNull(),
    bytes: integer("bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    sha256: text("sha256").notNull(),
    alt: text("alt").notNull().default(""),
    caption: text("caption").notNull().default(""),
    tags: text("tags").notNull().default("[]"),
    focus: text("focus"),
    credit: text("credit").notNull().default(""),
    license: text("license").notNull().default(""),
    sourceUrl: text("source_url"),
    licenseExpires: text("license_expires"),
    takenAt: text("taken_at"),
    trashedAt: tsMs("trashed_at"),
    rev: integer("rev").notNull().default(0),
    uploadedAt: tsMs("uploaded_at").notNull(),
    updatedAt: updatedAt(),
    placeholder: text("placeholder"),
    color: text("color"),
  },
  (t) => [index("ix_media_sha256").on(t.sha256)],
);

// Every set of bytes a library file has had, newest last. The newest row is the object in
// UPLOADS; each earlier one names its kept copy (backup_key, under media-history/), so a
// replace, a turn or a shrink at upload can be taken back. Deleted with the file.
export const mediaRevision = sqliteTable(
  "media_revision",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    mediaKey: text("media_key")
      .notNull()
      .references(() => media.key, { onDelete: "cascade" }),
    at: tsMs("at").notNull(),
    bytes: integer("bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    reason: text("reason", {
      enum: ["upload", "import", "replace", "transform", "resize", "revert"],
    }).notNull(),
    sha256: text("sha256"),
    backupKey: text("backup_key"),
  },
  (t) => [index("ix_media_revision_key").on(t.mediaKey, t.id)],
);

// The change log a library screen polls (site-api changedSince): one row per insert, update or
// delete of a media row, written by triggers (migration 0022) so no writer can forget it.
export const mediaChange = sqliteTable("media_change", {
  seq: integer("seq").primaryKey({ autoIncrement: true }),
  mediaKey: text("media_key").notNull(),
});

// A count of the 404s the site serves, per path, referring host and UTC day (site-runtime
// ./not-found, written by countNotFound in workers/app.ts). The shape is site-runtime's
// NOT_FOUND_SQL, reached by NOT_FOUND_UPGRADE_SQL (migration 0024): the pathname only, never the
// query, which can carry a sign-in token, and of the Referer only its host.
export const page404Daily = sqliteTable(
  "page_404_daily",
  {
    id: text("id").primaryKey(),
    day: tsMs("day").notNull(),
    path: text("path").notNull(),
    hitCount: integer("hit_count").notNull().default(0),
    referrerHost: text("referrer_host").notNull().default(""),
    kind: text("kind").notNull().default("page"),
  },
  (t) => [uniqueIndex("page_404_daily_day_path_referrer_uq").on(t.day, t.path, t.referrerHost)],
);

// Each scheduled job's last start, success and failure, in epoch ms (site-runtime ./cron, written
// by runJobs in workers/app.ts and read by /health's cron check). The shape is its CRON_SQL.
export const cronRuns = sqliteTable("cron_runs", {
  name: text("name").primaryKey(),
  everyMinutes: integer("every_minutes").notNull(),
  firstStartedAt: integer("first_started_at"),
  lastStartedAt: integer("last_started_at"),
  lastOkAt: integer("last_ok_at"),
  lastFailedAt: integer("last_failed_at"),
  lastError: text("last_error"),
});

// An update Carrel scheduled on a live page (site-api's schedules, migration 0026): its own source, which replaces
// the page's at publish_at, when the per-minute cron's runSchedules applies it. One per page at most. The shape is
// site-api's SCHEDULED_UPDATES_SQL, read and written through its d1ScheduledUpdates in the Carrel pages path
// (data-access/pages.ts). Times are UTC ISO text, so the due scan is a text comparison.
export const scheduledUpdates = sqliteTable(
  "scheduled_updates",
  {
    contentId: text("content_id").primaryKey(),
    source: text("source").notNull(),
    publishAt: text("publish_at").notNull(),
    changeId: text("change_id").notNull(),
    scheduledAt: text("scheduled_at").notNull(),
  },
  (t) => [index("scheduled_updates_due").on(t.publishAt)],
);

// site-api's own store (SITE_API_STORE_SQL, migration 0027), read and written only through its d1SiteApiStore in
// app/lib/carrel/handler.server.ts: each Carrel write's answer under its change id for 7 days (site_api_writes), so a
// retry answers the same and runs nothing; the publish hooks that failed, for the cron to run again (hook_retries);
// only the SHA-256 of each preview link's token (preview_links); and the pages each page last sent webmentions to
// (webmention_targets). Named here so drizzle-kit's snapshot knows them; no query here reads them.
export const siteApiWrites = sqliteTable(
  "site_api_writes",
  {
    changeId: text("change_id").primaryKey(),
    route: text("route").notNull(),
    requestHash: text("request_hash").notNull(),
    status: integer("status"),
    response: text("response"),
    state: text("state").notNull(),
    at: text("at").notNull(),
  },
  (t) => [index("site_api_writes_at").on(t.at)],
);

export const hookRetries = sqliteTable(
  "hook_retries",
  {
    id: text("id").primaryKey(),
    hook: text("hook").notNull(),
    event: text("event").notNull(),
    attempts: integer("attempts").notNull(),
    nextAt: text("next_at").notNull(),
    lastError: text("last_error").notNull(),
  },
  (t) => [index("hook_retries_due").on(t.nextAt)],
);

export const previewLinks = sqliteTable(
  "preview_links",
  {
    tokenHash: text("token_hash").primaryKey(),
    contentId: text("content_id").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
    changeId: text("change_id").notNull(),
  },
  (t) => [index("preview_links_content").on(t.contentId, t.expiresAt)],
);

export const webmentionTargets = sqliteTable("webmention_targets", {
  source: text("source").primaryKey(),
  targets: text("targets").notNull(),
  sentAt: text("sent_at").notNull(),
});

// ---------------------------------------------------------------------------
// Deferred to later phases, named here so the shape is visible but kept out of
// this review: officer, newsletter. Add once the core above is agreed.
// ---------------------------------------------------------------------------
