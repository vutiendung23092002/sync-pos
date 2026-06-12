import { mapOrderStatus } from "./statusMap.js";

export function getOrderId(orderLink) {
  if (!orderLink) return null;
  return orderLink.match(/[?&]order_id=([^&]+)/)?.[1] ?? null;
}

export function extractPostId(fullPostId) {
  if (typeof fullPostId !== "string") return null;
  const separator = fullPostId.indexOf("_");
  return separator >= 0 ? fullPostId.slice(separator + 1) : null;
}

export function formatUtcToUnixMs(isoString) {
  if (!isoString) return null;
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(isoString)
    ? isoString
    : `${isoString}Z`;
  const value = Date.parse(normalized);
  return Number.isNaN(value) ? null : value;
}

export function formatUtcToUtc7Text(isoString) {
  const value = formatUtcToUnixMs(isoString);
  if (value == null) return null;
  const date = new Date(value + 7 * 60 * 60 * 1000);
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = date.getUTCFullYear();
  return `${hh}:${mm} ${day}/${month}/${year}`;
}

export function buildStatusHistory(statusHistory) {
  if (!Array.isArray(statusHistory) || statusHistory.length === 0) return null;
  const lines = statusHistory
    .map((history) => {
      const time = formatUtcToUtc7Text(history?.updated_at);
      if (!time) return null;
      return `${mapOrderStatus(history?.status)} - ${time}`;
    })
    .filter(Boolean);
  return lines.length ? `${lines.join(";\n")};` : null;
}

function extractDateAtLine(statusHistoryText, index) {
  if (!statusHistoryText || typeof statusHistoryText !== "string") return null;
  const lines = statusHistoryText
    .split(";\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const match = lines[index]?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  return { day: match[1], month: match[2], year: match[3] };
}

export function extractCreatedDate(statusHistoryText) {
  return extractDateAtLine(statusHistoryText, 0);
}

export function extractConfirmedDate(statusHistoryText) {
  return extractDateAtLine(statusHistoryText, 1);
}

export function calcItemTotalDiscount(items) {
  return Array.isArray(items)
    ? items.reduce((sum, item) => sum + Number(item?.total_discount ?? 0), 0)
    : 0;
}

export function calcReturnRevenue(items) {
  return Array.isArray(items)
    ? items.reduce(
        (sum, item) =>
          sum +
          Number(item?.return_quantity ?? 0) *
            Number(item?.variation_info?.retail_price ?? 0),
        0,
      )
    : 0;
}

export function calcTotalImportCost(items) {
  return Array.isArray(items)
    ? items.reduce(
        (sum, item) =>
          sum +
          Number(item?.variation_info?.avg_price ?? 0) *
            (Number(item?.quantity ?? 0) - Number(item?.return_quantity ?? 0)),
        0,
      )
    : 0;
}

export function formatItemsList(items) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return items
    .map((item) => {
      const productId = item?.variation_info?.product_display_id ?? "N/A";
      const variationId = item?.variation_info?.display_id ?? "N/A";
      return `${productId} - ${variationId} x ${Number(item?.quantity ?? 0)}`;
    })
    .join(", ");
}

export function getPromotionNames(promotions) {
  if (!Array.isArray(promotions)) return null;
  const names = promotions
    .map((promotion) => promotion?.promotion_advance_info?.name?.trim())
    .filter(Boolean);
  return names.length ? names.join("; ") : null;
}

function getVietnamDateParts(isoString) {
  const value = formatUtcToUnixMs(isoString);
  if (value == null) return null;
  const date = new Date(value + 7 * 60 * 60 * 1000);
  return {
    day: String(date.getUTCDate()).padStart(2, "0"),
    month: String(date.getUTCMonth() + 1).padStart(2, "0"),
    year: String(date.getUTCFullYear()),
  };
}

export function getPeriodFields(statusHistoryText, insertedAt = null) {
  const confirmed = extractConfirmedDate(statusHistoryText);
  const created =
    extractCreatedDate(statusHistoryText) ?? getVietnamDateParts(insertedAt);
  return {
    monthCd: confirmed ? `${confirmed.year}.${confirmed.month}` : null,
    dayCd: confirmed ? `${confirmed.year}.${confirmed.month}.${confirmed.day}` : null,
    monthTd: created ? `${created.year}.${created.month}` : null,
  };
}

export function getOrderUniqueParts(order) {
  const orderId = getOrderId(order?.order_link);
  const systemId = order?.system_id;
  if (!orderId && systemId == null) {
    throw new Error("POS order is missing both order_id and system_id");
  }
  return {
    orderId,
    systemId: String(systemId ?? ""),
    orderUniqueKey: orderId ? `order:${orderId}` : `order:system:${systemId}`,
  };
}
