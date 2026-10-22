---
id: ct-import-excel
title: Nhập nhiều công tác bằng Excel
menu: Lịch công tác → Import Excel
roles: Tổ trưởng, Tổ phó, Văn thư
keywords: import, excel, nhap hang loat, file mau, lich tuan, dia diem
---
Nhập cả tuần lịch công tác một lần từ file Excel.

1. Bấm **Import Excel** ở góc phải trang Lịch công tác.
2. Bấm **Tải file nhập liệu mẫu** [[1]] nếu chưa có file mẫu.
3. Điền mỗi dòng một công tác, rồi bấm **Import file nhập liệu** [[2]] và chọn file.
4. Xem lại danh sách **Xem trước** [[3]].
5. Bấm **Xác nhận import … công tác** [[4]].

![Import Excel công tác: 1 file mẫu, 2 chọn file, 3 xem trước, 4 xác nhận](ct-import)

Các cột trong file mẫu: `ten_cong_tac`, `noi_dung`, `dia_diem`, `ngay_bat_dau`, `gio_bat_dau`, `ngay_ket_thuc`, `gio_ket_thuc`, `ca_ngay` (`1`/`0`), `ma_phong_ban`, `email_tham_gia`, `thanh_phan_khac`. Nhiều phòng ban hoặc email thì cách nhau bằng dấu phẩy. Cột `dia_diem` là chữ gõ tự do (bắt buộc, tối đa 200 ký tự), ví dụ `Hội trường` hoặc `Sân trường`; không cần khớp với danh mục nào.

Nếu có dòng sai, hệ thống **chưa nhập dòng nào** và liệt kê **Báo cáo lỗi** theo từng dòng [[1]]. Sửa file rồi import lại.

![Báo cáo lỗi khi import: 1 danh sách dòng lỗi](ct-import-loi)

::: warn
Tổ trưởng/tổ phó **không điền mã phòng ban**; chỉ điền email người cấp dưới trong tổ hoặc cột thành phần khác.
:::
