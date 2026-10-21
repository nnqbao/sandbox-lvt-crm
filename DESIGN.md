# DESIGN.md — Quy chuẩn giao diện LVT CRM

Áp dụng cho **mọi thay đổi giao diện** trên web (`src/`), Android (`android-app/`) và iOS UIKit (`ios-uikit-lvt/`).

- Nguồn gốc: các nguyên tắc trong mục **Thư viện giao diện** của prototype ban đầu (`design/component-library/index.html`, admin xem tại `/thu-vien-giao-dien`). Màu và font đã được thay bằng **bộ token mà app đang dùng thật** (`src/styles.css`). Prototype dùng School Blue `#263985` và font Be Vietnam Pro. Hai giá trị đó **không còn áp dụng**.
- File này mô tả chuẩn cho code **mới hoặc đang sửa**. Không bắt buộc viết lại màn hình cũ. Khi đã chạm vào một màn hình thì đưa phần mình sửa về đúng chuẩn.
- Muốn đổi chuẩn (thêm màu, đổi font, đổi cỡ chữ tối thiểu…) thì sửa file này trước, trong cùng PR, và nói rõ lý do.

## 1. Màu sắc

### Token gốc (web: `:root` trong `src/styles.css`)

| Token | Giá trị | Dùng cho |
|---|---|---|
| `--lvt-ink` | `#16243e` | Chữ chính |
| `--lvt-navy` | `#14355f` | Tiêu đề, nút chính, trạng thái đang chọn |
| `--lvt-blue` | `#28639a` | Liên kết, thông tin |
| `--lvt-teal` | `#138f7b` | Nhấn tích cực, hoàn thành, viền mục đang chọn (nền, viền, icon) |
| `--lvt-teal-text` | `#0e7363` | **Chữ** màu teal (link, nhãn tích cực). `--lvt-teal` làm chữ chỉ đạt khoảng 3.7–4.0:1 |
| `--lvt-coral` | `#e36d55` | Lỗi, quá hạn, hành động nguy hiểm |
| `--lvt-coral-strong` | `#c0472f` | Nền đặc có chữ trắng (badge số đếm…), đạt 5.0:1 |
| `--lvt-gold` | `#e9ad43` | Cảnh báo, chờ xử lý |
| `--lvt-paper` | `#fffdf7` | Nền thẻ ấm |
| `--lvt-line` | `#dce5eb` | Viền, đường kẻ |
| `--lvt-muted` | `#5a6b7c` | Chữ phụ, chú thích (≥ 5:1 trên mọi nền sáng của app) |
| `--lvt-page` | `#f4f7f8` | Nền trang |
| `--lvt-hero` | gradient navy → teal | Banner đầu trang |
| `--lvt-ink-soft` | `#2b465e` | Chữ phụ đậm (giá trị trong form, mô tả quan trọng) |
| `--lvt-surface` | `#fbfcfc` | Nền ô nhập, khối phụ trên card trắng |
| `--lvt-surface-muted` | `#eef2f5` | Nền hover, nền trung tính nhạt |

### Token trạng thái (cặp chữ / nền)

| Trạng thái | Chữ | Nền | Viền |
|---|---|---|---|
| Thành công / hoàn thành | `--lvt-success-text` `#14604e` | `--lvt-success-bg` `#edf8f5` | `--lvt-line` |
| Lỗi / quá hạn / từ chối | `--lvt-danger-text` `#9b4539` | `--lvt-danger-bg` `#ffebe7` | `--lvt-danger-line` `#efc7bf` |
| Cảnh báo / chờ xử lý | `--lvt-warning-text` `#7a4b07` | `--lvt-warning-bg` `#fff3c8` | – |
| Thông tin | `--lvt-blue` | `--lvt-info-bg` `#e4eef8` | – |

Mọi cặp chữ/nền ở trên đạt ≥ 5.3:1.

Quy tắc:

