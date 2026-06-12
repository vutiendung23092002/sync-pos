import { getVietnamDayUnixRange } from "../utils/date.js";
import { fetchJsonWithRetry } from "../utils/retry.js";

const POS_API_BASE = "https://pos.pages.fm/api/v1";

export function isAllowedOrderSource(order) {
  const sourceName = order?.order_sources_name?.trim().toLowerCase();
  return !sourceName || sourceName === "facebook";
}

function assertObject(value, operation) {
  if (!value || typeof value !== "object") {
    throw new Error(`${operation} returned an unexpected response shape`);
  }
}

export function createPosClient({ fetchImpl = fetch, logger } = {}) {
  async function fetchAllOrdersByDay({ date, apiKey, shopId }) {
    const startedAt = Date.now();
    const { fromTs, toTs } = getVietnamDayUnixRange(date);
    const orders = [];
    let pageNumber = 1;
    let expectedTotalPages = null;

    while (true) {
      const url = new URL(`${POS_API_BASE}/shops/${encodeURIComponent(shopId)}/orders`);
      url.searchParams.set("api_key", apiKey);
      url.searchParams.set("page_size", "200");
      url.searchParams.set("is_filter_exclude_source", "true");
      url.searchParams.set("include_removed", "1");
      url.searchParams.set("option_sort", "inserted_at_desc");
      url.searchParams.set("page_number", String(pageNumber));
      url.searchParams.set("startDateTime", String(fromTs));
      url.searchParams.set("endDateTime", String(toTs));
      url.searchParams.append("order_sources", '["-3"]');
      url.searchParams.append("order_sources", '["-9"]');

      logger?.info(
        {
          date,
          step: "pos_page_start",
          page: pageNumber,
          expected_total_pages: expectedTotalPages,
        },
        `POS page ${pageNumber} request started`,
      );
      const body = await fetchJsonWithRetry(
        url,
        { headers: { accept: "application/json" } },
        {
          fetchImpl,
          logger,
          operation: `POS orders page ${pageNumber} for ${date}`,
        },
      );
      assertObject(body, "POS orders");
      if (body.success !== true || !Array.isArray(body.data)) {
        throw new Error(
          `POS orders page ${pageNumber} for ${date} is incomplete or unsuccessful`,
        );
      }

      const responsePage = Number(body.page_number ?? pageNumber);
      const totalPages = Number(body.total_pages);
      if (
        !Number.isInteger(responsePage) ||
        responsePage !== pageNumber ||
        !Number.isInteger(totalPages) ||
        totalPages < 0
      ) {
        throw new Error(`POS orders page ${pageNumber} returned invalid pagination metadata`);
      }
      if (expectedTotalPages != null && totalPages !== expectedTotalPages) {
        throw new Error(`POS total_pages changed during fetch for ${date}`);
      }

      expectedTotalPages = totalPages;
      orders.push(...body.data);
      logger?.info(
        {
          date,
          step: "pos_page",
          page: pageNumber,
          total_pages: totalPages,
          page_records: body.data.length,
          accumulated_records: orders.length,
        },
        `POS page ${pageNumber}/${totalPages} fetched`,
      );
      if (pageNumber >= totalPages) break;
      if (pageNumber >= 10_000) {
        throw new Error(`POS pagination exceeded safety limit for ${date}`);
      }
      pageNumber += 1;
    }

    const filteredOrders = orders.filter(isAllowedOrderSource);
    logger?.info(
      {
        date,
        fetched_orders: orders.length,
        accepted_orders: filteredOrders.length,
        excluded_orders: orders.length - filteredOrders.length,
        total_pages: expectedTotalPages ?? 0,
        elapsed_ms: Date.now() - startedAt,
        step: "pos_complete",
      },
      "POS fetch completed",
    );

    return {
      orders: filteredOrders,
      complete: true,
      pages: expectedTotalPages ?? 0,
      fetchedOrders: orders.length,
    };
  }

  async function fetchCategories({ apiKey, shopId }) {
    const startedAt = Date.now();
    const url = new URL(
      `${POS_API_BASE}/shops/${encodeURIComponent(shopId)}/categories`,
    );
    url.searchParams.set("api_key", apiKey);
    const body = await fetchJsonWithRetry(
      url,
      { headers: { accept: "application/json" } },
      { fetchImpl, logger, operation: "POS categories" },
    );
    assertObject(body, "POS categories");
    const categories = Array.isArray(body.data)
      ? body.data
      : Array.isArray(body.categories)
        ? body.categories
        : null;
    if (!categories) {
      throw new Error("POS categories returned an unexpected response shape");
    }
    const categoryMap = Object.fromEntries(
      categories
        .filter((category) => category?.id != null && category?.text)
        .map((category) => [String(category.id), category.text]),
    );
    logger?.info(
      {
        step: "pos_categories",
        categories: Object.keys(categoryMap).length,
        elapsed_ms: Date.now() - startedAt,
      },
      "POS categories fetched",
    );
    return categoryMap;
  }

  return { fetchAllOrdersByDay, fetchCategories };
}

export const defaultPosClient = createPosClient();
export const fetchAllOrdersByDay = defaultPosClient.fetchAllOrdersByDay;
export const fetchCategories = defaultPosClient.fetchCategories;
