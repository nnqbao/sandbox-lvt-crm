// Thiết lập năm học (Administrator). Fixtures: guide-shots/harness/fixtures/attendance.js.
const yearForm = '#sy-year-form';
const field = (label) => ({ css: 'input', within: { css: `${yearForm} label`, text: label } });

export default {
  id: 'nh-thiet-lap-nam-hoc',
  title: 'Thiết lập năm học',
  intro: 'Tạo năm học, đặt ngày bắt đầu học kỳ II, đánh dấu ngày nghỉ lễ và ngày học bù để Điểm danh, Lịch dạy và Học bạ tính đúng ngày học.',
  scenes: [
    {
      scenario: 'admin',
      path: '/thiet-lap-mon-hoc',
      steps: [
        { step: 'Mở trang', caption: 'Ở cột menu bên trái, nhóm “Thiết lập tối cao”, bấm “Thiết lập năm học”.', click: { css: '.shell-nav-button', text: 'Thiết lập năm học' }, waitFor: '.sy-runs', hold: 1.2 },
        { top: true },
        { chapter: 'Tổng quan', step: 'Tổng quan', caption: 'Bên trái là danh sách năm học. Nhãn “Mặc định” là năm học mọi người đang làm việc; “Đã khóa” là năm cũ, chỉ xem.', highlight: '.sy-rail', label: 'Danh sách năm học', hold: 6 },
        { caption: 'Bên phải là thông tin năm học đang chọn: số ngày học, số ngày nghỉ lễ, ngày học bù, ngày bắt đầu học kỳ II và giờ nhắc điểm danh.', highlight: '.sy-stats', label: 'Thống kê năm học', hold: 7 },
        { chapter: 'Tạo năm học', clear: true, step: 'Bước 1', caption: 'Tạo năm học mới: bấm “+ Thêm” ở đầu danh sách năm học.', click: '.sy-add', waitFor: yearForm, hold: 1.5 },
        { caption: 'Hệ thống điền sẵn ngày bắt đầu, ngày kết thúc và tên năm học theo năm kế tiếp. Thầy cô chỉ cần kiểm tra và sửa nếu trường có kế hoạch khác.', highlight: yearForm, hold: 6 },
        { clear: true, caption: 'Chọn “Ngày bắt đầu” năm học theo kế hoạch của trường.', fill: field('Ngày bắt đầu'), value: '2027-09-06' },
        { caption: 'Chọn “Ngày kết thúc” năm học.', fill: field('Ngày kết thúc'), value: '2028-05-31' },
        { caption: '“Giờ nhắc thiếu điểm danh”: quá giờ này mà lớp chưa được điểm danh thì hệ thống báo đỏ cho Ban Giám hiệu.', fill: field('Giờ nhắc thiếu điểm danh'), value: '08:30' },
        { caption: '“Ngày bắt đầu học kỳ II” dùng để chia điểm Học bạ theo học kỳ. Có thể để trống và đặt sau.', fill: field('Ngày bắt đầu học kỳ II'), value: '2028-01-10' },
        { caption: 'Chỉ tích “Đặt làm năm học mặc định” khi năm học mới thật sự bắt đầu. Khi đó mọi người sẽ làm việc trên năm học này.', highlight: { css: `${yearForm} label.hr-switch` }, label: 'Năm học mặc định', hold: 6 },
        { clear: true, caption: 'Bấm “Tạo năm học” để lưu.', click: { css: 'button[form="sy-year-form"]' }, hold: 1.5 },
      ],
    },
    {
      scenario: 'admin',
      path: '/thiet-lap-nam-hoc',
      waitFor: '.sy-runs',
      steps: [
        { chapter: 'Học kỳ II', step: 'Bước 2', caption: 'Đặt ngày bắt đầu học kỳ II cho năm học đang dùng: chọn năm học rồi bấm “Sửa thông tin”.', click: { css: 'button', text: 'Sửa thông tin' }, waitFor: yearForm, hold: 1.5 },
        { caption: 'Chọn ngày bắt đầu học kỳ II, ví dụ thứ Hai 11/01/2027. Điểm nhập từ ngày này trở đi tự thuộc học kỳ II.', fill: field('Ngày bắt đầu học kỳ II'), value: '2027-01-11' },
        { caption: 'Bấm “Lưu thay đổi”.', click: { css: 'button[form="sy-year-form"]' }, hold: 1.5 },
      ],
    },
    {
      scenario: 'admin',
      path: '/thiet-lap-nam-hoc',
      waitFor: '.sy-runs',
      steps: [
        { chapter: 'Ngày nghỉ lễ', step: 'Bước 3', caption: 'Thêm nhanh các ngày lễ: bấm “Gợi ý ngày lễ Việt Nam”.', click: { css: 'button', text: 'Gợi ý ngày lễ Việt Nam' }, waitFor: '#sy-suggest-form', hold: 1.5 },
        { caption: 'Hệ thống liệt kê sẵn Tết Dương lịch, Tết Nguyên đán, Giỗ Tổ, 30/4 – 1/5… với ngày âm lịch đã quy đổi. Tích những đợt trường nghỉ và sửa ngày cho đúng kế hoạch.', highlight: '#sy-suggest-form', hold: 8 },
        { clear: true, caption: 'Bấm nút “Thêm … đợt nghỉ” để lưu tất cả các đợt đã tích.', point: { css: 'button[form="sy-suggest-form"]' }, hold: 2.5 },
        { click: { css: '[role=dialog] button', text: 'Đóng' }, hold: 1 },
        { step: 'Bước 4', caption: 'Thêm một đợt nghỉ riêng của trường: bấm “+ Thêm đợt nghỉ”.', click: { css: 'button', text: 'Thêm đợt nghỉ' }, waitFor: '#sy-holiday-form', hold: 1.5 },
        { caption: 'Chọn nhanh tên đợt trong các nút gợi ý, hoặc tự gõ tên.', click: { css: '.sy-presets button', text: 'Nghỉ giữa học kỳ' } },
        { caption: 'Chọn “Từ ngày”…', fill: { css: '#sy-holiday-form input[type=date]', nth: 0 }, value: '2026-11-09' },
        { caption: '…và “Đến ngày”. Hệ thống chỉ tính các ngày thường trong khoảng này.', fill: { css: '#sy-holiday-form input[type=date]', nth: 1 }, value: '2026-11-13' },
        { caption: 'Bấm nút lưu. Nút ghi rõ số ngày sẽ nghỉ, ví dụ “Lưu 5 ngày nghỉ”.', click: { css: 'button[form="sy-holiday-form"]' }, hold: 1.5 },
      ],
    },
    {
      scenario: 'admin',
      path: '/thiet-lap-nam-hoc',
      waitFor: '.sy-runs',
      steps: [
        { chapter: 'Học bù', step: 'Bước 5', caption: 'Phía dưới là lịch cả năm. Màu sắc cho biết ngày học, cuối tuần, nghỉ lễ và học bù.', highlight: '.sy-legend', label: 'Chú thích màu', hold: 5 },
        { clear: true, caption: 'Muốn trường học bù vào thứ Bảy: bấm vào ô ngày thứ Bảy đó trên lịch.', click: { css: '[aria-label^="Thứ bảy, 26/09/2026"]' }, hold: 1.5 },
        { caption: 'Ghi chú lý do (không bắt buộc) rồi bấm “Đánh dấu học bù”. Bấm vào một ngày thường thì nút sẽ là “Đánh dấu nghỉ lễ”.', highlight: '[role=dialog]', hold: 7 },
        { clear: true, click: { css: '[role=dialog] button', text: 'Hủy' }, hold: 1 },
        { step: 'Lưu ý', caption: 'Thứ Hai – thứ Sáu mặc định là ngày học, cuối tuần mặc định nghỉ. Năm học “Đã khóa” chỉ xem, không sửa được; không xóa được năm học mặc định.' },
      ],
    },
  ],
};
