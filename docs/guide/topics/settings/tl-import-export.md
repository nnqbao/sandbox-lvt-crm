---
id: tl-import-export
title: Import và xuất danh sách người dùng bằng Excel
menu: Thiết lập tối cao → Thiết lập người dùng
roles: Administrator
keywords: import nguoi dung, excel, hang loat, xuat danh sach, xlsx
---
Tạo nhiều tài khoản giáo viên một lần, hoặc xuất danh sách đang hoạt động ra Excel.

1. Bấm **Tải file nhập liệu mẫu** [[1]].
2. Điền các cột `ho_ten`, `email`, `ma_phong_ban`, `ma_chuc_vu`, `ma_nhom_quyen`, `mat_khau_tam_thoi` (mã phải khớp mã đã tạo trong hệ thống).
3. Bấm **Import file nhập liệu** [[2]] và chọn file `.xlsx` (tối đa 2 MB).
4. Kiểm tra bảng **Xem trước** [[3]], rồi bấm **Xác nhận import … tài khoản** [[4]].
5. Muốn có danh sách hiện tại, bấm **Xuất DS người dùng** [[5]].

![Import người dùng: 1 file mẫu, 2 chọn file, 3 xem trước, 4 xác nhận, 5 xuất danh sách](tl-import-nguoi-dung)

Nếu có dòng sai (trùng email, sai mã phòng ban/chức vụ/nhóm quyền, mật khẩu quá ngắn…), hệ thống **không tạo tài khoản nào** và liệt kê lỗi theo dòng [[1]].

![Báo lỗi khi import: 1 danh sách dòng lỗi](tl-import-loi)

::: note
Import chỉ tạo tài khoản vai trò **User**. File tải lên được giữ tối đa 1 giờ rồi tự xóa. File xuất ra chỉ gồm tài khoản đang hoạt động, không có mật khẩu.
:::
