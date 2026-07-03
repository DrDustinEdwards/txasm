import { redirect } from "react-router";
import type { Route } from "./+types/awards";

// The old static "all awards" page was the wrong model. The Awardees index is
// the canonical entry point now, so /awards permanently redirects there and old
// bookmarks survive.
//
// TODO (cutover redirects): the live site serves each award at a top-level slug
// (for example /s-e-sulkin-award). This app serves them under /awards/<slug>. At
// DNS cutover, add redirects from every live top-level award slug to
// /awards/<slug>, and keep /awardees at its current path, so existing links and
// search results are preserved.
export function loader(_args: Route.LoaderArgs) {
  throw redirect("/awardees");
}
