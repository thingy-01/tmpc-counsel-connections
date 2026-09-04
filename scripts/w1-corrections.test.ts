import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { isAbsolute } from "node:path";
import test, { mock } from "node:test";
import { config } from "dotenv";
import { Pool } from "pg";
import {
  parsePracticeAreas,
  practiceAreaEntriesEqual,
  serializePracticeAreas,
} from "../src/lib/practice-areas";
import {
  hasStaffAdminMembership,
  configuredStaffOrganizationId,
  isActiveStaffAdmin,
  isStaffAdminMembership,
} from "../src/lib/staff-authorization";
import { logAttorneyAuthFailure } from "../src/app/attorney/safe-logging";
import { requireLocalTestDatabase } from "./test-database-guard";

mock.module("server-only", { defaultExport: {} });
mock.module("next/cache", {
  namedExports: { revalidatePath: () => undefined },
});

const testCookieValues = new Map<string, string>();
mock.module("next/headers", {
  namedExports: {
    cookies: async () => ({
      get: (name: string) => {
        const value = testCookieValues.get(name);
        return value === undefined ? undefined : { name, value };
      },
      set: (name: string, value: string) => {
        testCookieValues.set(name, value);
      },
      delete: (name: string) => {
        testCookieValues.delete(name);
      },
    }),
  },
});

const envFile = process.env.COUNSEL_TEST_ENV_FILE;
if (envFile) {
  if (!isAbsolute(envFile)) {
    throw new Error("COUNSEL_TEST_ENV_FILE must be an absolute path.");
  }
  const loaded = config({ path: envFile, quiet: true });
  if (loaded.error) throw new Error("Could not load COUNSEL_TEST_ENV_FILE.");
}

const databaseUrl = process.env.DATABASE_URL;
if (envFile) {
  requireLocalTestDatabase(databaseUrl, { requiredPort: "55432" });
}

async function createLocalEnrollment(pool: Pool, label: string) {
  const event = await pool.query<{ id: string }>(
    `insert into events (name, start_date, end_date)
     values ($1, date '2099-01-01', date '2099-01-02')
     returning id`,
    [`W1 correction test ${label}`]
  );
  const eventId = event.rows[0].id;
  const attorney = await pool.query<{ id: string }>(
    `insert into attorneys (event_id, first_name, last_name, email, firm)
     values ($1, 'Test', 'Attorney', $2, 'Test Firm')
     returning id`,
    [eventId, `${label}@example.invalid`]
  );
  return { attorneyId: attorney.rows[0].id, eventId };
}

test("staff authorization is scoped to the configured organization and role", async () => {
  const tmcp = "org_tmcp";
  assert.equal(
    isActiveStaffAdmin({ orgId: tmcp, orgRole: "org:admin" }, tmcp),
    true
  );
  assert.equal(
    isActiveStaffAdmin({ orgId: "org_other", orgRole: "org:admin" }, tmcp),
    false
  );
  assert.equal(
    isActiveStaffAdmin({ orgId: tmcp, orgRole: "org:member" }, tmcp),
    false
  );
  assert.equal(
    isActiveStaffAdmin({ orgId: tmcp, orgRole: "org:admin" }, null),
    false
  );
  assert.equal(
    isStaffAdminMembership(
      { role: "org:admin", organization: { id: "org_other" } },
      tmcp
    ),
    false
  );
  assert.equal(
    isStaffAdminMembership(
      { role: "org:member", organization: { id: tmcp } },
      tmcp
    ),
    false
  );

  const offsets: number[] = [];
  const found = await hasStaffAdminMembership(tmcp, async ({ limit, offset }) => {
    offsets.push(offset);
    if (offset === 0) {
      return {
        data: Array.from({ length: limit }, () => ({
          role: "org:admin",
          organization: { id: "org_other" },
        })),
        totalCount: 101,
      };
    }
    return {
      data: [{ role: "org:admin", organization: { id: tmcp } }],
      totalCount: 101,
    };
  });
  assert.equal(found, true);
  assert.deepEqual(offsets, [0, 100]);
});

