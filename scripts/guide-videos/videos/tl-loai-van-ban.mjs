// Thiết lập loại văn bản (Administrator). Fixtures: guide-shots/harness/fixtures/settings.js.
const form = 'form.admin-form';
const nameInput = { css: 'form.admin-form input', nth: 0 };
const codeInput = { css: 'form.admin-form input', nth: 1 };
const submit = 'form.admin-form .primary-button';
const card = (name) => ({ css: '.mgmt-card', text: name });
const cardButton = (name, label) => ({ css: '.mgmt-card button', text: label, exact: true, within: card(name) });
const added = [{ _id: 'dt_ttr', name: 'Tờ trình', code: 'TTR', active: true, sortOrder: 6, createdAt: 0, updatedAt: 0 }];

export default {
  id: 'tl-loai-van-ban',
  title: 'Thiết lập loại văn bản',
  intro: 'Loại văn bản là danh sách để chọn khi đính kèm file lúc tạo công việc hoặc khi nộp bằng chứng hoàn thành. Video này hướng dẫn thêm, sửa và xóa một loại.',
  scenes: [
    {
      scenario: 'admin',
      path: '/thiet-lap-chuc-vu',
      steps: [
        { step: 'Mở trang', caption: 'Ở cột menu bên trái, nhóm “Thiết lập tối cao”, bấm “Thiết lập loại văn bản”.', click: { css: '.shell-nav-button', text: 'Thiết lập loại văn bản' }, waitFor: form, hold: 1.2 },
        { top: true },
        { step: 'Tổng quan', caption: 'Phía trên là khung “Thêm loại văn bản”. Phía dưới là các loại đang dùng, mỗi loại một thẻ.', highlight: form, label: 'Khung thêm loại văn bản', hold: 3 },
        { highlight: '.card-list', label: 'Các loại đang dùng', hold: 3 },
        { clear: true, caption: 'Hệ thống tạo sẵn ba loại Kế hoạch, Biên bản và Báo cáo. Trường có thể thêm loại riêng.' },
        { step: 'Bước 1', caption: 'Thêm loại mới: gõ “Tên loại văn bản”, ví dụ “Tờ trình”.', type: nameInput, text: 'Tờ trình' },
        { caption: 'Gõ “Mã” ngắn, không dấu, ví dụ TTR. Mã tự chuyển thành chữ in hoa.', type: codeInput, text: 'ttr' },
        { caption: 'Bấm “+ Thêm loại văn bản”.', click: submit, hold: 1 },
      ],
    },
    {
      scenario: 'admin',
      path: '/thiet-lap-loai-van-ban',
      state: { extraDocumentTypes: added },
      waitFor: form,
      steps: [
        { caption: 'Loại mới hiện ở cuối danh sách và chọn được ngay khi đính kèm file.', highlight: card('Tờ trình'), label: 'Loại vừa thêm', hold: 4 },
        { clear: true, step: 'Bước 2', caption: 'Muốn đổi tên hoặc mã: bấm “Sửa” trên thẻ của loại đó.', click: cardButton('Tờ trình', 'Sửa'), hold: 1 },
        { caption: 'Khung phía trên chuyển thành “Sửa: …” và điền sẵn tên, mã hiện tại.', highlight: form, label: 'Đang sửa', hold: 3.5 },
        { clear: true, caption: 'Sửa lại tên, ví dụ “Tờ trình đề xuất”.', type: nameInput, text: ' đề xuất', keep: true },
        { caption: 'Bấm “Lưu loại văn bản”. Nếu đổi ý, bấm “Hủy” ở góc khung.', click: submit, hold: 0.6 },
        { js: "const name = [...document.querySelectorAll('.mgmt-card strong')].find((el) => el.textContent === 'Tờ trình'); if (name) name.textContent = 'Tờ trình đề xuất';", hold: 0.2 },
        { caption: 'Dòng “Đã cập nhật loại văn bản” hiện phía trên và thẻ đổi sang tên mới.', highlight: card('Tờ trình đề xuất'), label: 'Đã đổi tên', hold: 3 },
        { clear: true },
        { step: 'Bước 3', caption: 'Muốn xóa: bấm “Xóa” trên thẻ. Trình duyệt hỏi lại trước khi xóa, bấm “OK” để xác nhận.', point: cardButton('Tờ trình', 'Xóa'), hold: 2.5 },
        { step: 'Lưu ý', caption: 'Không xóa được loại văn bản đang có file sử dụng. Khi đó hãy giữ lại, hoặc chỉ sửa tên cho đúng.' },
      ],
    },
  ],
};
