import "dotenv/config";

import { mapOrder } from "../src/mappers/mapOrder.js";
import { mapOrderItems } from "../src/mappers/mapOrderItem.js";
import { fetchJsonWithRetry } from "../src/utils/retry.js";

const API_BASE = "https://open.larksuite.com/open-apis";
const TARGET_BASE_ID =
  process.env.LARK_TARGET_BASE_ID ?? "Df3WbKnmyaeUKJsphablcI8Jgeh";
const TEMPLATE_BASE_ID =
  process.env.LARK_TEMPLATE_BASE_ID ?? "HlQubD0ksa13z8sndtvlz2gSgVh";
const APPLY = process.env.APPLY === "true" || process.argv.includes("--apply");
const REQUEST_DELAY_MS = 650;

const TEMPLATES = {
  order: process.env.LARK_TEMPLATE_ORDER_TABLE_ID ?? "tblemP2P0H0TDsRc",
  item: process.env.LARK_TEMPLATE_ITEM_TABLE_ID ?? "tblgBf5wFHpY8rUW",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getToken() {
  const body = await fetchJsonWithRetry(
    `${API_BASE}/auth/v3/tenant_access_token/internal`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        app_id: process.env.LARK_APP_ID,
        app_secret: process.env.LARK_APP_SECRET,
      }),
    },
    { operation: "Lark schema token" },
  );
  if (body?.code !== 0 || !body.tenant_access_token) {
    throw new Error(`Lark token failed: [${body?.code}] ${body?.msg}`);
  }
  return body.tenant_access_token;
}

async function request(token, path, options = {}) {
  await sleep(REQUEST_DELAY_MS);
  const body = await fetchJsonWithRetry(`${API_BASE}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...options.headers,
    },
  }, { operation: `Lark schema ${path}` });
  if (body?.code !== 0) {
    throw new Error(`Lark schema request failed: [${body?.code}] ${body?.msg}`);
  }
  return body.data ?? {};
}

async function listTables(token, baseId) {
  const data = await request(
    token,
    `/bitable/v1/apps/${baseId}/tables?page_size=100`,
  );
  return data.items ?? [];
}

async function listFields(token, baseId, tableId) {
  const data = await request(
    token,
    `/bitable/v1/apps/${baseId}/tables/${tableId}/fields?page_size=100`,
  );
  return data.items ?? [];
}

async function createField(token, baseId, tableId, sourceField) {
  const payload = {
    field_name: sourceField.field_name,
    type: sourceField.type,
  };
  if (sourceField.property && Object.keys(sourceField.property).length) {
    payload.property = structuredClone(sourceField.property);
    if (Array.isArray(payload.property.options)) {
      payload.property.options = payload.property.options.map((option) => ({
        name: option.name,
        color: option.color,
      }));
    }
  }
  await request(
    token,
    `/bitable/v1/apps/${baseId}/tables/${tableId}/fields`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

function getRequiredFieldNames() {
  const sampleOrder = {
    system_id: "schema",
    inserted_at: "2026-01-01T00:00:00Z",
    items: [],
  };
  return {
    order: Object.keys(mapOrder(sampleOrder).fields),
    item: Object.keys(
      mapOrderItems(
        {
          ...sampleOrder,
          items: [{ id: "schema-item", variation_info: {} }],
        },
        {},
      )[0].fields,
    ),
  };
}

function getTableKind(tableName) {
  return /^Item(?: |_)/i.test(tableName) ? "item" : "order";
}

async function main() {
  if (!process.env.LARK_APP_ID || !process.env.LARK_APP_SECRET) {
    throw new Error("Missing LARK_APP_ID or LARK_APP_SECRET");
  }

  const token = await getToken();
  const requiredNames = getRequiredFieldNames();
  const templateFields = {};

  for (const kind of ["order", "item"]) {
    const fields = await listFields(
      token,
      TEMPLATE_BASE_ID,
      TEMPLATES[kind],
    );
    templateFields[kind] = new Map(
      fields.map((field) => [field.field_name, field]),
    );
    const unavailable = requiredNames[kind].filter(
      (name) => !templateFields[kind].has(name),
    );
    if (unavailable.length) {
      throw new Error(
        `${kind} template is missing fields: ${unavailable.join(", ")}`,
      );
    }
  }

  const tables = await listTables(token, TARGET_BASE_ID);
  const targets = tables.filter((table) =>
    /^(OD_T\d+|Item T\d+|OD_CD_\d+|Item_CD_\d+)$/.test(table.name),
  );
  if (targets.length !== 48) {
    throw new Error(`Expected 48 target tables, found ${targets.length}`);
  }

  const summary = [];
  for (const table of targets) {
    const kind = getTableKind(table.name);
    const targetFields = await listFields(token, TARGET_BASE_ID, table.table_id);
    const existingNames = new Set(targetFields.map((field) => field.field_name));
    const missing = requiredNames[kind].filter(
      (name) => name !== "Ngày TD" && !existingNames.has(name),
    );

    if (APPLY) {
      for (const fieldName of missing) {
        await createField(
          token,
          TARGET_BASE_ID,
          table.table_id,
          templateFields[kind].get(fieldName),
        );
      }
    }

    summary.push({
      table_name: table.name,
      table_id: table.table_id,
      missing_count: missing.length,
      missing_fields: missing,
      applied: APPLY && missing.length > 0,
    });
    console.log(JSON.stringify(summary.at(-1)));
  }

  console.log(
    JSON.stringify({
      target_base_id: TARGET_BASE_ID,
      tables: summary.length,
      missing_fields: summary.reduce(
        (total, table) => total + table.missing_count,
        0,
      ),
      apply: APPLY,
    }),
  );
}

main().catch((error) => {
  console.error(JSON.stringify({ level: "fatal", message: error.message }));
  process.exitCode = 1;
});