test("production staff authorization fails loudly without its organization id", () => {
  const environment = process.env as Record<string, string | undefined>;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousOrganizationId = process.env.CLERK_ADMIN_ORG_ID;
  environment.NODE_ENV = "production";
  delete environment.CLERK_ADMIN_ORG_ID;
  try {
    assert.throws(() => configuredStaffOrganizationId(), /CLERK_ADMIN_ORG_ID/);
  } finally {
    if (previousNodeEnv === undefined) delete environment.NODE_ENV;
    else environment.NODE_ENV = previousNodeEnv;
    if (previousOrganizationId === undefined) delete environment.CLERK_ADMIN_ORG_ID;
    else environment.CLERK_ADMIN_ORG_ID = previousOrganizationId;
  }
});

test("attorney route boundary includes only the attorney tree", async () => {
  const { isIndependentAttorneyPath } = await import("../src/proxy");
  assert.equal(isIndependentAttorneyPath("/attorney"), true);
  assert.equal(isIndependentAttorneyPath("/attorney/login"), true);
  assert.equal(isIndependentAttorneyPath("/attorney/callback"), true);
  assert.equal(isIndependentAttorneyPath("/attorneys"), false);
  assert.equal(isIndependentAttorneyPath("/admin"), false);
});

test("shared practice parser preserves legacy fractions and marks new whole values", () => {
  const legacyPair = parsePracticeAreas([
    { area: "A", percent: 0.5 },
    { area: "B", percent: 0.5 },
  ]);
  assert.deepEqual(legacyPair.entries, [
    { area: "A", percent: 50 },
    { area: "B", percent: 50 },
  ]);
  assert.deepEqual(parsePracticeAreas([{ area: "A", percent: 1 }]).entries, [
    { area: "A", percent: 100 },
  ]);
  assert.deepEqual(
    parsePracticeAreas([{ area: "A", percent: 1 }], {
      percentageFormat: "auto",
    }).entries,
    [{ area: "A", percent: 100 }]
  );

  const whole = serializePracticeAreas([
    { area: "A", percent: 1 },
    { area: "B", percent: 99 },
  ]);
  assert.deepEqual(
    whole.map((entry) => entry.percentScale),
    ["whole", "whole"]
  );
  assert.deepEqual(parsePracticeAreas(whole).entries, [
    { area: "A", percent: 1 },
    { area: "B", percent: 99 },
  ]);

  const partial = parsePracticeAreas(
    serializePracticeAreas([{ area: "A", percent: 1 }])
  );
  assert.deepEqual(partial.entries, [{ area: "A", percent: 1 }]);
  assert.equal(partial.hasInvalidPercentageTotal, true);
  assert.equal(partial.hasAmbiguousLegacyScale, false);

  const anomalousLegacy = parsePracticeAreas([
    { area: "A", percent: 1 },
    { area: "B", percent: 1 },
  ]);
  assert.deepEqual(anomalousLegacy.entries, [
    { area: "A", percent: 1 },
    { area: "B", percent: 1 },
  ]);
  assert.equal(anomalousLegacy.hasAmbiguousLegacyScale, true);
  assert.equal(anomalousLegacy.hasInvalidPercentageTotal, true);

  const missing = parsePracticeAreas(["  Existing label  "]);
  assert.deepEqual(missing.entries, [{ area: "  Existing label  " }]);
  assert.equal(missing.hasMissingPercentages, true);
  assert.equal(
    practiceAreaEntriesEqual(missing.entries, [{ area: "  Existing label  " }]),
    true
  );
});

test("attorney auth logging emits allowlisted metadata only", () => {
  const synthetic = "distinctive-attorney@example.invalid";
  const messages: string[] = [];
  logAttorneyAuthFailure(
    "delivery",
    new Error(`query params: ${synthetic}; token=secret; DATABASE_URL=secret`),
    (message) => messages.push(message)
  );
  assert.deepEqual(messages, [
    '{"event":"attorney_auth_failure","operation":"delivery","code":"internal_error"}',
  ]);
  assert.equal(messages.join("\n").includes(synthetic), false);
  assert.equal(messages.join("\n").includes("token=secret"), false);
  assert.equal(messages.join("\n").includes("DATABASE_URL"), false);
});

