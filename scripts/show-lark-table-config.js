import "dotenv/config";

import { createDbClient } from "../src/clients/dbClient.js";
import { createLarkClient } from "../src/clients/larkClient.js";
import { LARK_TABLE_CONFIG_MAPPING } from "../src/config/larkTableMapping.js";

function getOption(name, fallback) {
  const prefix = `--${name}=`;
  const argument = process.argv.slice(2).find((item) => item.startsWith(prefix));
  return argument ? argument.slice(prefix.length).trim() : fallback;
}

function parseSource() {
  const source = getOption("source", "database").toLowerCase();
  if (!["database", "mapping"].includes(source)) {
    throw new Error("--source must be database or mapping");
  }
  return source;
}

function parseEnvironment() {
  const environment = getOption("env", "all").toLowerCase();
  if (!["all", "production", "test"].includes(environment)) {
    throw new Error("--env must be all, production or test");
  }
  return environment;
}

function parseBoolean(value, fallback) {
  if (value == null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes"].includes(normalized)) return true;
  if (["false", "0", "no"].includes(normalized)) return false;
  throw new Error("DATABASE_SSL_REJECT_UNAUTHORIZED must be true or false");
}

function normalizeRows(rows) {
  return rows
    .map((row) => ({
      environment: row.type.endsWith("_test") ? "test" : "production",
      type: row.type,
      month: Number(row.month),
      base_id: row.base_id,
      table_id: row.table_id,
      setting_table_name: row.table_name ?? "",
    }))
    .sort(
      (left, right) =>
        left.environment.localeCompare(right.environment) ||
        left.type.localeCompare(right.type) ||
        left.month - right.month,
    );
}

function filterRows(rows, { environment, type }) {
  return rows.filter(
    (row) =>
      (environment === "all" || row.environment === environment) &&
      (!type || row.type === type),
  );
}

function validateRows(rows) {
  const counts = new Map();
  for (const row of rows) {
    const key = `${row.type}:${row.month}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const duplicates = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({ key, count }));
  const missing = [];
  for (const type of new Set(rows.map((row) => row.type))) {
    for (let month = 1; month <= 12; month += 1) {
      if (!counts.has(`${type}:${month}`)) {
        missing.push({ type, month });
      }
    }
  }
  return { duplicates, missing };
}

async function loadDatabaseRows() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for --source=database");
  }
  const dbClient = createDbClient({
    connectionString: process.env.DATABASE_URL,
    sslRejectUnauthorized: parseBoolean(
      process.env.DATABASE_SSL_REJECT_UNAUTHORIZED,
      true,
    ),
  });
  try {
    const result = await dbClient.query(
      `SELECT base_id, table_id, table_name, type, month
       FROM han_lark_base.tables_pos
       ORDER BY type, month;`,
    );
    return result.rows;
  } finally {
    await dbClient.close();
  }
}

function loadMappingRows() {
  return Object.values(LARK_TABLE_CONFIG_MAPPING).flat();
}

async function enrichWithLarkTableNames(rows) {
  if (!process.env.LARK_APP_ID || !process.env.LARK_APP_SECRET) {
    throw new Error(
      "LARK_APP_ID and LARK_APP_SECRET are required to resolve Lark table names",
    );
  }

  const larkClient = createLarkClient();
  const token = await larkClient.getTenantAccessToken({
    appId: process.env.LARK_APP_ID,
    appSecret: process.env.LARK_APP_SECRET,
  });
  const tablesByBase = new Map();

  for (const baseId of new Set(rows.map((row) => row.base_id))) {
    const tables = await larkClient.listTables({ token, baseId });
    tablesByBase.set(
      baseId,
      new Map(tables.map((table) => [table.table_id, table.name])),
    );
  }

  return rows.map((row) => {
    const tableName = tablesByBase.get(row.base_id)?.get(row.table_id);
    return {
      ...row,
      table_name: tableName ?? "NOT_FOUND",
      lark_status: tableName ? "OK" : "NOT_FOUND",
    };
  });
}

async function main() {
  const source = parseSource();
  const environment = parseEnvironment();
  const type = getOption("type", "");
  const sourceRows =
    source === "database" ? await loadDatabaseRows() : loadMappingRows();
  const allRows = normalizeRows(sourceRows);
  const filteredRows = filterRows(allRows, { environment, type });
  const rows = await enrichWithLarkTableNames(filteredRows);
  const validation = validateRows(rows);
  const larkNotFound = rows
    .filter((row) => row.lark_status !== "OK")
    .map((row) => ({
      type: row.type,
      month: row.month,
      base_id: row.base_id,
      table_id: row.table_id,
    }));

  console.log(
    JSON.stringify({
      source,
      environment,
      type: type || "all",
      records: rows.length,
    }),
  );
  console.table(rows);
  console.log(
    JSON.stringify({
      records: rows.length,
      types: new Set(rows.map((row) => row.type)).size,
      missing: validation.missing,
      duplicates: validation.duplicates,
      lark_not_found: larkNotFound,
    }),
  );

  if (
    validation.missing.length ||
    validation.duplicates.length ||
    larkNotFound.length
  ) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      level: "fatal",
      message: error.message,
      stack: error.stack,
    }),
  );
  process.exitCode = 1;
});
