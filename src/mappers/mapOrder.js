import {
  buildStatusHistory,
  calcItemTotalDiscount,
  calcReturnRevenue,
  calcTotalImportCost,
  extractPostId,
  formatItemsList,
  formatUtcToUnixMs,
  getOrderUniqueParts,
  getPeriodFields,
  getPromotionNames,
} from "./helpers.js";
import { mapOrderStatus } from "./statusMap.js";

export const ZERO_REVENUE_STATUS = new Set([4, 5, 6, 7]);

export function mapOrder(data, { now = Date.now } = {}) {
  const { orderId, systemId, orderUniqueKey } = getOrderUniqueParts(data);
  const status = Number(data.status);
  const statusHistory = buildStatusHistory(data.status_history);
  const { monthCd, dayCd, monthTd } = getPeriodFields(
    statusHistory,
    data.inserted_at,
  );
  const totalDiscount =
    calcItemTotalDiscount(data.items) +
    Number(data.prepaid_by_point?.money ?? 0) +
    Number(data.total_discount ?? 0);
  const returnRevenue = calcReturnRevenue(data.items);
  const zeroRevenue = ZERO_REVENUE_STATUS.has(status);
  const revenue = zeroRevenue
    ? 0
    : Number(data.total_price ?? 0) - totalDiscount - returnRevenue;
  const sales = zeroRevenue ? 0 : revenue + Number(data.shipping_fee ?? 0);
  const totalImportCost = zeroRevenue ? 0 : calcTotalImportCost(data.items);
  const sourceName = data.order_sources_name?.trim() || null;
  const pageName = data.page?.name?.trim() || null;
  const orderSource =
    sourceName && pageName ? `${sourceName} / ${pageName}` : sourceName || pageName;
  const awardedPoint =
    (data.histories || []).find((history) => history?.awarded_point?.new != null)
      ?.awarded_point?.new ?? 0;
  const isNewCustomer = Number(data.customer?.order_count ?? 0) <= 1;

  return {
    uniqueKey: orderUniqueKey,
    rawInsertedAt: data.inserted_at ?? null,
    rawUpdatedAt: data.updated_at ?? null,
    fields: {
      "Unique Key": orderUniqueKey,
      "Mã tuỳ chỉnh": systemId,
      ID: orderId,
      "Mã vận đơn": data.partner?.extend_code ?? null,
      "Ngày tạo đơn": formatUtcToUnixMs(data.inserted_at),
      "Tháng CD": monthCd,
      "Tháng TD": monthTd,
      "Ngày CD": dayCd,
      "NV xử lý": data.assigning_seller?.name ?? null,
      "Người tạo": data.status_history?.[0]?.editor?.name ?? "Hệ thống",
      "Trạng thái": mapOrderStatus(status),
      "Tổng tiền": Number(data.total_price ?? 0),
      "Doanh thu bán hàng": revenue,
      "Doanh số bán hàng": sales,
      "Giá trị hoàn": returnRevenue,
      "Tổng giá nhập SP": totalImportCost,
      "Tổng giảm giá": totalDiscount,
      "Giảm giá bằng điểm": Number(data.prepaid_by_point?.money ?? 0),
      "Phí VC thu của khách": Number(data.shipping_fee ?? 0),
      "Số tiền khách phải trả": Number(data.money_to_collect ?? 0),
      "Phí trả cho ĐVVC": Number(data.partner_fee ?? 0),
      COD: Number(data.cod ?? 0),
      "Điểm thưởng nhận được": Number(awardedPoint),
      "Điểm thưởng đã sử dụng": Number(data.prepaid_by_point?.point ?? 0),
      // "Tổng điểm thưởng": Number(data.customer?.reward_point ?? 0),
      "Gồm các mã sản phẩm": formatItemsList(data.items),
      "Mã khuyến mãi": getPromotionNames(data.activated_promotion_advances),
      "Ghi chú để in": data.note_print ?? null,
      "Miễn phí ship": data.is_free_shipping === true ? "TRUE" : "FALSE",
      "Đơn vị VC": data.partner?.partner_name ?? null,
      "Trạng thái giao hàng": data.partner?.extend_update?.[0]?.status ?? null,
      "Khách hàng": data.customer?.name ?? null,
      "Số điện thoại":
        data.customer?.phone_numbers?.[0] ??
        data.shipping_address?.phone_number ??
        null,
      "Khách mới/cũ": isNewCustomer ? "Mới" : "Cũ",
      "Tỉnh/Thành phố": data.shipping_address?.province_name ?? null,
      "Địa chỉ": data.shipping_address?.full_address ?? null,
      Nguồn: orderSource,
      "Page ID": data.page?.id ?? null,
      "Post ID": extractPostId(data.post_id),
      "Ad ID": data.ad_id ?? null,
      "Dòng thời gian cập nhật trạng thái": statusHistory,
      "Last Synced At": now(),
    },
  };
}
