import test from "node:test";
import assert from "node:assert/strict";

import { getLarkFieldSchema } from "../schemas/larkSchema.js";
import { syncTable } from "../services/syncTable.js";

function createLarkClient(existingRecords) {
  const calls = { create: [], update: [], delete: [] };
  return {
    calls,
    async listFields() {
      return [
        { field_name: "Unique Key" },
        { field_name: "Trạng thái" },
      ];
    },
    async ensureDayKeyFormulaField() {
      return { field_name: "Ngày TD", type: 20 };
    },
    async searchRecordsByTextField() {
      return existingRecords;
    },
    async batchCreateRecords(args) {
      calls.create.push(args);
    },
    async batchUpdateRecords(args) {
      calls.update.push(args);
    },
    async batchDeleteRecords(args) {
      calls.delete.push(args);
    },
  };
}

const common = {
  tableName: "orders",
  token: "token",
  tableConfig: { base_id: "base", table_id: "table" },
  dateFieldName: "Ngày tạo đơn",
  dayKeyFieldName: "Ngày TD",
  dayKeyValue: "2026.03.01",
  uniqueFieldName: "Unique Key",
  fieldSchema: getLarkFieldSchema("order"),
};

test("dry run plans changes without writes", async () => {
  const client = createLarkClient([
    {
      record_id: "existing",
      created_time: "100",
      fields: { "Unique Key": "order:1" },
    },
  ]);
  const summary = await syncTable({
    ...common,
    larkClient: client,
    mappedRecords: [
      {
        uniqueKey: "order:1",
        fields: { "Unique Key": "order:1", "Trạng thái": "Đã xác nhận" },
      },
      {
        uniqueKey: "order:2",
        fields: { "Unique Key": "order:2", "Trạng thái": "Đã xác nhận" },
      },
    ],
    dryRun: true,
    posFetchComplete: true,
  });
  assert.deepEqual(
    { create: summary.createCount, update: summary.updateCount, delete: summary.deleteCount },
    { create: 1, update: 1, delete: 0 },
  );
  assert.deepEqual(client.calls, { create: [], update: [], delete: [] });
});

test("missing-record deletion is skipped when POS fetch is incomplete", async () => {
  const client = createLarkClient([
    {
      record_id: "existing",
      created_time: "100",
      fields: { "Unique Key": "order:missing" },
    },
  ]);
  const summary = await syncTable({
    ...common,
    larkClient: client,
    mappedRecords: [],
    dryRun: true,
    posFetchComplete: false,
  });
  assert.equal(summary.deleteCount, 0);
});

test("missing Lark fields fail before any write", async () => {
  const client = createLarkClient([]);
  client.listFields = async () => [{ field_name: "Unique Key" }];
  await assert.rejects(
    syncTable({
      ...common,
      larkClient: client,
      mappedRecords: [
        {
          uniqueKey: "order:1",
          fields: {
            "Unique Key": "order:1",
            "Last Synced At": 1,
          },
        },
      ],
      dryRun: false,
      posFetchComplete: true,
    }),
    /missing fields: Last Synced At/,
  );
  assert.deepEqual(client.calls, { create: [], update: [], delete: [] });
});

test("missing Lark fields are created from schema before writing", async () => {
  const client = createLarkClient([]);
  let fieldsCreated = false;
  client.listFields = async () =>
    fieldsCreated
      ? [{ field_name: "Unique Key" }, { field_name: "Last Synced At" }]
      : [{ field_name: "Unique Key" }];
  client.ensureFieldsFromSchema = async (params) => {
    assert.equal(params.schema, common.fieldSchema);
    fieldsCreated = true;
  };

  const summary = await syncTable({
    ...common,
    larkClient: client,
    mappedRecords: [
      {
        uniqueKey: "order:1",
        fields: {
          "Unique Key": "order:1",
          "Last Synced At": 1,
        },
      },
    ],
    dryRun: false,
    posFetchComplete: true,
  });

  assert.equal(summary.createCount, 1);
  assert.equal(client.calls.create.length, 1);
});