test("assigned contact projection excludes unrelated attorney contact data", async () => {
  const { assignedAttorneyContact } = await import(
    "../src/app/portal/schedule/data"
  );
  const contact = {
    email: "assigned-attorney@example.invalid",
    phone: "555-0100",
    ignoredStaffNote: "private",
  };
  assert.deepEqual(assignedAttorneyContact(contact, true), {
    contact: { email: contact.email, phone: contact.phone },
  });
  assert.deepEqual(assignedAttorneyContact(contact, false), {});
  assert.equal(
    JSON.stringify(assignedAttorneyContact(contact, false)).includes(contact.email),
    false
  );
  assert.equal(
    JSON.stringify(assignedAttorneyContact(contact, true)).includes("private"),
    false
  );
});

test("same-origin policy accepts a browser no-referrer form shape", async () => {
  const { isSameOriginRequest } = await import("../src/lib/same-origin");
  const url = "https://counsel.example/attorney/callback";
  assert.equal(isSameOriginRequest(new Request(url)), false);

  const browserFormHeaders = {
    origin: "null",
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "navigate",
    "sec-fetch-dest": "document",
    "content-type": "application/x-www-form-urlencoded",
  };
  assert.equal(
    isSameOriginRequest(
      new Request(url, { method: "POST", headers: browserFormHeaders })
    ),
    true
  );
  assert.equal(
    isSameOriginRequest(
      new Request(url, { method: "POST", headers: { origin: "null" } })
    ),
    false
  );
  assert.equal(
    isSameOriginRequest(
      new Request(url, {
        method: "POST",
        headers: { ...browserFormHeaders, "sec-fetch-site": "cross-site" },
      })
    ),
    false
  );
  assert.equal(
    isSameOriginRequest(
      new Request(url, {
        method: "POST",
        headers: { ...browserFormHeaders, "sec-fetch-site": "same-site" },
      })
    ),
    false
  );
  assert.equal(
    isSameOriginRequest(
      new Request(url, {
        method: "POST",
        headers: { "sec-fetch-site": "same-origin" },
      })
    ),
    true
  );
  assert.equal(
    isSameOriginRequest(
      new Request(url, {
        headers: {
          origin: "https://attacker.example",
          "sec-fetch-site": "same-origin",
        },
      })
    ),
    false
  );
  assert.equal(
    isSameOriginRequest(
      new Request(url, { headers: { origin: "https://counsel.example" } })
    ),
    true
  );
  const logout = await import("../src/app/attorney/logout/route");
  const response = await logout.POST(
    new Request("https://counsel.example/attorney/logout", {
      method: "POST",
      headers: { origin: "https://attacker.example" },
    })
  );
  assert.equal(response.status, 403);
});

test("production POST policy uses the configured public origin behind a proxy", async () => {
  const { isSameOriginRequest } = await import("../src/lib/same-origin");
  const environment = process.env as Record<string, string | undefined>;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  environment.NODE_ENV = "production";
  environment.NEXT_PUBLIC_APP_URL = "https://counsel.example/public-path";
  try {
    const internalUrl = "http://internal.service:3000/attorney/logout";
    assert.equal(
      isSameOriginRequest(
        new Request(internalUrl, {
          method: "POST",
          headers: { origin: "https://counsel.example" },
        })
      ),
      true
    );
    assert.equal(
      isSameOriginRequest(
        new Request(internalUrl, {
          method: "POST",
          headers: { origin: "http://internal.service:3000" },
        })
      ),
      false
    );
    environment.NEXT_PUBLIC_APP_URL = "http://counsel.example";
    assert.equal(
      isSameOriginRequest(
        new Request(internalUrl, {
          method: "POST",
          headers: { origin: "http://counsel.example" },
        })
      ),
      false
    );
  } finally {
    if (previousNodeEnv === undefined) delete environment.NODE_ENV;
    else environment.NODE_ENV = previousNodeEnv;
    if (previousAppUrl === undefined) delete environment.NEXT_PUBLIC_APP_URL;
    else environment.NEXT_PUBLIC_APP_URL = previousAppUrl;
  }
});

