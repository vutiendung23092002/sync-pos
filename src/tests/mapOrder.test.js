import test from "node:test";
import assert from "node:assert/strict";

import { mapOrder } from "../mappers/mapOrder.js";

function makeOrder(overrides = {}) {
  return {
    order_link: "https://example.test/order?order_id=123",
    system_id: 456,
    inserted_at: "2026-03-23T00:00:00.000Z",
    updated_at: "2026-03-23T01:00:00.000Z",
    status: 1,
    total_price: 200,
    total_discount: 0,
    shipping_fee: 10,
    items: [
      {
        id: 1,
        quantity: 2,
        return_quantity: 0,
        total_discount: 0,
        variation_info: { retail_price: 100, avg_price: 30 },
      },
    ],
    ...overrides,
  };
}

test("missing status_history maps to null", () => {
  const mapped = mapOrder(makeOrder({ status_history: undefined }), { now: () => 1 });
  assert.equal(mapped.fields["Dòng thời gian cập nhật trạng thái"], null);
  assert.equal(mapped.fields["Người tạo"], "Hệ thống");
});

test("cancelled and deleted orders have zero revenue", () => {
  for (const status of [6, 7]) {
    const mapped = mapOrder(makeOrder({ status }), { now: () => 1 });
    assert.equal(mapped.fields["Doanh thu bán hàng"], 0);
    assert.equal(mapped.fields["Doanh số bán hàng"], 0);
    assert.equal(mapped.fields["Tổng giá nhập SP"], 0);
  }
});

test("partial return subtracts returned quantity without forcing zero revenue", () => {
  const mapped = mapOrder(
    makeOrder({
      status: 15,
      items: [
        {
          id: 1,
          quantity: 2,
          return_quantity: 1,
          total_discount: 0,
          variation_info: { retail_price: 100, avg_price: 30 },
        },
      ],
    }),
    { now: () => 1 },
  );
  assert.equal(mapped.fields["Giá trị hoàn"], 100);
  assert.equal(mapped.fields["Doanh thu bán hàng"], 100);
  assert.equal(mapped.fields["Tổng giá nhập SP"], 30);
});

test("order unique key falls back to system id", () => {
  const mapped = mapOrder(
    makeOrder({ order_link: null, system_id: 456 }),
    { now: () => 1 },
  );
  assert.equal(mapped.uniqueKey, "order:system:456");
  assert.equal(mapped.fields["Unique Key"], "order:system:456");
});

test("customer ID is mapped as text", () => {
  const mapped = mapOrder(
    makeOrder({ customer: { id: 789, name: "Khách A" } }),
    { now: () => 1 },
  );
  assert.equal(mapped.fields["ID Khách hàng"], "789");
});

test("timezone-less POS timestamps are treated as UTC", () => {
  const mapped = mapOrder(
    makeOrder({ inserted_at: "2026-02-28T17:44:24.848341" }),
    { now: () => 1 },
  );
  assert.equal(
    mapped.fields["Ngày tạo đơn"],
    Date.parse("2026-02-28T17:44:24.848341Z"),
  );
});
