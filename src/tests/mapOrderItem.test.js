import test from "node:test";
import assert from "node:assert/strict";

import { mapOrderItems } from "../mappers/mapOrderItem.js";

function makeOrder(overrides = {}) {
  return {
    order_link: "https://example.test/order?order_id=123",
    system_id: 456,
    inserted_at: "2026-03-23T00:00:00.000Z",
    status: 1,
    items: [
      {
        id: 789,
        quantity: 2,
        return_quantity: 1,
        total_discount: 5,
        variation_info: {
          name: "Product",
          product_display_id: "SKU-1",
          retail_price: 100,
          avg_price: 30,
          category_ids: [10],
        },
      },
    ],
    ...overrides,
  };
}

test("item mapping includes unique keys and category", () => {
  const [mapped] = mapOrderItems(makeOrder(), {
    categoryMap: { 10: "Category A" },
    costMap: { "sku-1": 55 },
    now: () => 1,
  });
  assert.equal(mapped.uniqueKey, "item:123:789");
  assert.equal(mapped.fields["Order Unique Key"], "order:123");
  assert.deepEqual(mapped.fields["Danh mục"], ["Category A"]);
  assert.equal(Object.hasOwn(mapped.fields, "Giá vốn Kiot"), false);
  assert.equal(mapped.fields["Giá trị bán"], 95);
});

test("item unique key falls back to system id", () => {
  const [mapped] = mapOrderItems(
    makeOrder({ order_link: null, system_id: 456 }),
    { now: () => 1 },
  );
  assert.equal(mapped.uniqueKey, "item:system:456:789");
  assert.equal(mapped.fields["Order Unique Key"], "order:system:456");
});

test("item missing status_history maps to null", () => {
  const [mapped] = mapOrderItems(
    makeOrder({ status_history: undefined }),
    { now: () => 1 },
  );
  assert.equal(mapped.fields["Dòng thời gian cập nhật trạng thái"], null);
});