test("magic-link request redirects away from Railway's internal origin", async () => {
  const mutableEnvironment = process.env as Record<string, string | undefined>;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  mutableEnvironment.NODE_ENV = "production";
  mutableEnvironment.NEXT_PUBLIC_APP_URL = "https://counsel-connections.org";
  try {
    const requestRoute = await import(
      "../src/app/attorney/login/request/route"
    );
    const response = await requestRoute.POST(
      new Request("https://localhost:8080/attorney/login/request", {
        method: "POST",
        body: new URLSearchParams({ email: "invalid" }),
      })
    );
    assert.equal(response.status, 303);
    assert.equal(
      response.headers.get("location"),
      "https://counsel-connections.org/attorney/login?sent=1"
    );
  } finally {
    if (previousNodeEnv === undefined) delete mutableEnvironment.NODE_ENV;
    else mutableEnvironment.NODE_ENV = previousNodeEnv;
    if (previousAppUrl === undefined) delete mutableEnvironment.NEXT_PUBLIC_APP_URL;
    else mutableEnvironment.NEXT_PUBLIC_APP_URL = previousAppUrl;
  }
});

test("interviewer update returns an expired-session result", async () => {
  const previousDevAuth = process.env.DEV_AUTH;
  process.env.DEV_AUTH = "admin";
  try {
    const actions = await import("../src/app/portal/interviewers/actions");
    const form = new FormData();
    form.set("id", randomUUID());
    form.set("name", "Synthetic interviewer");
    assert.deepEqual(await actions.updateInterviewer(form), {
      ok: false,
      error: "Your company session has expired.",
    });
  } finally {
    if (previousDevAuth === undefined) delete process.env.DEV_AUTH;
    else process.env.DEV_AUTH = previousDevAuth;
  }
});

test("misconfigured production attorney callback fails closed without a 500", async () => {
  const callback = await import("../src/app/attorney/callback/route");
  const mutableEnvironment = process.env as Record<string, string | undefined>;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousSecret = process.env.ATTORNEY_SESSION_SECRET;
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  mutableEnvironment.NODE_ENV = "production";
  mutableEnvironment.NEXT_PUBLIC_APP_URL = "https://counsel.example";
  delete mutableEnvironment.ATTORNEY_SESSION_SECRET;
  try {
    const response = await callback.GET(
      new Request("https://localhost:8080/attorney/callback?token=invalid")
    );
    assert.equal(response.status, 303);
    assert.equal(
      response.headers.get("location"),
      "https://counsel.example/attorney/login?error=unavailable"
    );
  } finally {
    if (previousNodeEnv === undefined) delete mutableEnvironment.NODE_ENV;
    else mutableEnvironment.NODE_ENV = previousNodeEnv;
    if (previousSecret === undefined) delete mutableEnvironment.ATTORNEY_SESSION_SECRET;
    else mutableEnvironment.ATTORNEY_SESSION_SECRET = previousSecret;
    if (previousAppUrl === undefined) delete mutableEnvironment.NEXT_PUBLIC_APP_URL;
    else mutableEnvironment.NEXT_PUBLIC_APP_URL = previousAppUrl;
  }
});

test("invalid attorney callback redirects to the public login origin", async () => {
  const callback = await import("../src/app/attorney/callback/route");
  const mutableEnvironment = process.env as Record<string, string | undefined>;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousSecret = process.env.ATTORNEY_SESSION_SECRET;
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  mutableEnvironment.NODE_ENV = "production";
  mutableEnvironment.ATTORNEY_SESSION_SECRET = "a".repeat(32);
  mutableEnvironment.NEXT_PUBLIC_APP_URL = "https://counsel-connections.org";
  testCookieValues.clear();
  try {
    const response = await callback.GET(
      new Request("http://railway.internal:8080/attorney/callback?token=invalid")
    );
    assert.equal(response.status, 303);
    assert.equal(
      response.headers.get("location"),
      "https://counsel-connections.org/attorney/login?error=invalid"
    );
    assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
    assert.equal(testCookieValues.has("tmcp_attorney"), false);
  } finally {
    testCookieValues.clear();
    if (previousNodeEnv === undefined) delete mutableEnvironment.NODE_ENV;
    else mutableEnvironment.NODE_ENV = previousNodeEnv;
    if (previousSecret === undefined) delete mutableEnvironment.ATTORNEY_SESSION_SECRET;
    else mutableEnvironment.ATTORNEY_SESSION_SECRET = previousSecret;
    if (previousAppUrl === undefined) delete mutableEnvironment.NEXT_PUBLIC_APP_URL;
    else mutableEnvironment.NEXT_PUBLIC_APP_URL = previousAppUrl;
  }
});

