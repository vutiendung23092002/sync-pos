const TEXT = 1;
const NUMBER = 2;
const SINGLE_SELECT = 3;
const MULTI_SELECT = 4;
const DATE = 5;

const text = (name) => ({ name, type: TEXT });
const number = (name, currency = false) => ({
  name,
  type: NUMBER,
  property: {
    formatter: "0",
    ...(currency ? { currency_code: "VND" } : {}),
  },
});
const singleSelect = (name) => ({
  name,
  type: SINGLE_SELECT,
  property: { options: [] },
});
const multiSelect = (name) => ({
  name,
  type: MULTI_SELECT,
  property: { options: [] },
});
const date = (name) => ({
  name,
  type: DATE,
  property: {
    auto_fill: false,
    date_formatter: "yyyy/MM/dd HH:mm",
  },
});

export const ORDER_FIELD_SCHEMA = [
  text("Unique Key"),
  text("Mã tuỳ chỉnh"),
  text("ID"),
  text("Mã vận đơn"),
  date("Ngày tạo đơn"),
  text("Tháng CD"),
  text("Tháng TD"),
  text("Ngày CD"),
  singleSelect("NV xử lý"),
  singleSelect("Người tạo"),
  singleSelect("Trạng thái"),
  number("Tổng tiền", true),
  number("Doanh thu bán hàng", true),
  number("Doanh số bán hàng", true),
  number("Giá trị hoàn", true),
  number("Tổng giá nhập SP", true),
  number("Tổng giảm giá", true),
  number("Giảm giá bằng điểm", true),
  number("Phí VC thu của khách", true),
  number("Số tiền khách phải trả", true),
  number("Phí trả cho ĐVVC", true),
  number("COD", true),
  number("Điểm thưởng nhận được"),
  number("Điểm thưởng đã sử dụng"),
  // number("Tổng điểm thưởng"),
  text("Gồm các mã sản phẩm"),
  text("Mã khuyến mãi"),
  text("Ghi chú để in"),
  singleSelect("Miễn phí ship"),
  singleSelect("Đơn vị VC"),
  text("Trạng thái giao hàng"),
  text("ID Khách hàng"),
  number("Số đơn hoàn thành"),
  text("Khách hàng"),
  text("Số điện thoại"),
  singleSelect("Khách mới/cũ"),
  singleSelect("Tỉnh/Thành phố"),
  text("Địa chỉ"),
  singleSelect("Nguồn"),
  singleSelect("Page ID"),
  text("Post ID"),
  text("Ad ID"),
  text("Dòng thời gian cập nhật trạng thái"),
  date("Last Synced At"),
];

export const ITEM_FIELD_SCHEMA = [
  text("Unique Key"),
  text("Order Unique Key"),
  text("ID"),
  text("Mã tuỳ chỉnh"),
  text("Order ID"),
  date("Thời gian tạo đơn"),
  singleSelect("Trạng thái"),
  singleSelect("Người xử lý"),
  number("Giảm giá đơn hàng", true),
  text("Tên sản phẩm"),
  singleSelect("Mã sản phẩm"),
  multiSelect("Danh mục"),
  number("Số lượng"),
  number("Số lượng hoàn"),
  number("Đơn giá", true),
  number("Giảm giá sản phẩm", true),
  number("Tổng giá nhập sản phẩm", true),
  // number("Giá vốn Kiot", true),
  number("Giá trị bán trước hoàn", true),
  number("Giá trị bán", true),
  text("Ghi chú sản phẩm"),
  text("Dòng thời gian cập nhật trạng thái"),
  text("Tháng CD"),
  text("Ngày CD"),
  text("Tháng TD"),
  singleSelect("Page ID"),
  singleSelect("Nguồn"),
  text("Post ID"),
  text("Ad ID"),
  date("Last Synced At"),
];

export function getLarkFieldSchema(kind) {
  if (kind === "order") return ORDER_FIELD_SCHEMA;
  if (kind === "item") return ITEM_FIELD_SCHEMA;
  throw new Error(`Unknown Lark schema kind: ${kind}`);
}

export function getSchemaFieldMap(schema) {
  return new Map(schema.map((field) => [field.name, field]));
}

export function findLarkSchemaIssues(existingFields, schema, requiredNames) {
  const required = new Set(requiredNames);
  const expectedByName = getSchemaFieldMap(schema);
  const existingByName = new Map(
    existingFields.map((field) => [field.field_name, field]),
  );
  const missing = [];
  const wrongType = [];

  for (const fieldName of required) {
    const expected = expectedByName.get(fieldName);
    if (!expected) {
      throw new Error(`Field ${fieldName} is not declared in schema-as-code`);
    }
    const existing = existingByName.get(fieldName);
    if (!existing) {
      missing.push(fieldName);
    } else if (existing.type != null && existing.type !== expected.type) {
      wrongType.push({
        fieldName,
        expectedType: expected.type,
        actualType: existing.type,
      });
    }
  }

  return { missing, wrongType };
}
