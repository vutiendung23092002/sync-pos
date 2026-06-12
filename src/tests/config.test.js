import test from "node:test";
import assert from "node:assert/strict";

import { loadConfig } from "../config.js";

const baseEnv = {
  POS_API_KEY: "pos-key",
  POS_SHOP_ID: "shop-id",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/postgres",
  LARK_APP_ID: "app-id",
  LARK_APP_SECRET: "app-secret",
  FROM: "2026-03-01",
  TO: "2026-03-01",
};

test("production environment uses production table types by default", () => {
  const config = loadConfig(baseEnv);
  assert.equal(config.syncEnvironment, "production");
  assert.equal(config.databaseSslRejectUnauthorized, true);
  assert.deepEqual(config.tableTypes, {
    td: {
      order: "facebook_order_td",
      item: "facebook_order_item_td",
    },
    cd: {
      order: "facebook_order_cd",
      item: "facebook_order_item_cd",
    },
  });
});

test("database certificate verification can be explicitly disabled", () => {
  const config = loadConfig({
    ...baseEnv,
    DATABASE_SSL_REJECT_UNAUTHORIZED: "false",
  });
  assert.equal(config.databaseSslRejectUnauthorized, false);
});

test("test environment only uses test table types", () => {
  const config = loadConfig({ ...baseEnv, SYNC_ENV: "test" });
  assert.equal(config.syncEnvironment, "test");
  assert.deepEqual(config.tableTypes, {
    td: {
      order: "facebook_order_td_test",
      item: "facebook_order_item_td_test",
    },
    cd: {
      order: "facebook_order_cd_test",
      item: "facebook_order_item_cd_test",
    },
  });
});

test("invalid sync environment throws", () => {
  assert.throws(
    () => loadConfig({ ...baseEnv, SYNC_ENV: "staging" }),
    /SYNC_ENV must be production or test/,
  );
});