test("legacy record without Unique Key is deduplicated by mapped identity", async () => {
  const client = createLarkClient([
    {
      record_id: "legacy",
      created_time: "100",
      fields: { "Mã tuỳ chỉnh": "603579" },
    },
    {
      record_id: "newer",
      created_time: "200",
      fields: {
        "Unique Key": "order:90085036889346",
        "Mã tuỳ chỉnh": "603579",
      },
    },
  ]);
  client.listFields = async () => [
    { field_name: "Unique Key" },
    { field_name: "Mã tuỳ chỉnh" },
    { field_name: "Trạng thái" },
  ];
  const summary = await syncTable({
    ...common,
    larkClient: client,
    mappedRecords: [
      {
        uniqueKey: "order:90085036889346",
        fields: {
          "Unique Key": "order:90085036889346",
          "Mã tuỳ chỉnh": "603579",
          "Trạng thái": "Đã nhận",
        },
      },
    ],
    legacyIdentityFieldNames: ["Mã tuỳ chỉnh"],
    dryRun: true,
    posFetchComplete: true,
  });
  assert.equal(summary.updateCount, 1);
  assert.equal(summary.createCount, 0);
  assert.equal(summary.duplicateDeleteCount, 1);
  assert.equal(summary.deleteCount, 1);
});

test("matched legacy record without Unique Key is updated but not deleted", async () => {
  const legacyFieldName = common.fieldSchema.find(
    (field) => field.name.includes("tuỳ chỉnh"),
  ).name;
  const client = createLarkClient([
    {
      record_id: "legacy",
      created_time: "100",
      fields: {
        [legacyFieldName]: "603579",
      },
    },
  ]);
  client.listFields = async () => [
    { field_name: "Unique Key", type: 1 },
    { field_name: legacyFieldName, type: 1 },
  ];

  const summary = await syncTable({
    ...common,
    larkClient: client,
    mappedRecords: [
      {
        uniqueKey: "order:90085036889346",
        fields: {
          "Unique Key": "order:90085036889346",
          [legacyFieldName]: "603579",
        },
      },
    ],
    legacyIdentityFieldNames: [legacyFieldName],
    dryRun: false,
    posFetchComplete: true,
  });

  assert.equal(summary.createCount, 0);
  assert.equal(summary.updateCount, 1);
  assert.equal(summary.deleteCount, 0);
  assert.equal(client.calls.update.length, 1);
  assert.equal(client.calls.delete.length, 0);
});

test("unidentified legacy record is preserved instead of deleted", async () => {
  const client = createLarkClient([
    {
      record_id: "unknown-legacy",
      created_time: "100",
      fields: {},
    },
  ]);

  const summary = await syncTable({
    ...common,
    larkClient: client,
    mappedRecords: [],
    legacyIdentityFieldNames: ["ID"],
    dryRun: false,
    posFetchComplete: true,
  });

  assert.equal(summary.deleteCount, 0);
  assert.equal(summary.unidentifiedLarkPreservedCount, 1);
  assert.equal(client.calls.delete.length, 0);
});

test("unchanged records are not updated and Last Synced At is ignored", async () => {
  const statusFieldName = common.fieldSchema.find(
    (field) => field.type === 3 && field.name.includes("thái"),
  ).name;
  const client = createLarkClient([
    {
      record_id: "existing",
      created_time: "100",
      fields: {
        "Unique Key": [{ text: "order:1", type: "text" }],
        [statusFieldName]: "Đã xác nhận",
        "Last Synced At": 1000,
      },
    },
  ]);
  client.listFields = async () => [
    { field_name: "Unique Key", type: 1 },
    { field_name: statusFieldName, type: 3 },
    { field_name: "Last Synced At", type: 5 },
  ];

  const summary = await syncTable({
    ...common,
    larkClient: client,
    mappedRecords: [
      {
        uniqueKey: "order:1",
        fields: {
          "Unique Key": "order:1",
          [statusFieldName]: "Đã xác nhận",
          "Last Synced At": 9999,
        },
      },
    ],
    dryRun: false,
    posFetchComplete: true,
  });

  assert.equal(summary.updateCount, 0);
  assert.equal(summary.unchangedCount, 1);
  assert.equal(client.calls.update.length, 0);
});

test("changed business fields still update the existing record", async () => {
  const statusFieldName = common.fieldSchema.find(
    (field) => field.type === 3 && field.name.includes("thái"),
  ).name;
  const client = createLarkClient([
    {
      record_id: "existing",
      created_time: "100",
      fields: {
        "Unique Key": "order:1",
        [statusFieldName]: "Mới",
        "Last Synced At": 1000,
      },
    },
  ]);
  client.listFields = async () => [
    { field_name: "Unique Key", type: 1 },
    { field_name: statusFieldName, type: 3 },
    { field_name: "Last Synced At", type: 5 },
  ];

  const summary = await syncTable({
    ...common,
    larkClient: client,
    mappedRecords: [
      {
        uniqueKey: "order:1",
        fields: {
          "Unique Key": "order:1",
          [statusFieldName]: "Đã xác nhận",
          "Last Synced At": 9999,
        },
      },
    ],
    dryRun: false,
    posFetchComplete: true,
  });

  assert.equal(summary.updateCount, 1);
  assert.equal(summary.unchangedCount, 0);
  assert.equal(client.calls.update.length, 1);
});

