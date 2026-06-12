# POS PagesFM to Lark Bitable Sync

Node.js 20 CLI thay thế workflow n8n đồng bộ đơn PagesFM POS sang hai bảng
Lark Bitable:

- `facebook_order_td`
- `facebook_order_item_td`

Mỗi ngày được xử lý tuần tự. Dữ liệu POS và Lark đều được phân trang, dedupe bằng
`Unique Key`, sau đó batch create/update/delete tối đa 100 records/request.

## Cài đặt local

```bash
cp .env.example .env
npm install
npm test
```

Chạy dry-run:

```bash
FROM=2026-03-01 TO=2026-03-31 DRY_RUN=true npm run sync
```

Chạy ghi dữ liệu:

```bash
FROM=2026-03-01 TO=2026-03-31 npm run sync
```

Trên PowerShell:

```powershell
$env:FROM="2026-03-01"
$env:TO="2026-03-31"
$env:DRY_RUN="true"
npm run sync
```

Nếu không truyền `FROM` và `TO`, chương trình đồng bộ từ ngày hiện tại theo giờ
Việt Nam trừ `SYNC_LOOKBACK_DAYS` đến ngày hiện tại. Mặc định là `14`.

## Biến môi trường

| Tên | Bắt buộc | Mô tả |
| --- | --- | --- |
| `POS_API_KEY` | Có | PagesFM POS API key |
| `POS_SHOP_ID` | Có | Shop ID dùng trong POS endpoint |
| `DATABASE_URL` | Có | PostgreSQL connection string |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | Không | `true` mặc định; chỉ đặt `false` khi môi trường Supabase báo lỗi certificate chain |
| `LARK_APP_ID` | Có | Lark internal app ID |
| `LARK_APP_SECRET` | Có | Lark internal app secret |
| `SYNC_ENV` | Không | `production` mặc định; dùng `test` để chỉ ghi vào bảng test |
| `FROM` | Không | Ngày đầu `YYYY-MM-DD`; phải đi cùng `TO` |
| `TO` | Không | Ngày cuối `YYYY-MM-DD`; phải đi cùng `FROM` |
| `DRY_RUN` | Không | `false` mặc định |
| `SYNC_LOOKBACK_DAYS` | Không | `14` mặc định |
| `LOG_LEVEL` | Không | Pino log level, mặc định `info` |
| `LOG_PRETTY` | Không | `true` để log local có màu và dễ đọc; Actions nên giữ `false` |

Table ID và Base ID được đọc theo tháng/năm từ
`han_lark_base.tables`. Giá vốn được đọc từ
`kiot_legiahan.product_cost` bằng parameterized query.

## Chạy vào bảng test

Tạo một Lark Base test riêng hoặc hai table test riêng có đầy đủ field giống
production. Sau đó thêm config test vào Supabase:

```sql
INSERT INTO han_lark_base.tables
  (base_id, table_id, type, month, year)
VALUES
  ('BASE_ID_TEST', 'TABLE_ID_ORDER_TEST', 'facebook_order_td_test', 6, 2026),
  ('BASE_ID_TEST', 'TABLE_ID_ITEM_TEST', 'facebook_order_item_td_test', 6, 2026);
```

Chạy test có ghi dữ liệu:

```powershell
$env:SYNC_ENV="test"
$env:FROM="2026-06-01"
$env:TO="2026-06-01"
$env:DRY_RUN="false"
npm.cmd run sync
```

Với `SYNC_ENV=test`, chương trình chỉ query hai type:

```txt
facebook_order_td_test
facebook_order_item_td_test
```

Nếu thiếu config test đúng tháng/năm, chương trình dừng thay vì fallback sang
production. Để quay lại production, đặt `SYNC_ENV=production`.

## GitHub Actions

Workflow: `.github/workflows/sync-pos-lark.yml`.

Tạo các repository secrets:

```txt
POS_API_KEY
POS_SHOP_ID
DATABASE_URL
LARK_APP_ID
LARK_APP_SECRET
```

Workflow hỗ trợ `workflow_dispatch` với `from`, `to`, `dry_run`; lịch tự động chạy
mỗi 2 giờ. `concurrency.group=pos-lark-sync` và PostgreSQL transaction advisory
lock cùng ngăn hai tiến trình chạy chồng nhau. Transaction lock tương thích với
Supabase Transaction Pooler và tự nhả khi transaction kết thúc hoặc connection mất.

