import assert from "node:assert/strict";
import test from "node:test";
import { publicAppUrl } from "./public-app-url";

const environment = process.env as Record<string, string | undefined>;

function restoreEnvironment(
  previousNodeEnv: string | undefined,
  previousAppUrl: string | undefined
) {
  if (previousNodeEnv === undefined) delete environment.NODE_ENV;
  else environment.NODE_ENV = previousNodeEnv;
  if (previousAppUrl === undefined) delete environment.NEXT_PUBLIC_APP_URL;
  else environment.NEXT_PUBLIC_APP_URL = previousAppUrl;
}

test("production attorney redirects use the public origin behind Railway", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  environment.NODE_ENV = "production";
  environment.NEXT_PUBLIC_APP_URL = "https://counsel-connections.org";

  try {
    const request = new Request(
      "https://localhost:8080/attorney/callback?token=incoming-token"
    );
    const destinations = [
      "/attorney/login?sent=1",
      "/attorney/login?error=invalid",
      "/attorney/login?error=unavailable",
      "/attorney",
      "/attorney/login",
    ];

    assert.deepEqual(
      destinations.map((path) => publicAppUrl(request, path).href),
      destinations.map((path) => `https://counsel-connections.org${path}`)
    );
    assert.equal(
      new URL(request.url).searchParams.get("token"),
      "incoming-token"
    );
  } finally {
    restoreEnvironment(previousNodeEnv, previousAppUrl);
  }
});

test("production public URL configuration fails closed", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  environment.NODE_ENV = "production";
  const request = new Request("https://localhost:8080/attorney/login/request");

  try {
    for (const configured of [
      undefined,
      "not a url",
      "http://counsel-connections.org",
      "https://localhost:8080",
      "https://user@example.com",
      "https://counsel-connections.org/application",
      "https://counsel-connections.org?redirect=elsewhere",
    ]) {
      if (configured === undefined) delete environment.NEXT_PUBLIC_APP_URL;
      else environment.NEXT_PUBLIC_APP_URL = configured;
      assert.throws(
        () => publicAppUrl(request, "/attorney/login"),
        /NEXT_PUBLIC_APP_URL/
      );
    }
  } finally {
    restoreEnvironment(previousNodeEnv, previousAppUrl);
  }
});

test("local and test redirects retain the incoming HTTP origin", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  environment.NODE_ENV = "test";
  environment.NEXT_PUBLIC_APP_URL = "https://counsel-connections.org";

  try {
    assert.equal(
      publicAppUrl(
        new Request("http://127.0.0.1:3000/attorney/callback"),
        "/attorney"
      ).href,
      "http://127.0.0.1:3000/attorney"
    );
  } finally {
    restoreEnvironment(previousNodeEnv, previousAppUrl);
  }
});
