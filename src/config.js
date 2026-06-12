import "dotenv/config";

import { resolveDateRange } from "./utils/date.js";

const REQUIRED_ENV = [
  "POS_API_KEY",
  "POS_SHOP_ID",
  "DATABASE_URL",
  "LARK_APP_ID",
  "LARK_APP_SECRET",
];

const TABLE_TYPES = {
  production: {
    td: {
      order: "facebook_order_td",
      item: "facebook_order_item_td",
    },
    cd: {
      order: "facebook_order_cd",
      item: "facebook_order_item_cd",
    },
  },
  test: {
    td: {
      order: "facebook_order_td_test",
      item: "facebook_order_item_td_test",
    },
    cd: {
      order: "facebook_order_cd_test",
      item: "facebook_order_item_cd_test",
    },
  },
};

function parseBoolean(value, name) {
  if (value == null || value === "") return false;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes"].includes(normalized)) return true;
  if (["false", "0", "no"].includes(normalized)) return false;
  throw new Error(`${name} must be true or false`);
}

function parsePositiveInteger(value, name, fallback) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return parsed;
}

function parseSyncEnvironment(value) {
  const normalized = String(value || "production").trim().toLowerCase();
  if (!TABLE_TYPES[normalized]) {
    throw new Error("SYNC_ENV must be production or test");
  }
  return normalized;
}

export function loadConfig(env = process.env) {
  const missing = REQUIRED_ENV.filter((name) => !env[name]?.trim());
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  const syncLookbackDays = parsePositiveInteger(
    env.SYNC_LOOKBACK_DAYS,
    "SYNC_LOOKBACK_DAYS",
    14,
  );
  const dateRange = resolveDateRange({
    from: env.FROM,
    to: env.TO,
    lookbackDays: syncLookbackDays,
  });
  const syncEnvironment = parseSyncEnvironment(env.SYNC_ENV);

  return {
    pos: {
      apiKey: env.POS_API_KEY,
      shopId: env.POS_SHOP_ID,
    },
    databaseUrl: env.DATABASE_URL,
    databaseSslRejectUnauthorized: parseBoolean(
      env.DATABASE_SSL_REJECT_UNAUTHORIZED ?? "true",
      "DATABASE_SSL_REJECT_UNAUTHORIZED",
    ),
    lark: {
      appId: env.LARK_APP_ID,
      appSecret: env.LARK_APP_SECRET,
    },
    dateRange,
    dryRun: parseBoolean(env.DRY_RUN, "DRY_RUN"),
    syncEnvironment,
    tableTypes: TABLE_TYPES[syncEnvironment],
    syncLookbackDays,
    logLevel: env.LOG_LEVEL || "info",
    logPretty: parseBoolean(env.LOG_PRETTY, "LOG_PRETTY"),
  };
}