test("Khách mới/cũ is populated when the existing field is blank", async () => {
  const customerTypeFieldName = "Khách mới/cũ";
  const client = createLarkClient([
    {
      record_id: "existing",
      created_time: "100",
      fields: {
        "Unique Key": "order:1",
        [customerTypeFieldName]: null,
      },
    },
  ]);
  client.listFields = async () => [
    { field_name: "Unique Key", type: 1 },
    { field_name: customerTypeFieldName, type: 3 },
  ];

  const summary = await syncTable({
    ...common,
    larkClient: client,
    mappedRecords: [
      {
        uniqueKey: "order:1",
        fields: {
          "Unique Key": "order:1",
          [customerTypeFieldName]: "Mới",
        },
      },
    ],
    dryRun: false,
    posFetchComplete: true,
  });

  assert.equal(summary.updateCount, 1);
  assert.equal(
    client.calls.update[0].records[0].fields[customerTypeFieldName],
    "Mới",
  );
});

test("Khách mới/cũ is preserved once it already has a value", async () => {
  const customerTypeFieldName = "Khách mới/cũ";
  const statusFieldName = "Trạng thái";
  const client = createLarkClient([
    {
      record_id: "existing",
      created_time: "100",
      fields: {
        "Unique Key": "order:1",
        [statusFieldName]: "Mới",
        [customerTypeFieldName]: "Cũ",
      },
    },
  ]);
  client.listFields = async () => [
    { field_name: "Unique Key", type: 1 },
    { field_name: statusFieldName, type: 3 },
    { field_name: customerTypeFieldName, type: 3 },
  ];

  const summary = await syncTable({
    ...common,
    larkClient: client,
    mappedRecords: [
      {
        uniqueKey: "order:1",
        fields: {
          "Unique Key": "order:1",
          [statusFieldName]: "Đã xác nhận",
          [customerTypeFieldName]: "Mới",
        },
      },
    ],
    dryRun: false,
    posFetchComplete: true,
  });

  assert.equal(summary.updateCount, 1);
  assert.equal(client.calls.update.length, 1);
  assert.equal(
    Object.hasOwn(
      client.calls.update[0].records[0].fields,
      customerTypeFieldName,
    ),
    false,
  );
});

test("debug logs changed fields and delete identities", async () => {
  const statusFieldName = "Trạng thái";
  const legacyFieldName = "Mã tuỳ chỉnh";
  const client = createLarkClient([
    {
      record_id: "update-record",
      created_time: "100",
      fields: {
        "Unique Key": "order:1",
        [legacyFieldName]: "662472",
        [statusFieldName]: "Mới",
      },
    },
    {
      record_id: "delete-record",
      created_time: "100",
      fields: {
        "Unique Key": "order:missing",
        [legacyFieldName]: "662999",
        [statusFieldName]: "Đã xác nhận",
      },
    },
  ]);
  client.listFields = async () => [
    { field_name: "Unique Key", type: 1 },
    { field_name: legacyFieldName, type: 1 },
    { field_name: statusFieldName, type: 3 },
  ];
  const debugEntries = [];
  const logger = {
    debug(entry) {
      debugEntries.push(entry);
    },
    info() {},
    warn() {},
  };

  const summary = await syncTable({
    ...common,
    syncDate: "2026-06-01",
    periodType: "TD",
    recordType: "ORDER",
    months: [6],
    larkClient: client,
    mappedRecords: [
      {
        uniqueKey: "order:1",
        fields: {
          "Unique Key": "order:1",
          [legacyFieldName]: "662472",
          [statusFieldName]: "Đã xác nhận",
        },
      },
    ],
    legacyIdentityFieldNames: [legacyFieldName],
    logger,
    dryRun: true,
    posFetchComplete: true,
  });

  assert.equal(summary.updateCount, 1);
  assert.equal(summary.deleteCount, 1);

  const updateDetail = debugEntries.find(
    (entry) => entry.step === "table_update_detail",
  );
  assert.equal(updateDetail.custom_code, "662472");
  assert.deepEqual(updateDetail.changed_fields, [statusFieldName]);
  assert.deepEqual(updateDetail.changed_values, [
    {
      field_name: statusFieldName,
      before: "Mới",
      after: "Đã xác nhận",
    },
  ]);

  const deleteDetail = debugEntries.find(
    (entry) => entry.step === "table_delete_detail",
  );
  assert.equal(deleteDetail.custom_code, "662999");
  assert.equal(deleteDetail.reason, "missing_in_pos_scope");
});
