---
id: dd-diem-danh-excel
title: Nhập điểm danh bằng file Excel
menu: Điểm danh
roles: Giám thị
keywords: excel, import, file mau, xlsx, nhap nhieu lop
---
Điểm danh nhiều lớp một lúc bằng file Excel thay vì tích từng lớp.

1. Bấm **Tải file mẫu** [[1]] ở góc phải trang **Điểm danh**. Máy tải về file có sẵn tất cả lớp và học sinh của năm học.
2. Mở file, ghi chữ **x** vào cột **Vắng** cho học sinh vắng; để trống là có mặt (xem hình dưới).
3. Quay lại trang, bấm **Import Excel** [[2]].
4. Bấm **Chọn file** [[3]] và chọn file vừa điền (`.xlsx`, tối đa 2 MB).
5. Kiểm tra bảng xem trước [[4]]: mỗi lớp có bao nhiêu học sinh vắng, là ai.
6. Bấm **Xác nhận lưu** [[5]].

![Import Excel: 1 Tải file mẫu, 2 Import Excel, 3 chọn file, 4 bảng xem trước, 5 Xác nhận lưu](dd-import-xem-truoc)

![File mẫu: giữ cột Lớp học và Tên học sinh, ghi x ở cột Vắng](dd-file-mau)

Nếu file có lỗi, hệ thống **không lưu gì cả** và liệt kê từng dòng sai [[1]] [[2]]. Sửa đúng các dòng đó trong file rồi chọn lại file.

![File có lỗi: 1 thông báo chưa lưu gì, 2 danh sách dòng và lỗi](dd-import-loi)

::: note
Chỉ những lớp **có trong file** mới được lưu; lớp không có trong file giữ nguyên. Trong một lớp có trong file, học sinh không có dòng nào được tính là **có mặt**.
:::

::: warn
Không đổi tên cột, tên lớp hay tên học sinh trong file mẫu. Cột **Vắng** chỉ nhận chữ **x** hoặc để trống.
:::

### Câu hỏi thường gặp
??? Tôi nhập file hai lần thì sao?
Lần nhập sau ghi đè kết quả của các lớp có trong file, giống như lưu lại lớp đó trên màn hình.

??? Báo “Không có học sinh … trong lớp”?
Tên trong file phải khớp đúng tên trong danh sách lớp. Hãy dùng file vừa **Tải file mẫu** hôm nay, đừng dùng file cũ của năm trước.
