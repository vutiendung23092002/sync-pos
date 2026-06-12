import test from "node:test";
import assert from "node:assert/strict";

import {
  getChangedLarkFieldNames,
  normalizeLarkFieldValue,
} from "../utils/larkFields.js";

test("Lark values are normalized by schema type", () => {
  assert.equal(
    normalizeLarkFieldValue([{ text: "abc", type: "text" }], 1),
    "abc",
  );
  assert.equal(normalizeLarkFieldValue("100", 2), 100);
  assert.equal(normalizeLarkFieldValue("1700000000000", 5), 1700000000000);
  assert.deepEqual(
    normalizeLarkFieldValue([{ name: "B" }, { name: "A" }], 4),
    ["A", "B"],
  );
});

test("field comparison ignores Last Synced At and rich text shape", () => {
  const changed = getChangedLarkFieldNames({
    desiredFields: {
      "Unique Key": "order:1",
      Amount: 100,
      Categories: ["A", "B"],
      "Last Synced At": 9999,
    },
    existingFields: {
      "Unique Key": [{ text: "order:1", type: "text" }],
      Amount: "100",
      Categories: [{ name: "B" }, { name: "A" }],
      "Last Synced At": 1000,
    },
    fieldSchema: [
      { name: "Unique Key", type: 1 },
      { name: "Amount", type: 2 },
      { name: "Categories", type: 4 },
      { name: "Last Synced At", type: 5 },
    ],
  });

  assert.deepEqual(changed, []);
});