- **Chỉ dùng token, không tự đặt mã màu mới trong từng trang.** Hiện CSS có khoảng 680 mã hex khác nhau. Đừng tăng con số này.
- Module có thể khai báo alias riêng, nhưng **phải trỏ về token gốc**, kèm giá trị dự phòng: `--work-teal: var(--lvt-teal, #138f7b);`. Đây là mẫu đang dùng ở work, duties, chat, people-review, management, profile, boarding, reports.
- Nền nhạt của trạng thái (tint) đặt thành cặp token `--x` / `--x-bg` cạnh nhau, giống homeroom.
- Cần một màu mới thật sự thì thêm vào `:root` (hoặc vào bộ token của module) và ghi vào bảng trên.
- Tỉ lệ khuyên dùng: khoảng 80% trung tính (ink, muted, line, page, trắng), 15% navy/blue/teal, 5% màu trạng thái.

### Màu trạng thái

- **Không bao giờ chỉ dựa vào màu.** Badge hay trạng thái luôn có chữ rõ nghĩa ("Quá hạn", "Chờ duyệt", "Hoàn thành"…).
- Mỗi bản ghi chỉ hiển thị **một trạng thái chính**.
- Trạng thái chung: hoàn thành / hợp lệ dùng teal; chờ / cảnh báo dùng gold; lỗi / quá hạn / từ chối dùng coral; thông tin dùng blue; mặc định dùng muted.
- Điểm danh Lớp chủ nhiệm dùng bộ token riêng trong `src/homeroom/homeroom.css`: `--hr-present`, `--hr-late`, `--hr-excused`, `--hr-unexcused`, `--hr-pending`, `--hr-nodata`, mỗi màu có biến thể `-bg`. Mọi chỗ hiển thị trạng thái điểm danh (web, báo cáo, PDF, native) dùng đúng bộ này.

## 2. Chữ

- Font: **Montserrat Variable** (`@fontsource-variable/montserrat`), fallback `ui-sans-serif, system-ui, sans-serif`. Không thêm font khác.
- **Ngoại lệ duy nhất:** bảng lịch chính thức của **Lịch công tác** (`src/duties/sharedDutySchedule.css`, class `lct-*`: quốc hiệu, tiêu đề, bảng lịch, bản in/PDF) dùng **Times New Roman**, để giống mẫu Word mà thầy cô đã quen. Bản PDF nhúng **Tinos** (Regular/Bold, cùng số đo với Times New Roman, OFL) vì không thể nhúng Times New Roman. Không dùng Times New Roman / Tinos ở chỗ nào khác; PDF Lớp chủ nhiệm giữ Noto Sans.
- Không dùng Georgia hay font serif cho số liệu hoặc tiêu đề trang trí. Báo cáo đã chuyển sang Montserrat; vài chỗ cũ (Bán trú, Công việc, Đánh giá nhân sự, banner Quản trị) sẽ chuyển dần khi sửa tới.
- Cỡ chữ cho UI mới:

| Vai trò | Cỡ | Đậm |
|---|---|---|
| Tiêu đề trang | 22–26px (mobile 19px) | 800 |
| Tiêu đề khối / card | 15–17px | 800 |
| Nội dung, ô nhập, bảng | **14px** (bảng dày có thể 13px) | 400–600 |
| Nhãn, chú thích, meta | 12–13px | 600–700 |
| Nhãn nhóm VIẾT HOA (`.nav-label`) | 10–11px, `letter-spacing: .1em` | 800 |

- **Không dùng dưới 12px cho chữ người dùng phải đọc.** Mức 8–11px chỉ dành cho nhãn trang trí viết hoa, số đếm trong badge, trục biểu đồ. Code hiện có nhiều chữ 8–10px. Không dùng thêm.
- `line-height` cho đoạn văn từ 1.45 trở lên.
- Chỉ dùng các mức đậm 400, 600, 700, 800. Tránh 750, 850, 900 trong code mới.

