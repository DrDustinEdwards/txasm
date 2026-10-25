import { test } from "node:test";
import assert from "node:assert/strict";
import { adminAccessOk, safeAdminNext } from "../app/lib/access.server";

// Platform admin pages open only through Cloudflare Access. Unconfigured, nobody
// passes, and the dev bypass never works off localhost.
test("the admin Access check fails closed", async () => {
  const env = { ACCESS_DEV_BYPASS: "1" } as Env;
  const live = new Request("https://txasm.example.com/admin");
  assert.equal(await adminAccessOk(env, live, "admin@example.com"), false);
  assert.equal(await adminAccessOk(env, new Request("http://localhost/admin"), "admin@example.com"), true);
  assert.equal(await adminAccessOk({} as Env, new Request("http://localhost/admin"), "admin@example.com"), false);
});

test("Access sends an admin back only to an admin page", () => {
  assert.equal(safeAdminNext("/admin/officers?x=1"), "/admin/officers?x=1");
  for (const bad of [null, "//evil.example.com/admin", "https://evil.example.com", "/admin/access?next=/admin"]) {
    assert.equal(safeAdminNext(bad), "/admin");
  }
});