Cron có thể lấy khoảng ngày từ GitHub Repository Variables:

```txt
SYNC_FROM
SYNC_TO
SYNC_ENV
DRY_RUN
SYNC_LOOKBACK_DAYS
DATABASE_SSL_REJECT_UNAUTHORIZED
LOG_LEVEL
```

Tạo tại `Settings → Secrets and variables → Actions → Variables`. `SYNC_FROM` và
`SYNC_TO` phải cùng có giá trị hoặc cùng để trống. Khi chạy manual, input `from/to`
được ưu tiên hơn Variables. Nếu cả hai Variables để trống, cron dùng
`SYNC_LOOKBACK_DAYS`, mặc định `14`.

Với Supabase Pooler của project này:

```txt
DATABASE_SSL_REJECT_UNAUTHORIZED=false
```

Workflow cũng mặc định dùng `false` nếu Variable này chưa được tạo.

Schema Lark được định nghĩa trực tiếp trong `src/schemas/larkSchema.js`, không
phụ thuộc vào bất kỳ bảng Lark mẫu nào. Khi chạy thật, field thiếu được tạo từ
schema này. Field đã tồn tại nhưng sai type sẽ làm sync dừng; code không tự xóa
hoặc đổi type để tránh mất dữ liệu.

Kiểm tra hoặc bổ sung schema cho 48 bảng trong base test:

```bash
npm run schema:check
npm run schema:apply
```

`schema:check` chỉ đọc metadata. `schema:apply` chỉ tạo field thiếu và field
Formula `Ngày TD`.

## Phân bảng TD/CD theo tháng

Mỗi đơn được đồng bộ độc lập vào 4 loại bảng:

```txt
facebook_order_td[_test]       theo trường Tháng TD
facebook_order_item_td[_test]  theo trường Tháng TD
facebook_order_cd[_test]       theo trường Tháng CD
facebook_order_item_cd[_test]  theo trường Tháng CD
```

Tra cứu cấu hình chỉ dùng `type + month`, không dùng `year`. Vì vậy dữ liệu
`2025.12` và `2026.12` cùng dùng cấu hình tháng `12`. Trong
`han_lark_base.tables` phải có đúng một dòng cho mỗi cặp `type + month`.

Để tạo đủ cấu hình 12 tháng cho môi trường test, chạy file:

```txt
sql/seed-test-table-config-12-months.sql
```

File seed hiện trỏ cả 12 tháng của mỗi type vào cùng một bảng Lark test. Khi có
bảng Lark riêng cho từng tháng, đổi `table_id` tương ứng trước khi chạy SQL.

Hai bảng CD phải có cùng các field ghi dữ liệu như bảng TD tương ứng. Tối thiểu:

```txt
Order CD: Unique Key, Last Synced At, Ngày tạo đơn, Ngày TD, Tháng CD
Item CD: Unique Key, Order Unique Key, Last Synced At, Thời gian tạo đơn, Ngày TD, Tháng CD
```

`Ngày TD` là Formula và sẽ được tạo tự động khi chạy thật nếu chưa có. Các field
còn thiếu khác sẽ làm tiến trình dừng trước khi ghi dữ liệu để tránh mất field
hoặc tạo trùng.

Ví dụ cron chạy bảng test và chỉ lập kế hoạch:

```txt
SYNC_ENV=test
DRY_RUN=true
```

Khi chạy manual, `sync_env` và `dry_run` trên form Run workflow được ưu tiên hơn
Repository Variables.

## Trường Lark bắt buộc

### Order table

Technical:

```txt
Unique Key
Ngày TD
Last Synced At
```

Business:

```txt
Mã tuỳ chỉnh
ID
Mã vận đơn
Ngày tạo đơn
Tháng CD
Tháng TD
Ngày CD
NV xử lý
Người tạo
Trạng thái
Tổng tiền
Doanh thu bán hàng
Doanh số bán hàng
Giá trị hoàn
Tổng giá nhập SP
Tổng giảm giá
Giảm giá bằng điểm
Phí VC thu của khách
Số tiền khách phải trả
Phí trả cho ĐVVC
COD
Điểm thưởng nhận được
Điểm thưởng đã sử dụng
Tổng điểm thưởng
Gồm các mã sản phẩm
Mã khuyến mãi
Ghi chú để in
Miễn phí ship
Đơn vị VC
Trạng thái giao hàng
Khách hàng
Số điện thoại
Khách mới/cũ
Tỉnh/Thành phố
Địa chỉ
Nguồn
Page ID
Post ID
Ad ID
Dòng thời gian cập nhật trạng thái
```