test(
  "interviewer edits validate ownership and stop when scheduling closes",
  { skip: !envFile },
  async () => {
    requireLocalTestDatabase(databaseUrl, { requiredPort: "55432" });
    assert.ok(databaseUrl);
    const pool = new Pool({ connectionString: databaseUrl });
    const label = randomUUID();
    let eventId: string | undefined;
    const previousDevAuth = process.env.DEV_AUTH;

    try {
      const event = await pool.query<{ id: string }>(
        `insert into events (name, start_date, end_date, status)
         values ($1, date '2099-01-01', date '2099-01-02', 'open')
         returning id`,
        [`Interviewer action test ${label}`]
      );
      eventId = event.rows[0].id;
      const company = await pool.query<{ id: string }>(
        `insert into companies (event_id, name) values ($1, $2) returning id`,
        [eventId, `Interviewer company ${label}`]
      );
      const companyId = company.rows[0].id;
      const interviewer = await pool.query<{ id: string }>(
        `insert into company_interviewers (company_id, name)
         values ($1, 'Before') returning id`,
        [companyId]
      );
      const interviewerId = interviewer.rows[0].id;
      process.env.DEV_AUTH = `company:${companyId}`;
      const actions = await import(
        "../src/app/portal/interviewers/actions"
      );

      const valid = new FormData();
      valid.set("id", interviewerId);
      valid.set("name", "After");
      assert.deepEqual(await actions.updateInterviewer(valid), { ok: true });

      const forged = new FormData();
      forged.set("id", randomUUID());
      forged.set("name", "Forged");
      assert.equal((await actions.updateInterviewer(forged)).ok, false);

      await pool.query(`update events set status = 'closed' where id = $1`, [
        eventId,
      ]);
      assert.deepEqual(await actions.updateInterviewer(valid), {
        ok: false,
        error: "Scheduling is closed for this event.",
      });
      const remove = new FormData();
      remove.set("id", interviewerId);
      assert.deepEqual(await actions.deleteInterviewer(remove), {
        ok: false,
        error: "Scheduling is closed for this event.",
      });
      const unchanged = await pool.query<{ name: string }>(
        `select name from company_interviewers where id = $1`,
        [interviewerId]
      );
      assert.equal(unchanged.rows[0].name, "After");
    } finally {
      if (previousDevAuth === undefined) delete process.env.DEV_AUTH;
      else process.env.DEV_AUTH = previousDevAuth;
      if (eventId) await pool.query(`delete from events where id = $1`, [eventId]);
      await pool.end();
    }
  }
);

