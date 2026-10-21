---
id: tl-nhom-quyen
title: Thiết lập nhóm quyền (kể cả Giám thị)
menu: Thiết lập tối cao → Thiết lập nhóm quyền
roles: Administrator
keywords: nhom quyen, an, xem, xem toi cao, giam thi, diem danh, menu
---
Quyết định mỗi nhóm User thấy menu nào và ở mức nào.

1. Nhập **Tên nhóm quyền** [[1]], **Mã nhóm quyền** (dùng khi import) và mô tả.
2. Bảng quyền [[2]] có 4 cột: **Ẩn**, **Xem**, **Xem tối cao**, **Giám thị**.
3. Hàng **Điểm danh** [[3]] chỉ chọn được **Ẩn** hoặc **Giám thị**. Các menu khác không có mức Giám thị (hiện dấu —).
4. Bấm **+ Thêm nhóm quyền** [[4]].

![Thêm nhóm quyền: 1 tên nhóm, 2 bốn mức quyền, 3 hàng Điểm danh chọn Giám thị, 4 Thêm nhóm quyền](tl-nhom-quyen)

Mỗi nhóm hiện thành một thẻ tóm tắt quyền từng menu [[1]]. Bấm **Thêm user** [[2]] để gán người vào nhóm; mỗi User chỉ thuộc một nhóm.

![Các thẻ nhóm quyền: 1 nhóm Giám thị với Điểm danh: Giám thị, 2 Thêm user](tl-nhom-quyen-the)

::: note
**Xem tối cao** cho xem rộng hơn (ví dụ toàn trường) ở menu có hỗ trợ. Mức **Giám thị** chỉ mở menu Điểm danh, không cho xem Lớp chủ nhiệm hay menu khác.
:::

::: warn
Chỉ xóa được nhóm quyền khi không còn ai trong nhóm.
:::
