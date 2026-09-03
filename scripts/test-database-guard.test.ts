import assert from "node:assert/strict";
import test from "node:test";
import { requireLocalTestDatabase } from "./test-database-guard";

test("database test guard accepts only explicit local hosts", () => {
  assert.equal(
    requireLocalTestDatabase("postgresql://tester:example@localhost:5432/test").hostname,
    "localhost"
  );
  assert.equal(
    requireLocalTestDatabase("postgresql://tester:example@127.0.0.1:55432/test", {
      requiredPort: "55432",
    }).port,
    "55432"
  );
  assert.throws(
    () => requireLocalTestDatabase("postgresql://tester:example@db.example.com/test"),
    /must use 127\.0\.0\.1 or localhost/
  );
  assert.throws(
    () =>
      requireLocalTestDatabase("postgresql://tester:example@localhost:5432/test", {
        requiredPort: "55432",
      }),
    /local port 55432/
  );
});
