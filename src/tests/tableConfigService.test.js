import test from "node:test";
import assert from "node:assert/strict";

import { LARK_TABLE_CONFIG_MAPPING } from "../config/larkTableMapping.js";
import { createTableConfigService } from "../services/tableConfigService.js";

test("static mapping contains 8 types and 12 unique months per type", () => {
  assert.equal(Object.keys(LARK_TABLE_CONFIG_MAPPING).length, 8);

  for (const [type, configs] of Object.entries(LARK_TABLE_CONFIG_MAPPING)) {
    assert.equal(configs.length, 12, type);
    assert.deepEqual(
      configs.map((config) => config.month),
      Array.from({ length: 12 }, (_, index) => index + 1),
      type,
    );
    assert.equal(new Set(configs.map((config) => config.table_id)).size, 12);
  }
});

test("mapping source returns config without querying database", async () => {
  const service = createTableConfigService({
    source: "mapping",
    dbClient: {
      getLarkTableConfigs: () => {
        throw new Error("database should not be queried");
      },
    },
  });

  const configs = await service.getLarkTableConfigs({
    type: "facebook_order_td_test",
  });
  assert.equal(configs.length, 12);
  assert.equal(configs[1].table_id, "tblnP28OnYqK7xPQ");
});

test("database source delegates to dbClient", async () => {
  const expected = [{ type: "facebook_order_td", month: 1 }];
  const service = createTableConfigService({
    source: "database",
    dbClient: {
      getLarkTableConfig: async () => expected[0],
      getLarkTableConfigs: async () => expected,
    },
  });

  assert.equal(
    await service.getLarkTableConfig({
      type: "facebook_order_td",
      month: 1,
    }),
    expected[0],
  );
  assert.equal(
    await service.getLarkTableConfigs({ type: "facebook_order_td" }),
    expected,
  );
});
