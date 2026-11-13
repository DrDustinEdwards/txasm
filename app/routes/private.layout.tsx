import { PRIVATE_PAGE_HEADERS } from "@dustinedwards/site-runtime/edge-cache";
import { Outlet } from "react-router";

// The sign-in, account, submission and review pages: private pages, so no-transform keeps Cloudflare's Web Analytics
// beacon out and only public pages are counted; the Worker compresses them itself (site-runtime PRIVATE_PAGE_HEADERS).
export const headers = () => PRIVATE_PAGE_HEADERS;

export default function PrivatePages() {
  return <Outlet />;
}
