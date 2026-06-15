import test from "node:test";
import assert from "node:assert/strict";

import { createPosClient, isAllowedOrderSource } from "../clients/posClient.js";

test("POS source filter accepts Facebook, Zalo, or empty source", () => {
  assert.equal(isAllowedOrderSource({ order_sources_name: "Facebook" }), true);
  assert.equal(isAllowedOrderSource({ order_sources_name: " facebook " }), true);
  assert.equal(isAllowedOrderSource({ order_sources_name: "Zalo" }), true);
  assert.equal(isAllowedOrderSource({ order_sources_name: " zalo " }), true);
  assert.equal(isAllowedOrderSource({ order_sources_name: null }), true);
  assert.equal(isAllowedOrderSource({}), true);
  assert.equal(isAllowedOrderSource({ order_sources_name: "Shopee" }), false);
  assert.equal(isAllowedOrderSource({ order_sources_name: "TikTok" }), false);
});

test("POS request excludes source -3 and -9 at the API", async () => {
  let requestedUrl;
  const client = createPosClient({
    fetchImpl: async (url) => {
      requestedUrl = new URL(url);
      return new Response(
        JSON.stringify({
          success: true,
          page_number: 1,
          total_pages: 1,
          data: [],
        }),
        { status: 200 },
      );
    },
  });

  await client.fetchAllOrdersByDay({
    date: "2026-03-01",
    apiKey: "secret",
    shopId: "shop",
  });

  assert.equal(
    requestedUrl.searchParams.get("is_filter_exclude_source"),
    "true",
  );
  assert.deepEqual(requestedUrl.searchParams.getAll("order_sources"), [
    '["-3"]',
    '["-9"]',
  ]);
});
