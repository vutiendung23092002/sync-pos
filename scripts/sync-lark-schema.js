import "dotenv/config";

import { createLarkClient } from "../src/clients/larkClient.js";
import {
  findLarkSchemaIssues,
  getLarkFieldSchema,
} from "../src/schemas/larkSchema.js";

const TARGET_BASE_ID =
  process.env.LARK_TARGET_BASE_ID ?? "Df3WbKnmyaeUKJsphablcI8Jgeh";
const APPLY = process.env.APPLY === "true" || process.argv.includes("--apply");

function getTableKind(tableName) {
  return /^Item(?: |_)/i.test(tableName) ? "item" : "order";
}

function getDateFieldName(kind) {
  return kind === "item" ? "Thời gian tạo đơn" : "Ngày tạo đơn";
}

async function main() {
  if (!process.env.LARK_APP_ID || !process.env.LARK_APP_SECRET) {
    throw new Error("Missing LARK_APP_ID or LARK_APP_SECRET");
  }

  const larkClient = createLarkClient();
  const token = await larkClient.getTenantAccessToken({
    appId: process.env.LARK_APP_ID,
    appSecret: process.env.LARK_APP_SECRET,
  });
  const tables = await larkClient.listTables({
    token,
    baseId: TARGET_BASE_ID,
  });
  const targets = tables.filter((table) =>
    /^(OD_T\d+|Item T\d+|OD_CD_\d+|Item_CD_\d+)$/.test(table.name),
  );
  if (targets.length !== 48) {
    throw new Error(`Expected 48 target tables, found ${targets.length}`);
  }

  let totalMissing = 0;
  let totalWrongType = 0;
  for (const table of targets) {
    const kind = getTableKind(table.name);
    const schema = getLarkFieldSchema(kind);
    const requiredNames = schema.map((field) => field.name);
    let fields = await larkClient.listFields({
      token,
      baseId: TARGET_BASE_ID,
      tableId: table.table_id,
    });
    let issues = findLarkSchemaIssues(fields, schema, requiredNames);
    let dayField = fields.find((field) => field.field_name === "Ngày TD");
    let dayFieldMissing = !dayField;
    let dayFieldWrongType = dayField && dayField.type !== 20;

    if (APPLY && !issues.wrongType.length && !dayFieldWrongType) {
      await larkClient.ensureFieldsFromSchema({
        token,
        baseId: TARGET_BASE_ID,
        tableId: table.table_id,
        requiredFieldNames: requiredNames,
        schema,
      });
      await larkClient.ensureDayKeyFormulaField({
        token,
        baseId: TARGET_BASE_ID,
        tableId: table.table_id,
        dayKeyFieldName: "Ngày TD",
        dateFieldName: getDateFieldName(kind),
        createIfMissing: true,
      });
      fields = await larkClient.listFields({
        token,
        baseId: TARGET_BASE_ID,
        tableId: table.table_id,
      });
      issues = findLarkSchemaIssues(fields, schema, requiredNames);
      dayField = fields.find((field) => field.field_name === "Ngày TD");
      dayFieldMissing = !dayField;
      dayFieldWrongType = dayField && dayField.type !== 20;
    }

    const wrongType = [
      ...issues.wrongType,
      ...(dayFieldWrongType
        ? [{
            fieldName: "Ngày TD",
            expectedType: 20,
            actualType: dayField.type,
          }]
        : []),
    ];
    const missing = [
      ...issues.missing,
      ...(dayFieldMissing ? ["Ngày TD"] : []),
    ];
    totalMissing += missing.length;
    totalWrongType += wrongType.length;
    console.log(
      JSON.stringify({
        table_name: table.name,
        table_id: table.table_id,
        missing_fields: missing,
        wrong_types: wrongType,
        apply: APPLY,
      }),
    );
  }

  console.log(
    JSON.stringify({
      target_base_id: TARGET_BASE_ID,
      tables: targets.length,
      missing_fields: totalMissing,
      wrong_types: totalWrongType,
      apply: APPLY,
    }),
  );

  if (totalWrongType > 0 || (APPLY && totalMissing > 0)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ level: "fatal", message: error.message }));
  process.exitCode = 1;
});
