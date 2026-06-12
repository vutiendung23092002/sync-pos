import test from "node:test";
import assert from "node:assert/strict";

import { mapOrder } from "../mappers/mapOrder.js";
import { mapOrderItems } from "../mappers/mapOrderItem.js";
import {
  findLarkSchemaIssues,
  getLarkFieldSchema,
} from "../schemas/larkSchema.js";

function mapperFieldNames(kind) {
  const order = {
    system_id: "schema",
    inserted_at: "2026-01-01T00:00:00Z",
    items: [{ id: "item", variation_info: {} }],
  };
  return Object.keys(
    kind === "order"
      ? mapOrder(order).fields
      : mapOrderItems(order)[0].fields,
  ).sort();
}

for (const kind of ["order", "item"]) {
  test(`${kind} schema exactly covers mapped fields`, () => {
    const schema = getLarkFieldSchema(kind);
    const schemaNames = schema.map((field) => field.name);
    assert.equal(new Set(schemaNames).size, schemaNames.length);
    assert.deepEqual(schemaNames.sort(), mapperFieldNames(kind));
  });
}

test("schema validation reports wrong field types", () => {
  const schema = [{ name: "Unique Key", type: 1 }];
  assert.deepEqual(
    findLarkSchemaIssues(
      [{ field_name: "Unique Key", type: 2 }],
      schema,
      ["Unique Key"],
    ),
    {
      missing: [],
      wrongType: [
        {
          fieldName: "Unique Key",
          expectedType: 1,
          actualType: 2,
        },
      ],
    },
  );
});
