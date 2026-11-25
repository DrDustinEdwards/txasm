import { Text, Title } from "capsomer/react/text";
import { Stack } from "capsomer/react/stack";
import { Form, redirect, useActionData, useNavigation } from "react-router";
import { Banner } from "capsomer/react/banner";
import { Link } from "capsomer/react/link";
import type { Route } from "./+types/submit.$slug";
import { pageTitle } from "~/lib/site-meta";
import { privateMeta } from "@drdustinedwards/site-helpers/head";
import { cloudflareContext } from "@dustinedwards/site-runtime/context";
import { requireUser } from "~/lib/auth.server";
import { orNotFound, getActor, getDataAccess, submissionWindow } from "~/lib/data-access";
import { DATE_TIME } from "~/lib/format";
import { formError } from "~/lib/form.server";
import { formatDate } from "capsomer/behavior/time";
import { ABSTRACT_STATUS_LABELS } from "~/lib/vocab";
import { RichText } from "capsomer/react/trusted-html";

export const handle = { hydrate: true };

export function meta({ matches }: Route.MetaArgs) {
  return privateMeta(pageTitle(matches, "Submit an abstract"));
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const { env } = context.get(cloudflareContext);
  const actor = await getActor(env, user);
  const da = getDataAccess(env);

  const edition = await orNotFound(da.editions.get(params.slug));

  const window = submissionWindow(edition);
  const notYet = window === "notYet";
  const closed = window === "closed";
  const open = window === "open";

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

  const edition = await orNotFound(da.editions.get(params.slug));

  try {
    const created = await da.abstracts.create(actor, {
      editionId: edition.id,
      title: "",
    });
    return redirect(`/abstracts/${created.id}/edit`);
  } catch (error) {
    return formError(error);
  }
}

export default function SubmitStart({ loaderData }: Route.ComponentProps) {
  const { edition, open, notYet, closed, mine } = loaderData;
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const error = actionData?.error ?? null;

  return (
    <div className="cap-column cap-stack" data-gap="6">
      <Stack gap={3}>
        <Title as="h1" size={2}>
          Submit an abstract
        </Title>
        <p>{edition.name}</p>
        {edition.submissionDeadline ? (
          <Text size="small" tone="muted">
            Submission deadline: {formatDate(edition.submissionDeadline, DATE_TIME)}
          </Text>
        ) : null}
        <Text size="small" tone="muted">
          Your abstract and its author names stay in the Meeting archive for good. Deleting your
          account later does not remove them.
        </Text>
      </Stack>

      {error ? (
        <p role="alert" className="cap-alert">
          {error}
        </p>
      ) : null}

      {notYet ? (
        <Banner tone="info">
          {edition.submissionOpensAt
            ? `Submission opens ${formatDate(edition.submissionOpensAt, DATE_TIME)}.`
            : "Submission is not open yet."}
        </Banner>
      ) : null}

      {closed ? <Banner tone="warn">The submission deadline has passed.</Banner> : null}

      {mine.length > 0 ? (
        <Stack as="section" gap={4}>
          <Title size={5}>Your abstracts for this meeting</Title>
          <ul className="divided">
            {mine.map((abstract) => (
              <li key={abstract.id} className="cap-spread row-pad">
                <span>
                  <RichText
                    as="span"
                    html={abstract.title}
                    fallback={<span className="cap-muted">Untitled</span>}
                  />{" "}
                  <Text as="span" size="small" tone="muted">
                    ({ABSTRACT_STATUS_LABELS[abstract.status]})
                  </Text>
                </span>
                <Text as={Link} to={`/abstracts/${abstract.id}/edit`} weight="strong">
                  Continue
                </Text>
              </li>
            ))}
          </ul>
        </Stack>
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
