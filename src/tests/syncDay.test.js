import test from "node:test";
import assert from "node:assert/strict";

import { buildPeriodDestinations } from "../services/syncDay.js";

function record(uniqueKey, monthCd) {
  return {
    uniqueKey,
    fields: {
      "Tháng CD": monthCd,
    },
  };
}

test("CD records are routed by month regardless of year", () => {
  const configs = [
    {
      month: 1,
      base_id: "base",
      table_id: "january",
    },
    {
      month: 2,
      base_id: "base",
      table_id: "february",
    },
  ];
  const destinations = buildPeriodDestinations({
    configs,
    records: [
      record("order:1", "2025.01"),
      record("order:2", "2026.01"),
      record("order:3", "2026.02"),
    ],
    tableType: "facebook_order_cd_test",
    periodFieldName: "Tháng CD",
  });

  assert.equal(destinations.length, 2);
  assert.deepEqual(
    destinations.find((destination) => destination.tableConfig.month === 1)
      .mappedRecords.map((item) => item.uniqueKey),
    ["order:1", "order:2"],
  );
});

test("months pointing to the same Lark table are synced once", () => {
  const configs = [
    { month: 1, base_id: "base", table_id: "shared" },
    { month: 2, base_id: "base", table_id: "shared" },
  ];
  const [destination] = buildPeriodDestinations({
    configs,
    records: [record("order:1", "2026.01"), record("order:2", "2026.02")],
    tableType: "facebook_order_cd_test",
    periodFieldName: "Tháng CD",
  });

  assert.equal(destination.mappedRecords.length, 2);
  assert.deepEqual(destination.months, [1, 2]);
});

test("missing CD month config fails clearly", () => {
  assert.throws(
    () =>
      buildPeriodDestinations({
        configs: [{ month: 1, base_id: "base", table_id: "january" }],
        records: [record("order:1", "2026.02")],
        tableType: "facebook_order_cd_test",
        periodFieldName: "Tháng CD",
      }),
    /type=facebook_order_cd_test, month=2/,
  );
});
