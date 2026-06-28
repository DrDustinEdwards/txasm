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
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
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
    categoryId: text("category_id").references(() => abstractCategory.id),
    title: text("title").notNull(),
    // structured abstract sections; configurable per edition later if needed
    background: text("background"),
    methods: text("methods"),
    results: text("results"),
    conclusions: text("conclusions"),
    bodyText: text("body_text"), // fallback for non-structured entry
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
// Deferred to later phases, named here so the shape is visible but kept out of
// this review: decision, program_session, program_item, abstract_book, officer,
// newsletter, award. Add once the core above is agreed.
// ---------------------------------------------------------------------------
