import { Form, redirect, useActionData, useNavigation } from "react-router";
import { Banner } from "capsomer/react/banner";
import { Link } from "capsomer/react/link";
import type { Route } from "./+types/submit.$slug";
import { pageTitle } from "~/lib/site-meta";
import { privateMeta } from "@drdustinedwards/site-helpers/head";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";
import { requireUser } from "~/lib/auth.server";
import {
  DeadlinePassedError,
  NotFoundError,
  ValidationError,
  getActor,
  getDataAccess,
} from "~/lib/data-access";
import { DATE_TIME } from "~/lib/format";
import { formatDate } from "capsomer/behavior/time";
import { ABSTRACT_STATUS_LABELS } from "~/lib/vocab";
import { RichText } from "capsomer/react/trusted-html";

// An app: abstract submission. It hydrates (root.tsx, the `hydrate` handle).
export const handle = { hydrate: true };

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(pageTitle(matches, "Submit an abstract"));
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const { env } = context.get(cloudflareContext);
  const actor = await getActor(env, user);
  const da = getDataAccess(env);

  let edition;
  try {
    edition = await da.editions.get(params.slug);
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw new Response("Not found", { status: 404 });
    }
    throw error;
  }

  const now = Date.now();
  const notYet = !!edition.submissionOpensAt && now < edition.submissionOpensAt.getTime();
  const closed = !!edition.submissionDeadline && now > edition.submissionDeadline.getTime();
  const open = !notYet && !closed;

  const mine = await da.abstracts.listMine(actor, edition.id);

  return {
    edition: {
      slug: edition.slug,
      name: edition.name,
      submissionOpensAt: edition.submissionOpensAt,
      submissionDeadline: edition.submissionDeadline,
    },
    open,
    notYet,
    closed,
    mine,
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const user = await requireUser(request);
  const { env } = context.get(cloudflareContext);
  const actor = await getActor(env, user);
  const da = getDataAccess(env);

  let edition;
  try {
    edition = await da.editions.get(params.slug);
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw new Response("Not found", { status: 404 });
    }
    throw error;
  }

  try {
    const created = await da.abstracts.create(actor, {
      editionId: edition.id,
      title: "",
    });
    return redirect(`/abstracts/${created.id}/edit`);
  } catch (error) {
    if (error instanceof ValidationError || error instanceof DeadlinePassedError) {
      return { error: error.message };
    }
    throw error;
  }
}

export default function SubmitStart({ loaderData }: Route.ComponentProps) {
  const { edition, open, notYet, closed, mine } = loaderData;
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const error = actionData?.error ?? null;

  return (
    <div className="form-page cap-stack" data-gap="6">
      <div className="cap-stack" data-gap="3">
        <h1 className="page-title">Submit an abstract</h1>
        <p>{edition.name}</p>
        {edition.submissionDeadline ? (
          <p className="small cap-muted">
            Submission deadline: {formatDate(edition.submissionDeadline, DATE_TIME)}
          </p>
        ) : null}
        <p className="small cap-muted">
          Your abstract and its author names stay in the Meeting archive for good. Deleting your
          account later does not remove them.
        </p>
      </div>

      {error ? (
        <p role="alert" className="cap-alert">
          {error}
        </p>
      ) : null}

      {notYet ? (
        <Banner tone="info">
          Submission is not open yet for this meeting
          {edition.submissionOpensAt
            ? `. It opens ${formatDate(edition.submissionOpensAt, DATE_TIME)}.`
            : "."}
        </Banner>
      ) : null}

      {closed ? (
        <Banner tone="warn">
          The submission deadline has passed. New abstracts can no longer be started for this
          meeting.
        </Banner>
      ) : null}

      {mine.length > 0 ? (
        <section className="cap-stack" data-gap="4">
          <h2 className="subsection-title">Your abstracts for this meeting</h2>
          <ul className="divided">
            {mine.map((abstract) => (
              <li key={abstract.id} className="cap-spread row-pad">
                <span>
                  <RichText
                    as="span"
                    html={abstract.title}
                    fallback={<span className="cap-muted">Untitled</span>}
                  />{" "}
                  <span className="small cap-muted">
                    ({ABSTRACT_STATUS_LABELS[abstract.status]})
                  </span>
                </span>
                <Link to={`/abstracts/${abstract.id}/edit`} className="strong">
                  Continue
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {open ? (
        <Form method="post">
          <button type="submit" disabled={submitting} className="cap-btn" data-variant="primary">
            {submitting ? "Starting..." : "Start a new abstract"}
          </button>
        </Form>
      ) : null}
    </div>
  );
}
