import { chunk } from "../utils/batch.js";
import { fetchJsonWithRetry } from "../utils/retry.js";

const LARK_API_BASE = "https://open.larksuite.com/open-apis";

function assertLarkSuccess(body, operation) {
  if (!body || typeof body !== "object") {
    throw new Error(`${operation} returned an unexpected response shape`);
  }
  if (body.code !== 0) {
    throw new Error(`${operation} failed: [${body.code}] ${body.msg || "Unknown error"}`);
  }
  return body.data ?? {};
}

export function createLarkClient({ fetchImpl = fetch, logger, batchSize = 100 } = {}) {
  async function request(url, options, operation) {
    const body = await fetchJsonWithRetry(url, options, {
      fetchImpl,
      logger,
      operation,
    });
    return assertLarkSuccess(body, operation);
  }

  async function getTenantAccessToken({ appId, appSecret }) {
    const body = await fetchJsonWithRetry(
      `${LARK_API_BASE}/auth/v3/tenant_access_token/internal`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
      },
      { fetchImpl, logger, operation: "Lark tenant access token" },
    );
    if (!body || typeof body !== "object" || body.code !== 0) {
      throw new Error(
        `Lark tenant access token failed: [${body?.code ?? "unknown"}] ${body?.msg || "Unexpected response"}`,
      );
    }
    const token = body.tenant_access_token;
    if (!token) throw new Error("Lark token response is missing tenant_access_token");
    return token;
  }

  async function searchAllRecords({ token, baseId, tableId }) {
    const startedAt = Date.now();
    const records = [];
    let pageToken = null;
    let page = 0;

    do {
      page += 1;
      const url = new URL(
        `${LARK_API_BASE}/bitable/v1/apps/${encodeURIComponent(baseId)}/tables/${encodeURIComponent(tableId)}/records/search`,
      );
      url.searchParams.set("user_id_type", "open_id");
      url.searchParams.set("page_size", "500");
      if (pageToken) url.searchParams.set("page_token", pageToken);

      const data = await request(
        url,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ automatic_fields: false }),
        },
        `Lark search ${tableId}`,
      );

      const items = data.items ?? [];
      if (!Array.isArray(items)) {
        throw new Error(`Lark search ${tableId} returned invalid items`);
      }
      records.push(...items);
      logger?.info(
        {
          step: "lark_scan_page",
          table_id: tableId,
          page,
          page_records: items.length,
          accumulated_records: records.length,
          has_more: data.has_more === true,
        },
        `Lark scan page ${page} fetched`,
      );

      if (data.has_more === true && !data.page_token) {
        throw new Error(`Lark search ${tableId} has_more without page_token`);
      }
      pageToken = data.has_more === true ? data.page_token : null;
    } while (pageToken);

    logger?.info(
      {
        step: "lark_scan_complete",
        table_id: tableId,
        pages: page,
        records: records.length,
        elapsed_ms: Date.now() - startedAt,
      },
      "Lark table scan completed",
    );
    return records;
  }

  function filterRecordsByDate(records, { dateFieldName, fromMs, toMs }) {
    return records.filter((record) => {
      const rawValue = record?.fields?.[dateFieldName];
      const dateValue =
        typeof rawValue === "number"
          ? rawValue
          : Number(Array.isArray(rawValue) ? rawValue[0]?.text : rawValue);
      return Number.isFinite(dateValue) && dateValue >= fromMs && dateValue <= toMs;
    });
  }

  async function searchRecords(params) {
    const records = await searchAllRecords(params);
    return filterRecordsByDate(records, params);
  }

  async function listFields({ token, baseId, tableId }) {
    const fields = [];
    let pageToken = null;

    do {
      const url = new URL(
        `${LARK_API_BASE}/bitable/v1/apps/${encodeURIComponent(baseId)}/tables/${encodeURIComponent(tableId)}/fields`,
      );
      url.searchParams.set("page_size", "100");
      if (pageToken) url.searchParams.set("page_token", pageToken);

      const data = await request(
        url,
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
        `Lark list fields ${tableId}`,
      );
      const items = data.items ?? [];
      if (!Array.isArray(items)) {
        throw new Error(`Lark list fields ${tableId} returned invalid items`);
      }
      fields.push(...items);
      if (data.has_more === true && !data.page_token) {
        throw new Error(`Lark list fields ${tableId} has_more without page_token`);
      }
      pageToken = data.has_more === true ? data.page_token : null;
    } while (pageToken);

    return fields;
  }

  async function listTables({ token, baseId }) {
    const tables = [];
    let pageToken = null;

    do {
      const url = new URL(
        `${LARK_API_BASE}/bitable/v1/apps/${encodeURIComponent(baseId)}/tables`,
      );
      url.searchParams.set("page_size", "100");
      if (pageToken) url.searchParams.set("page_token", pageToken);
      const data = await request(
        url,
        { headers: { authorization: `Bearer ${token}` } },
        `Lark list tables ${baseId}`,
      );
      const items = data.items ?? [];
      if (!Array.isArray(items)) {
        throw new Error(`Lark list tables ${baseId} returned invalid items`);
      }
      tables.push(...items);
      if (data.has_more === true && !data.page_token) {
        throw new Error(`Lark list tables ${baseId} has_more without page_token`);
      }
      pageToken = data.has_more === true ? data.page_token : null;
    } while (pageToken);

    return tables;
  }

  async function ensureDayKeyFormulaField({
    token,
    baseId,
    tableId,
    dayKeyFieldName,
    dateFieldName,
    createIfMissing = false,
  }) {
    const fields = await listFields({ token, baseId, tableId });
    const existing = fields.find((field) => field.field_name === dayKeyFieldName);
    if (existing) {
      if (existing.type !== 20) {
        throw new Error(
          `Lark field ${dayKeyFieldName} in ${tableId} must be a Formula field`,
        );
      }
      return existing;
    }
    if (!createIfMissing) {
      throw new Error(
        `Lark table ${tableId} is missing Formula field ${dayKeyFieldName}`,
      );
    }

    const dateField = fields.find((field) => field.field_name === dateFieldName);
    if (!dateField?.field_id) {
      throw new Error(`Lark table ${tableId} is missing date field ${dateFieldName}`);
    }

    const data = await request(
      `${LARK_API_BASE}/bitable/v1/apps/${encodeURIComponent(baseId)}/tables/${encodeURIComponent(tableId)}/fields`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          field_name: dayKeyFieldName,
          type: 20,
          property: {
            formatter: "",
            formula_expression: `TEXT(bitable::$table[${tableId}].$field[${dateField.field_id}],"YYYY.MM.DD")`,
            type: { data_type: 1 },
          },
        }),
      },
      `Lark create formula field ${dayKeyFieldName} in ${tableId}`,
    );
    logger?.info(
      {
        step: "lark_day_key_created",
        table_id: tableId,
        field_name: dayKeyFieldName,
        source_field: dateFieldName,
      },
      "Lark day key formula field created",
    );
    return data.field;
  }

  async function ensureFieldsFromSchema({
    token,
    baseId,
    tableId,
    requiredFieldNames,
    schema,
  }) {
    const targetFields = await listFields({ token, baseId, tableId });
    const existingByName = new Map(
      targetFields.map((field) => [field.field_name, field]),
    );
    const schemaByName = new Map(schema.map((field) => [field.name, field]));
    const missingNames = requiredFieldNames.filter(
      (fieldName) => !existingByName.has(fieldName),
    );
    const unavailable = missingNames.filter(
      (fieldName) => !schemaByName.has(fieldName),
    );
    if (unavailable.length) {
      throw new Error(
        `Schema-as-code is missing fields: ${unavailable.join(", ")}`,
      );
    }

    for (const fieldName of missingNames) {
      const schemaField = schemaByName.get(fieldName);
      await new Promise((resolve) => setTimeout(resolve, 700));
      await request(
        `${LARK_API_BASE}/bitable/v1/apps/${encodeURIComponent(baseId)}/tables/${encodeURIComponent(tableId)}/fields`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            field_name: schemaField.name,
            type: schemaField.type,
            ...(schemaField.property
              ? { property: structuredClone(schemaField.property) }
              : {}),
          }),
        },
        `Lark create field ${fieldName} in ${tableId}`,
      );
      logger?.info(
        {
          step: "lark_field_created",
          table_id: tableId,
          field_name: fieldName,
        },
        "Missing Lark field created from schema",
      );
    }
    return missingNames;
  }

  async function searchRecordsByTextField({
    token,
    baseId,
    tableId,
    fieldName,
    value,
  }) {
    const records = [];
    let pageToken = null;
    let page = 0;
    const escapedValue = String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
    const filter = `CurrentValue.[${fieldName}] = "${escapedValue}"`;

    do {
      page += 1;
      const url = new URL(
        `${LARK_API_BASE}/bitable/v1/apps/${encodeURIComponent(baseId)}/tables/${encodeURIComponent(tableId)}/records`,
      );
      url.searchParams.set("page_size", "500");
      url.searchParams.set("filter", filter);
      if (pageToken) url.searchParams.set("page_token", pageToken);

      const data = await request(
        url,
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
        `Lark filter ${tableId} by ${fieldName}`,
      );
      const items = data.items ?? [];
      if (!Array.isArray(items)) {
        throw new Error(`Lark filter ${tableId} returned invalid items`);
      }
      records.push(...items);
      logger?.info(
        {
          step: "lark_day_page",
          table_id: tableId,
          field_name: fieldName,
          field_value: value,
          page,
          page_records: items.length,
          accumulated_records: records.length,
          has_more: data.has_more === true,
        },
        `Lark day page ${page} fetched`,
      );
      if (data.has_more === true && !data.page_token) {
        throw new Error(`Lark filter ${tableId} has_more without page_token`);
      }
      pageToken = data.has_more === true ? data.page_token : null;
    } while (pageToken);

    return records;
  }

  async function runBatches({ token, baseId, tableId, path, payloadKey, items }) {
    const startedAt = Date.now();
    const results = [];
    const batches = chunk(items, batchSize);
    for (const [index, currentBatch] of batches.entries()) {
      const batchStartedAt = Date.now();
      const data = await request(
        `${LARK_API_BASE}/bitable/v1/apps/${encodeURIComponent(baseId)}/tables/${encodeURIComponent(tableId)}/records/${path}`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ [payloadKey]: currentBatch }),
        },
        `Lark ${path} ${tableId}`,
      );
      results.push(data);
      logger?.info(
        {
          step: "lark_batch",
          operation: path,
          table_id: tableId,
          batch: index + 1,
          total_batches: batches.length,
          batch_records: currentBatch.length,
          processed_records: Math.min((index + 1) * batchSize, items.length),
          total_records: items.length,
          elapsed_ms: Date.now() - batchStartedAt,
        },
        `Lark ${path} batch ${index + 1}/${batches.length} completed`,
      );
    }
    logger?.info(
      {
        step: "lark_batches_complete",
        operation: path,
        table_id: tableId,
        batches: batches.length,
        records: items.length,
        elapsed_ms: Date.now() - startedAt,
      },
      `Lark ${path} completed`,
    );
    return results;
  }

  function batchCreateRecords({ token, baseId, tableId, records }) {
    return runBatches({
      token,
      baseId,
      tableId,
      path: "batch_create",
      payloadKey: "records",
      items: records,
    });
  }

  function batchUpdateRecords({ token, baseId, tableId, records }) {
    return runBatches({
      token,
      baseId,
      tableId,
      path: "batch_update",
      payloadKey: "records",
      items: records,
    });
  }

  function batchDeleteRecords({ token, baseId, tableId, recordIds }) {
    return runBatches({
      token,
      baseId,
      tableId,
      path: "batch_delete",
      payloadKey: "records",
      items: recordIds,
    });
  }

  return {
    getTenantAccessToken,
    searchAllRecords,
    filterRecordsByDate,
    listTables,
    listFields,
    ensureDayKeyFormulaField,
    ensureFieldsFromSchema,
    searchRecordsByTextField,
    searchRecords,
    batchCreateRecords,
    batchUpdateRecords,
    batchDeleteRecords,
  };
}

export const defaultLarkClient = createLarkClient();
export const getTenantAccessToken = defaultLarkClient.getTenantAccessToken;
export const searchAllRecords = defaultLarkClient.searchAllRecords;
export const filterRecordsByDate = defaultLarkClient.filterRecordsByDate;
export const listTables = defaultLarkClient.listTables;
export const listFields = defaultLarkClient.listFields;
export const ensureDayKeyFormulaField = defaultLarkClient.ensureDayKeyFormulaField;
export const ensureFieldsFromSchema =
  defaultLarkClient.ensureFieldsFromSchema;
export const searchRecordsByTextField = defaultLarkClient.searchRecordsByTextField;
export const searchRecords = defaultLarkClient.searchRecords;
export const batchCreateRecords = defaultLarkClient.batchCreateRecords;
export const batchUpdateRecords = defaultLarkClient.batchUpdateRecords;
export const batchDeleteRecords = defaultLarkClient.batchDeleteRecords;
