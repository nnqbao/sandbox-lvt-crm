---
id: tl-to-chuyen-mon
title: Thiết lập tổ chuyên môn
menu: Thiết lập tối cao → Thiết lập tổ chuyên môn
roles: Administrator
keywords: to chuyen mon, to van phong, ma to, ma_phong_ban, them user, phan quyen theo to
---
Tạo các tổ chuyên môn và xếp mỗi người vào **đúng một tổ**.

@video(tl-to-chuyen-mon)

Tổ chuyên môn theo cơ cấu của trường: giáo viên thuộc tổ của môn mình dạy (Tổ Toán – Tin, Tổ Ngữ văn…); Ban Giám hiệu, nhân viên, giám thị thuộc **Tổ Văn phòng**. Tổ quyết định tổ trưởng quản lý ai, Moderator theo tổ, phạm vi **Xem** ở Báo cáo, Bán trú, Đánh giá nhân sự, và việc giao theo tổ ở Công tác, Công việc.

1. Nhập **Tên tổ chuyên môn** [[1]] và **Mã** ngắn [[2]], ví dụ `TOAN`, `VP` (tối đa 20 ký tự, chữ không dấu, số, `-`, `_`).
2. Bấm **+ Thêm tổ chuyên môn** [[3]].
3. Trên thẻ của tổ, bấm **Thêm user** [[4]], gõ tên hoặc email để tìm rồi thêm người vào tổ; **Sửa** / **Xóa** khi cần.

![Thiết lập tổ chuyên môn: 1 tên, 2 mã, 3 Thêm tổ chuyên môn, 4 Thêm user](tl-to-chuyen-mon)

::: note Mỗi người một tổ
Thêm một người vào tổ này sẽ **chuyển** họ khỏi tổ cũ. Muốn gom người của nhiều tổ thành một nhóm (Ban Giám hiệu, Đảng uỷ, Công đoàn…) thì dùng [Phòng ban](#tl-phong-ban).
:::

::: warn
Chỉ xóa được tổ khi **không còn ai** trong tổ. Tạo lại đúng mã cũ sẽ khôi phục tổ đã xóa. Mã tổ là cột `ma_phong_ban` trong file nhập người dùng và file nhập công tác.
:::