## 3. Khoảng cách, bo góc, đổ bóng

- Khoảng cách theo bước **4px**: 4, 8, 12, 16, 20, 24, 32. `gap` phổ biến nhất là 8, 12, 16. Padding ô nhập / nút thường là `10px 12px` hoặc `12px 14px`.
- Bo góc:
  - Ô nhập, nút: **8px**
  - Card, panel: **12px** (homeroom 14px)
  - Modal: **16px**
  - Pill, badge, avatar: `999px` / `50%`
  - Không đặt thêm các giá trị lẻ như 7, 9, 11px.
- Đổ bóng nhẹ, ám màu navy, ví dụ `--hr-shadow`. Focus ring dùng `0 0 0 3px rgba(19, 143, 123, .1)` (teal) hoặc `outline` rõ ràng. **Không xóa outline mà không có focus ring thay thế.**

## 4. Nút bấm và hành động

- Chiều cao chuẩn **42px**. Nút gọn trong bảng hoặc toolbar 36px. Vùng chạm trên mobile tối thiểu 44px.
- Mỗi vùng (form, modal, toolbar) chỉ có **một nút chính**: nền navy, chữ trắng. Các hành động khác là nút phụ (viền `--lvt-line`, chữ navy) hoặc nút chữ.
- Hành động nguy hiểm (xóa, khóa, giải tán nhóm) dùng coral và **luôn có bước xác nhận**, nêu rõ tác động.
- Nhãn nút là động từ ngắn: "Lưu", "Gửi duyệt", "Nhập file". Không dùng "OK" hay "Xác nhận" chung chung.
- Nút chỉ có icon phải có `aria-label` / `title` tiếng Việt.
- Khi đang xử lý: khóa nút, đổi nhãn ("Đang lưu…"), không cho bấm lặp.

## 5. Biểu mẫu

- Nhãn luôn **nằm trên** ô nhập. **Không dùng placeholder thay nhãn.**
- Lỗi hiện **ngay dưới ô** liên quan, bằng màu coral kèm chữ. Lỗi tổng (từ server) hiện ở đầu form.
- Trường bắt buộc được đánh dấu nhất quán. Ngày dùng định dạng `dd/mm/yyyy` khi hiển thị; dữ liệu gửi đi theo quy ước của backend (`YYYY-MM-DD`).
- Thông báo lỗi bằng tiếng Việt và dễ hiểu. Không hiển thị mã lỗi thô (`FORBIDDEN`, stack trace) cho người dùng.

## 6. Card, bảng, danh sách

- Card: nền trắng hoặc `--lvt-paper`, viền `--lvt-line`, bo 12px. **Không lồng card trong card.**
- Bảng: tiêu đề cột chữ nhỏ đậm màu muted, dòng có đường kẻ `--lvt-line`, hover nền rất nhạt. Cột số căn phải. Trên mobile cho bảng cuộn ngang (`overflow-x: auto`) thay vì bóp cột.
- Trang danh sách theo thứ tự: tiêu đề + mô tả ngắn → bộ lọc / tìm kiếm → tóm tắt số lượng → danh sách → phân trang hoặc tải thêm.
- Ô tìm kiếm để trống thì hiện toàn bộ danh sách, không hiện trang rỗng.

## 7. Phản hồi, trạng thái rỗng, modal

- Mỗi màn hình có đủ 4 trạng thái: **đang tải**, **rỗng** (nói rõ vì sao và bước tiếp theo), **lỗi** (kèm cách thử lại), **có dữ liệu**.
- Toast cho kết quả ngắn, khoảng 2–3 giây, không chứa thông tin cần thao tác. Lỗi chặn thì hiện tại chỗ.
- Modal: một mục đích, tiêu đề rõ, nút chính ở bên phải, đóng được bằng Esc và nút "Đóng". Không mở modal chồng lên modal.

## 8. Bố cục và responsive

