import {
  buildStatusHistory,
  calcItemTotalDiscount,
  extractPostId,
  formatUtcToUnixMs,
  getOrderUniqueParts,
  getPeriodFields,
} from "./helpers.js";
import { mapOrderStatus } from "./statusMap.js";

function mapCategoryNames(categoryIds, categoryMap) {
  if (!Array.isArray(categoryIds) || categoryIds.length === 0) return null;
  const names = categoryIds
    .map((id) => categoryMap[id] ?? categoryMap[String(id)])
    .filter(Boolean);
  return names.length ? [...new Set(names)] : null;
}

export function mapOrderItems(
  order,
  { categoryMap = {}, costMap = {}, now = Date.now } = {},
) {
  const { orderId, systemId, orderUniqueKey } = getOrderUniqueParts(order);
  const statusHistory = buildStatusHistory(order.status_history);
  const { monthCd, dayCd, monthTd } = getPeriodFields(
    statusHistory,
    order.inserted_at,
  );
  const orderDiscount =
    Number(order.total_discount ?? 0) +
    Number(order.prepaid_by_point?.money ?? 0) +
    calcItemTotalDiscount(order.items);

  if (!Array.isArray(order.items)) return [];

  return order.items.map((item) => {
    if (item?.id == null) {
      throw new Error(`POS order ${orderUniqueKey} contains an item without id`);
    }

    const itemId = String(item.id);
    const uniqueItemKey = orderId
      ? `item:${orderId}:${itemId}`
      : `item:system:${systemId}:${itemId}`;
    const variation = item.variation_info ?? {};
    const sku = variation.product_display_id?.trim() || null;
    const lowercaseSku = sku?.toLowerCase() ?? null;
    const quantity = Number(item.quantity ?? 0);
    const returnQuantity = Number(item.return_quantity ?? 0);
    const retailPrice = Number(variation.retail_price ?? 0);
    const itemDiscount = Number(item.total_discount ?? 0);

    return {
      uniqueKey: uniqueItemKey,
      rawInsertedAt: order.inserted_at ?? null,
      rawUpdatedAt: order.updated_at ?? null,
      fields: {
        "Unique Key": uniqueItemKey,
        "Order Unique Key": orderUniqueKey,
        ID: itemId,
        "Mã tuỳ chỉnh": systemId,
        "Order ID": orderId,
        "Thời gian tạo đơn": formatUtcToUnixMs(order.inserted_at),
        "Trạng thái": mapOrderStatus(order.status),
        "Người xử lý": order.assigning_seller?.name ?? null,
        "Giảm giá đơn hàng": orderDiscount,
        "Tên sản phẩm": variation.name ?? null,
        "Mã sản phẩm": sku,
        "Danh mục": mapCategoryNames(variation.category_ids, categoryMap),
        "Số lượng": quantity,
        "Số lượng hoàn": returnQuantity,
        "Đơn giá": retailPrice,
        "Giảm giá sản phẩm": itemDiscount,
        "Tổng giá nhập sản phẩm":
          Number(variation.avg_price ?? 0) * (quantity - returnQuantity),
        // "Giá vốn Kiot": lowercaseSku ? costMap[lowercaseSku] ?? null : null,
        "Giá trị bán trước hoàn": quantity * retailPrice - itemDiscount,
        "Giá trị bán": (quantity - returnQuantity) * retailPrice - itemDiscount,
        "Ghi chú sản phẩm": item.note_product ?? null,
        "Dòng thời gian cập nhật trạng thái": statusHistory,
        "Tháng CD": monthCd,
        "Ngày CD": dayCd,
        "Tháng TD": monthTd,
        "Page ID": order.page?.id ?? null,
        Nguồn: order.page?.name ?? null,
        "Post ID": extractPostId(order.post_id),
        "Ad ID": order.ad_id ?? null,
        "Last Synced At": now(),
      },
    };
  });
}