### Order item table

Technical:

```txt
Unique Key
Order Unique Key
Ngày TD
Last Synced At
```

Business:

```txt
ID
Mã tuỳ chỉnh
Order ID
Thời gian tạo đơn
Trạng thái
Người xử lý
Giảm giá đơn hàng
Tên sản phẩm
Mã sản phẩm
Danh mục
Số lượng
Số lượng hoàn
Đơn giá
Giảm giá sản phẩm
Tổng giá nhập sản phẩm
Giá vốn Kiot
Giá trị bán trước hoàn
Giá trị bán
Ghi chú sản phẩm
Dòng thời gian cập nhật trạng thái
Tháng CD
Ngày CD
Tháng TD
Page ID
Nguồn
Post ID
Ad ID
```

Các field ngày Lark phải là Date field nhận Unix milliseconds. `Danh mục` phải
chấp nhận mảng giá trị.

`Ngày TD` phải là Formula field trả về text `YYYY.MM.DD`:

```txt
Order: TEXT([Ngày tạo đơn], "YYYY.MM.DD")
Item:  TEXT([Thời gian tạo đơn], "YYYY.MM.DD")
```

Code tự tạo Formula field này khi chạy ghi thật nếu field chưa tồn tại. Dry-run
chỉ validate schema và không thay đổi Lark.

## Chống trùng

- Order key: `order:{order_id}`, fallback `order:system:{system_id}`.
- Item key: `item:{order_id}:{item_id}`, fallback
  `item:system:{system_id}:{item_id}`.
- POS trùng key: giữ bản có `updated_at` mới nhất, sau đó `inserted_at`; bằng nhau
  thì giữ phần tử cuối.
- Lark trùng key: giữ record có `created_time` mới nhất, xóa các record còn lại.
- Existing key được update; chỉ missing key mới được create.

## Quy tắc xóa

- Order: xóa trạng thái `Đã xoá`.
- Item: xóa trạng thái `Đã xoá` hoặc `Đã huỷ`.
- Xóa duplicate Lark theo `Unique Key`.
- Xóa record Lark không còn trong POS chỉ khi toàn bộ pagination POS của ngày đã
  hoàn tất thành công.
- Record Lark được query trực tiếp theo Formula field, ví dụ
  `CurrentValue.[Ngày TD] = "2026.03.23"`. Mỗi ngày chỉ paginate record của đúng
  ngày đó, không scan lại toàn bộ bảng tháng.
- `DRY_RUN=true` chỉ lập và log kế hoạch, không gọi batch write.

## Vận hành

- Log có `step`, tiến độ ngày, pagination, batch progress, số record và
  `elapsed_ms`. Đặt `LOG_PRETTY=true` khi chạy local.
- Mốc ngày POS luôn được tính bằng UTC+7, không phụ thuộc timezone runner.
- POS timestamp không có hậu tố timezone được hiểu là UTC trước khi chuyển sang
  Unix milliseconds; Lark sẽ hiển thị theo timezone UTC+7 của Base.
- POS API loại nguồn `-3` và `-9` ngay tại server bằng hai query parameter
  `order_sources` lặp riêng cùng `is_filter_exclude_source=true`, giúp tránh tải
  phần lớn đơn Shopee/TikTok. Sau đó client vẫn giữ guard chỉ nhận
  `order_sources_name=Facebook` hoặc nguồn rỗng để loại response ngoại lệ.
- Sync ngày chạy tuần tự để giảm rate limit.
- HTTP 429, 5xx và lỗi mạng retry tối đa 5 lần với backoff 1/2/4/8/16 giây;
  `Retry-After` được ưu tiên.
- Nếu một ngày lỗi, tiến trình dừng và exit code khác 0. Không có bước xóa sau
  một lần tải POS dở dang.
- Cấu hình bảng được resolve lại theo từng ngày, nên range qua tháng được hỗ trợ.
