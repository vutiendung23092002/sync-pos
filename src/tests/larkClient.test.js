import test from "node:test";
import assert from "node:assert/strict";

import { createLarkClient } from "../clients/larkClient.js";

test("Lark records are filtered locally to the requested day", async () => {
  const requests = [];
  const fetchImpl = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return new Response(
      JSON.stringify({
        code: 0,
        msg: "success",
        data: {
          has_more: false,
          items: [
            {
              record_id: "previous-day",
              fields: { "Ngày tạo đơn": 1000 },
            },
            {
              record_id: "requested-day",
              fields: { "Ngày tạo đơn": 2500 },
            },
            {
              record_id: "next-day",
              fields: { "Ngày tạo đơn": 4000 },
            },
          ],
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const client = createLarkClient({ fetchImpl });
  const records = await client.searchRecords({
    token: "token",
    baseId: "base",
    tableId: "table",
    dateFieldName: "Ngày tạo đơn",
    fromMs: 2000,
    toMs: 3000,
  });

  assert.deepEqual(records.map((record) => record.record_id), ["requested-day"]);
  assert.deepEqual(requests, [{ automatic_fields: false }]);
});

test("records without a valid date are excluded from deletion scope", async () => {
  const client = createLarkClient({
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          code: 0,
          data: {
            has_more: false,
            items: [
              { record_id: "missing-date", fields: {} },
              {
                record_id: "rich-date",
                fields: { "Ngày tạo đơn": [{ text: "2500", type: "text" }] },
              },
            ],
          },
        }),
        { status: 200 },
      ),
  });
  const records = await client.searchRecords({
    token: "token",
    baseId: "base",
    tableId: "table",
    dateFieldName: "Ngày tạo đơn",
    fromMs: 2000,
    toMs: 3000,
  });

  assert.deepEqual(records.map((record) => record.record_id), ["rich-date"]);
});

test("Lark day filter uses exact CurrentValue formula", async () => {
  let requestedUrl;
  const client = createLarkClient({
    fetchImpl: async (url) => {
      requestedUrl = new URL(url);
      return new Response(
        JSON.stringify({
          code: 0,
          data: {
            has_more: false,
            items: [{ record_id: "record-1", fields: {} }],
          },
        }),
        { status: 200 },
      );
    },
  });
  const records = await client.searchRecordsByTextField({
    token: "token",
    baseId: "base",
    tableId: "table",
    fieldName: "Ngày TD",
    value: "2026.03.23",
  });

  assert.equal(requestedUrl.pathname.endsWith("/records"), true);
  assert.equal(
    requestedUrl.searchParams.get("filter"),
    'CurrentValue.[Ngày TD] = "2026.03.23"',
  );
  assert.equal(records.length, 1);
});

test("expired Lark token is refreshed and the request is retried once", async () => {
  const authorizations = [];
  let tokenRequests = 0;
  let apiRequests = 0;
  const client = createLarkClient({
    credentials: {
      appId: "app-id",
      appSecret: "app-secret",
    },
    fetchImpl: async (url, options) => {
      if (String(url).includes("/tenant_access_token/internal")) {
        tokenRequests += 1;
        return new Response(
          JSON.stringify({
            code: 0,
            tenant_access_token:
              tokenRequests === 1 ? "expired-token" : "refreshed-token",
          }),
          { status: 200 },
        );
      }

      apiRequests += 1;
      authorizations.push(new Headers(options.headers).get("authorization"));
      if (apiRequests === 1) {
        return new Response(
          JSON.stringify({
            code: 99991663,
            msg: "Invalid access token for authorization. Please make a request with token attached.",
          }),
          { status: 400 },
        );
      }
      return new Response(
        JSON.stringify({
          code: 0,
          data: {
            has_more: false,
            items: [],
          },
        }),
        { status: 200 },
      );
    },
  });

  const initialToken = await client.getTenantAccessToken();
  const fields = await client.listFields({
    token: initialToken,
    baseId: "base",
    tableId: "table",
  });

  assert.deepEqual(fields, []);
  assert.equal(tokenRequests, 2);
  assert.equal(apiRequests, 2);
  assert.deepEqual(authorizations, [
    "Bearer expired-token",
    "Bearer refreshed-token",
  ]);
});