test(
  "scanner GETs preserve an attorney token and browser POST consumes it once",
  { skip: !envFile },
  async () => {
    requireLocalTestDatabase(databaseUrl, { requiredPort: "55432" });
    assert.ok(databaseUrl);
    const pool = new Pool({ connectionString: databaseUrl });
    const auth = await import("../src/app/attorney/auth");
    const callback = await import("../src/app/attorney/callback/route");
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiredToken = randomBytes(32).toString("base64url");
    const expiredHash = createHash("sha256").update(expiredToken).digest("hex");
    let testEventId: string | undefined;
    const mutableEnvironment = process.env as Record<string, string | undefined>;
    const previousNodeEnv = process.env.NODE_ENV;
    const previousSecret = process.env.ATTORNEY_SESSION_SECRET;
    const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;

    try {
      const enrollment = await createLocalEnrollment(pool, randomUUID());
      testEventId = enrollment.eventId;
      await pool.query(
        `insert into attorney_tokens (attorney_id, event_id, token_hash, expires_at)
         values ($1, $2, $3, now() + interval '15 minutes'),
                ($1, $2, $4, now() - interval '1 minute')`,
        [enrollment.attorneyId, enrollment.eventId, tokenHash, expiredHash]
      );

      mutableEnvironment.NODE_ENV = "production";
      mutableEnvironment.ATTORNEY_SESSION_SECRET = "a".repeat(32);
      mutableEnvironment.NEXT_PUBLIC_APP_URL = "https://counsel-connections.org";
      testCookieValues.clear();

      const callbackUrl = `http://railway.internal:8080/attorney/callback?token=${token}`;
      const firstGet = await callback.GET(new Request(callbackUrl));
      const secondGet = await callback.GET(new Request(callbackUrl));
      assert.equal(firstGet.status, 200);
      assert.equal(secondGet.status, 200);
      assert.equal(firstGet.headers.get("cache-control"), "private, no-store, max-age=0");
      assert.equal(firstGet.headers.get("referrer-policy"), "no-referrer");
      const contentSecurityPolicy =
        firstGet.headers.get("content-security-policy") ?? "";
      const nonceMatch = contentSecurityPolicy.match(
        /script-src 'nonce-([A-Za-z0-9+/=]+)'/
      );
      assert.ok(nonceMatch);
      const html = await firstGet.text();
      assert.match(html, /action="https:\/\/counsel-connections\.org\/attorney\/callback"/);
      assert.match(html, /method="post"/);
      assert.match(html, /requestSubmit\(\)/);
      assert.doesNotMatch(html, /<img|<link|src=/i);
      assert.ok(html.includes(`nonce="${nonceMatch[1]}"`));
      assert.equal(testCookieValues.has("tmcp_attorney"), false);
      assert.equal(await auth.isAttorneyTokenAvailable(token), true);

      const browserHeaders = {
        origin: "https://counsel-connections.org",
        "content-type": "application/x-www-form-urlencoded",
      };
      const foreignPost = await callback.POST(
        new Request("http://railway.internal:8080/attorney/callback", {
          method: "POST",
          headers: { ...browserHeaders, origin: "https://attacker.example" },
          body: new URLSearchParams({ token }),
        })
      );
      assert.equal(foreignPost.status, 303);
      assert.equal(await auth.isAttorneyTokenAvailable(token), true);

      const firstPost = await callback.POST(
        new Request("http://railway.internal:8080/attorney/callback", {
          method: "POST",
          headers: browserHeaders,
          body: new URLSearchParams({ token }),
        })
      );
      assert.equal(firstPost.status, 303);
      assert.equal(
        firstPost.headers.get("location"),
        "https://counsel-connections.org/attorney/schedule"
      );
      assert.match(testCookieValues.get("tmcp_attorney") ?? "", /^[^.]+\.[A-Za-z0-9_-]+$/);

      testCookieValues.clear();
      const replayPost = await callback.POST(
        new Request("http://railway.internal:8080/attorney/callback", {
          method: "POST",
          headers: browserHeaders,
          body: new URLSearchParams({ token }),
        })
      );
      assert.equal(replayPost.status, 303);
      assert.equal(
        replayPost.headers.get("location"),
        "https://counsel-connections.org/attorney/login?error=invalid"
      );
      assert.equal(testCookieValues.has("tmcp_attorney"), false);
      assert.equal(await auth.consumeAttorneyToken(token), null);
      const expiredGet = await callback.GET(
        new Request(
          `http://railway.internal:8080/attorney/callback?token=${expiredToken}`
        )
      );
      assert.equal(expiredGet.status, 303);
      assert.equal(
        expiredGet.headers.get("location"),
        "https://counsel-connections.org/attorney/login?error=invalid"
      );
      assert.equal(await auth.consumeAttorneyToken(expiredToken), null);
    } finally {
      testCookieValues.clear();
      if (previousNodeEnv === undefined) delete mutableEnvironment.NODE_ENV;
      else mutableEnvironment.NODE_ENV = previousNodeEnv;
      if (previousSecret === undefined) delete mutableEnvironment.ATTORNEY_SESSION_SECRET;
      else mutableEnvironment.ATTORNEY_SESSION_SECRET = previousSecret;
      if (previousAppUrl === undefined) delete mutableEnvironment.NEXT_PUBLIC_APP_URL;
      else mutableEnvironment.NEXT_PUBLIC_APP_URL = previousAppUrl;
      await pool.query(
        `delete from attorney_tokens where token_hash = any($1::text[])`,
        [[tokenHash, expiredHash]]
      );
      if (testEventId) {
        await pool.query(`delete from events where id = $1`, [testEventId]);
      }
      await pool.end();
    }
  }
);