- Khung: sidebar trái 256px (thu gọn được) + header + vùng nội dung.
- **Menu sidebar** (tỉ lệ theo prototype Thư viện giao diện, màu/font của app): mục chính 14px / đậm 600, mục con trong nhóm 13px, cao 42px, cách nhau 5px, chữ `--lvt-ink-soft`; hover/đang chọn chữ `--lvt-navy` trên nền `--lvt-success-bg`, mục đang chọn có thanh nhấn teal 3px bên trái và đậm 800. Tiêu đề nhóm viết hoa 11px `--lvt-muted`. Logo 52px. Ở ≤ 900px sidebar 244px để tên mục không xuống dòng.
- Breakpoint: **900px** (sidebar 244px), **680px** (mobile: sidebar thành ngăn trượt, form một cột, padding hai bên 16px). Dùng hai mốc này. Tránh tạo thêm mốc mới như 560, 620, 720, 820px nếu không cần.
- Không để trang cuộn ngang ở chiều rộng 360px. Nội dung rộng (bảng, lịch) thì cuộn ngang bên trong khung của nó.
- Tôn trọng `prefers-reduced-motion` với hiệu ứng lớn. Hiệu ứng chuyển tiếp chỉ khoảng 0.18–0.24s.

## 9. Truy cập và nội dung

- Độ tương phản chữ thường tối thiểu 4.5:1. `--lvt-muted` trên nền trắng chỉ dùng cho chữ phụ.
- Mọi thao tác dùng được bằng bàn phím, focus phải nhìn thấy được.
- Ảnh có `alt` tiếng Việt. Icon trang trí đặt `aria-hidden`.
- Văn phong tiếng Việt có dấu, ngắn gọn, thống nhất thuật ngữ trong app: "Lịch công tác", "Công việc", "Lớp chủ nhiệm", "Trao đổi", "Giám thị"…

## 10. Native (Android / iOS)

- Android hiện dùng Material 3 với **màu động** (`dynamicColor = true` trong `ui/theme/Theme.kt`), nên màu thương hiệu chưa cố định. iOS định nghĩa bảng màu riêng (accent, canvas, card…) trong `RootTabBarController.swift`.
- Với màn hình native mới hoặc đang sửa, ánh xạ về cùng ý nghĩa với web: navy là hành động chính, teal là tích cực, gold là chờ, coral là lỗi. Trạng thái điểm danh dùng đúng giá trị `--hr-*`. Luôn có nhãn chữ, không chỉ dùng màu.
- Hỗ trợ dark mode bằng màu theo hệ thống. Không hard-code màu chữ trắng / đen trên nền động.
- Mọi thay đổi native phải tăng version và build number (`.cursor/rules/native-app-version.mdc`).

## Chống tăng nợ giao diện

`tests/design-ratchet.test.mjs` đếm theo từng file CSS trong `src/`: số mã màu viết thẳng (không tính dòng khai báo token) và số cỡ chữ dưới thang chuẩn (dưới 12px, hoặc dưới 11px với nhãn viết hoa). Con số không được vượt mốc trong `tests/design-baseline.json`; file CSS mới có mốc bằng 0. Khi dọn một file thì **hạ** mốc trong JSON. Không bao giờ nâng mốc để PR pass.

## Checklist trước khi gửi PR có đổi giao diện

- [ ] Không có mã màu mới ngoài token, hoặc đã thêm token và cập nhật file này (`npm test` có test chặn tăng)
- [ ] Chữ người dùng đọc từ 12px trở lên, nội dung chính 14px
- [ ] Một nút chính mỗi vùng, hành động nguy hiểm có xác nhận
- [ ] Nhãn nằm trên ô nhập, lỗi hiện sát ô, không dùng placeholder thay nhãn
- [ ] Có đủ trạng thái đang tải, rỗng, lỗi
- [ ] Đã xem ở 360px và 1280px, không cuộn ngang cả trang
- [ ] Focus nhìn thấy được, icon button có nhãn