test(
  "local cleanup is bounded and preserves an active shared rate-limit budget",
  { skip: !envFile },
  async () => {
    requireLocalTestDatabase(databaseUrl, { requiredPort: "55432" });
    assert.ok(databaseUrl);
    const pool = new Pool({ connectionString: databaseUrl });
    const auth = await import("../src/app/attorney/auth");
    const loginRequest = await import(
      "../src/app/attorney/login/request/route"
    );
    const prefix = `w1-${randomUUID()}-`;
    const activeEmail = `${prefix}active@example.invalid`;
    let testEventId: string | undefined;

    try {
      const malformed = `${prefix}not-an-email`;
      const malformedResponse = await loginRequest.POST(
        new Request("http://127.0.0.1/attorney/login/request", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ email: malformed }),
        })
      );
      assert.equal(malformedResponse.status, 303);
      const malformedRows = await pool.query<{ count: string }>(
        `select count(*)::text as count
           from attorney_login_rate_limits
          where normalized_email = $1`,
        [malformed]
      );
      assert.equal(malformedRows.rows[0].count, "0");

      const enrollment = await createLocalEnrollment(pool, randomUUID());
      testEventId = enrollment.eventId;
      await pool.query(
        `insert into attorney_tokens (attorney_id, event_id, token_hash, expires_at)
         select $1, $2, $3 || value::text, now() - interval '2 days'
           from generate_series(1, 101) as value`,
        [enrollment.attorneyId, enrollment.eventId, prefix]
      );
      await pool.query(
        `insert into attorney_login_rate_limits
           (normalized_email, window_started_at, attempts)
         select $1 || value::text || '@example.invalid', now() - interval '2 days', 1
           from generate_series(1, 101) as value`,
        [prefix]
      );
      await pool.query(
        `insert into attorney_login_rate_limits
           (normalized_email, window_started_at, attempts)
         values ($1, now(), 2)`,
        [activeEmail]
      );

      await auth.cleanupExpiredAttorneyAuthRows();
      const oldTokens = await pool.query<{ count: string }>(
        `select count(*)::text as count from attorney_tokens where token_hash like $1`,
        [`${prefix}%`]
      );
      const oldRates = await pool.query<{ count: string }>(
        `select count(*)::text as count
           from attorney_login_rate_limits
          where normalized_email like $1 and normalized_email <> $2`,
        [`${prefix}%`, activeEmail]
      );
      assert.equal(oldTokens.rows[0].count, "1");
      assert.equal(oldRates.rows[0].count, "1");

      assert.equal(await auth.claimAttorneyDeliveryAttempt(activeEmail), true);
      assert.equal(await auth.claimAttorneyDeliveryAttempt(activeEmail), false);
      const active = await pool.query<{ attempts: number }>(
        `select attempts from attorney_login_rate_limits where normalized_email = $1`,
        [activeEmail]
      );
      assert.equal(active.rows[0].attempts, 4);
    } finally {
      await pool.query(`delete from attorney_tokens where token_hash like $1`, [
        `${prefix}%`,
      ]);
      await pool.query(
        `delete from attorney_login_rate_limits where normalized_email like $1`,
        [`${prefix}%`]
      );
      if (testEventId) {
        await pool.query(`delete from events where id = $1`, [testEventId]);
      }
      await pool.end();
    }
  }
);
