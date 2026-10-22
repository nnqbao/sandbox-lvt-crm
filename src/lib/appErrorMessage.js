/** Flatten Convex/client errors so wrapped `data` objects do not hide the code. */
export function convexErrorText(error) {
  if (error == null) return 'UNKNOWN_ERROR';
  const parts = [];
  const push = (value) => {
    if (value == null) return;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      parts.push(String(value));
      return;
    }
    if (typeof value === 'object') {
      for (const key of ['message', 'data', 'code', 'error']) {
        if (typeof value[key] === 'string') parts.push(value[key]);
      }
      try {
        parts.push(JSON.stringify(value));
      } catch {
        parts.push(String(value));
      }
    }
  };
  if (typeof error === 'string') return error;
  push(error.message);
  push(error.data);
  if (!parts.length) push(error);
  return parts.filter(Boolean).join('\n') || 'UNKNOWN_ERROR';
}

/** Tên hiển thị của các loại dữ liệu chặn việc xoá năm học (khớp SCHOOL_YEAR_USAGE_TABLES ở convex/homeroomCatalog.ts). */
export const SCHOOL_YEAR_USAGE_LABELS = {
  homeroomClasses: 'lớp chủ nhiệm',
  classEnrollments: 'học sinh được xếp lớp',
  homeroomAssignments: 'phân công giáo viên chủ nhiệm',
  studentAttendanceDays: 'dữ liệu điểm danh',
  attendanceImportUploads: 'file điểm danh đã tải lên',
  studentRosterImportUploads: 'file danh sách học sinh đã tải lên',
  attendanceClassDays: 'lớp đã được Giám thị điểm danh',
  supervisorAttendanceUploads: 'file điểm danh Giám thị đã tải lên',
};

export function messageFor(error) {
  const raw = convexErrorText(error);
  if (/ArgumentValidationError|extraneous field|extra field/i.test(raw)) {
    return 'Máy chủ chưa nhận cấu hình mới. Vui lòng tải lại trang sau khi hệ thống cập nhật, rồi thử lại.';
  }
  if (/Could not find public function|not found: peopleReview:staffFaultLog|not found: personalReminders:/i.test(raw)) {
    return /personalReminders:/i.test(raw)
      ? 'Máy chủ chưa cập nhật chức năng nhắc nhở. Vui lòng tải lại trang sau khi hệ thống cập nhật, rồi thử lại.'
      : 'Máy chủ chưa cập nhật chức năng Ghi nhận lỗi. Vui lòng tải lại trang sau khi hệ thống cập nhật, rồi thử lại.';
  }
  if (/does not match the schema/i.test(raw)) {
    return 'Dữ liệu không khớp schema máy chủ. Vui lòng liên hệ quản trị viên để triển khai lại Convex.';
  }
  const missingColumns = raw.match(/ATTENDANCE_TEMPLATE_COLUMNS_MISSING(?::([A-Za-z,]+))?/);
  if (missingColumns) {
    const labels = {
      classCode: 'Lớp học',
      studentName: 'Tên học sinh',
      dateOfBirth: 'Ngày sinh',
      sourceStatus: 'Trạng thái điểm danh',
      observedAt: 'Thời gian điểm danh',
    };
    const names = (missingColumns[1] || '').split(',').filter(Boolean).map((key) => labels[key] || key);
    return names.length
      ? `File điểm danh thiếu cột: ${names.join(', ')}.`
      : 'File điểm danh thiếu cột bắt buộc. Vui lòng dùng file mẫu của hệ thống.';
  }
  const yearInUse = raw.match(/SCHOOL_YEAR_DELETE_IN_USE(?::([A-Za-z,]+))?/);
  if (yearInUse) {
    const names = (yearInUse[1] || '')
      .split(',')
      .filter(Boolean)
      .map((key) => SCHOOL_YEAR_USAGE_LABELS[key] || key);
    return names.length
      ? `Không thể xoá năm học vì đã có ${names.join(', ')}. Chỉ xoá được năm học chưa có dữ liệu.`
      : 'Không thể xoá năm học vì đã có dữ liệu lớp, học sinh hoặc điểm danh. Chỉ xoá được năm học chưa có dữ liệu.';
  }
  const messages = {
    USER_NOT_ACTIVE: 'Tài khoản không còn hoạt động. Vui lòng liên hệ quản trị viên.',
    ACCOUNT_LOCKED:
      'Tài khoản đã bị khóa do đăng nhập sai quá số lần cho phép. Vui lòng liên hệ quản trị viên để được mở khóa.',
    INVALID_LOGIN_MAX_FAILED_ATTEMPTS: 'Số lần đăng nhập sai phải từ 1 đến 50.',
    INVALID_LOGIN_ATTEMPT_WINDOW: 'Khung thời gian phải từ 1 đến 1440 phút.',
    INVALID_NOTIFICATION_MILESTONES: 'Mỗi nguồn thông báo cần ít nhất một mốc giờ nguyên từ 0 đến 720.',
    CANNOT_REVOKE_CURRENT_SESSION: 'Không thể thu hồi phiên đang dùng trên thiết bị này.',
    SESSION_NOT_FOUND: 'Phiên đăng nhập không còn tồn tại.',
    EMAIL_TAKEN: 'Email này đã được sử dụng. Vui lòng chọn email khác.',
    TEMP_PASSWORD_TOO_SHORT: 'Mật khẩu tạm thời phải có ít nhất 8 ký tự.',
    PASSWORD_TOO_SHORT: 'Mật khẩu mới phải có ít nhất 8 ký tự.',
    CURRENT_PASSWORD_REQUIRED: 'Vui lòng nhập mật khẩu hiện tại.',
    CURRENT_PASSWORD_INVALID: 'Mật khẩu hiện tại không đúng.',
    PASSWORD_CHANGE_REQUIRED: 'Bạn cần đổi mật khẩu trước khi tiếp tục.',
    CANNOT_DISABLE_OWN_ACTIVE_ACCOUNT: 'Bạn không thể khóa chính tài khoản đang đăng nhập.',
    CANNOT_DELETE_OWN_ACTIVE_ACCOUNT: 'Bạn không thể xóa chính tài khoản đang đăng nhập.',
    LAST_ACTIVE_ADMIN: 'Không thể khóa, xóa hoặc hạ quyền Administrator cuối cùng đang hoạt động.',
    USER_REMOVE_FAILED: 'Không thể xóa tài khoản. Vui lòng liên hệ kỹ thuật.',
    USER_CREATE_FAILED: 'Không thể tạo tài khoản. Vui lòng thử lại.',
    USER_UPDATE_FAILED: 'Không thể cập nhật tài khoản. Vui lòng thử lại.',
    PASSWORD_CHANGED_SYNC_PENDING: 'Mật khẩu đã đổi nhưng hệ thống chưa cập nhật xong. Vui lòng liên hệ quản trị viên.',
    PASSWORD_RESET_FAILED: 'Không thể đặt lại mật khẩu. Vui lòng thử lại.',
    PASSWORD_RESET_EMAIL_FAILED:
      'Không gửi được email khôi phục mật khẩu. Tài khoản chưa đổi mật khẩu. Vui lòng thử lại.',
    MAIL_NOT_CONFIGURED: 'Hệ thống chưa cấu hình gửi email. Vui lòng liên hệ quản trị viên.',
    MAIL_AUTH_FAILED: 'Không xác thực được tài khoản gửi email. Vui lòng liên hệ quản trị viên.',
    PASSWORD_CHANGE_FAILED: 'Không thể đổi mật khẩu. Vui lòng thử lại.',
    EMAIL_CHANGE_UNSUPPORTED: 'Hiện chưa hỗ trợ đổi email đăng nhập. Vui lòng tạo tài khoản mới nếu cần.',
    PUBLIC_SIGNUP_DISABLED: 'Hệ thống không cho phép tự đăng ký.',
    INVALID_CREDENTIALS: 'Email hoặc mật khẩu không đúng.',
    'Invalid credentials': 'Email hoặc mật khẩu không đúng.',
    INVALID_EMAIL: 'Email không hợp lệ.',
    INVALID_ROLE: 'Vai trò chỉ được chọn Administrator, Moderator hoặc User.',
    INVALID_DEPARTMENT: 'Phòng ban không hợp lệ hoặc đã ngưng sử dụng.',
    INVALID_PERMISSION_GROUP: 'Nhóm quyền không hợp lệ hoặc đã ngưng sử dụng.',
    INVALID_POSITION: 'Chức vụ không hợp lệ hoặc đã ngưng sử dụng.',
    INVALID_POSITION_LEVEL: 'Cấp bậc chức vụ phải từ 1 đến 5 sao.',
    INVALID_CODE: 'Mã không hợp lệ. Tối đa 20 ký tự; chỉ dùng chữ, số, gạch ngang hoặc gạch dưới.',
    INVALID_NAME: 'Tên không hợp lệ. Vui lòng nhập lại.',
    INVALID_MENU: 'Cấu hình quyền menu không hợp lệ.',
    INVALID_MENU_ACCESS: 'Mức Giám thị chỉ được gán cho menu Điểm danh; menu Điểm danh chỉ chọn Ẩn hoặc Giám thị.',
    CODE_TAKEN: 'Mã này đã được sử dụng. Vui lòng chọn mã khác.',
    DOCUMENT_TYPE_REQUIRED: 'Vui lòng chọn loại văn bản cho file đính kèm.',
    INVALID_DOCUMENT_TYPE: 'Loại văn bản không hợp lệ hoặc đã ngưng sử dụng.',
    DOCUMENT_TYPE_NOT_FOUND: 'Không tìm thấy loại văn bản.',
    DOCUMENT_TYPE_NAME_TAKEN: 'Đã có loại văn bản trùng tên, vui lòng đặt tên khác.',
    DOCUMENT_TYPE_IN_USE: 'Không thể xóa vì vẫn còn file đang dùng loại văn bản này.',
    IMPORT_FILE_TOO_LARGE: 'File vượt quá dung lượng cho phép (tối đa 2 MB).',
    INVALID_IMPORT_FILE: 'Chỉ chấp nhận file Excel (.xlsx).',
    INVALID_IMPORT_HEADERS: 'File không đúng mẫu. Vui lòng dùng file nhập liệu mẫu của hệ thống.',
    IMPORT_FILE_EMPTY: 'File import trống.',
    IMPORT_UPLOAD_NOT_FOUND: 'Không tìm thấy file import đã tải lên.',
    IMPORT_UPLOAD_EXPIRED: 'File import đã hết hạn (giữ tối đa 1 giờ). Vui lòng tải lại.',
    IMPORT_UPLOAD_ALREADY_COMMITTED: 'File import này đã được nhập. Vui lòng tải file mới nếu cần nhập tiếp.',
    IMPORT_UPLOAD_IN_PROGRESS: 'File import đang được nhập. Vui lòng đợi hoàn tất.',
    IMPORT_VALIDATION_FAILED: 'Dữ liệu import không hợp lệ. Vui lòng kiểm tra lại file.',
    USER_IMPORT_FAILED: 'Import người dùng thất bại. Các tài khoản đã tạo trong lô này đã được vô hiệu hóa.',
    DEPARTMENT_NAME_TAKEN: 'Đã có phòng ban trùng tên, vui lòng đặt tên khác.',
    LOCATION_NAME_TAKEN: 'Đã có địa điểm trùng tên, vui lòng đặt tên khác.',
    PERMISSION_GROUP_NAME_TAKEN: 'Đã có nhóm quyền trùng tên, vui lòng đặt tên khác.',
    POSITION_NAME_TAKEN: 'Đã có chức vụ trùng tên, vui lòng đặt tên khác.',
    DEPARTMENT_NOT_FOUND: 'Không tìm thấy phòng ban.',
    LOCATION_NOT_FOUND: 'Không tìm thấy địa điểm.',
    PERMISSION_GROUP_NOT_FOUND: 'Không tìm thấy nhóm quyền.',
    POSITION_NOT_FOUND: 'Không tìm thấy chức vụ.',
    USER_NOT_FOUND: 'Không tìm thấy người dùng.',
    INVALID_DESCRIPTION: 'Mô tả quá dài hoặc không hợp lệ.',
    INVALID_DATE: 'Ngày không hợp lệ.',
    INVALID_TIME: 'Giờ không hợp lệ.',
    INVALID_CONTENT: 'Nội dung bắt buộc và tối đa 200 ký tự.',
    INVALID_DUTY_TITLE: 'Tên công tác bắt buộc và tối đa 200 ký tự.',
    END_BEFORE_START: 'Thời gian kết thúc phải sau thời gian bắt đầu.',
    INVALID_LOCATION: 'Vui lòng nhập địa điểm (tối đa 200 ký tự).',
    INVALID_PARTICIPANT: 'Người tham gia không hợp lệ.',
    DUTY_NOT_FOUND: 'Không tìm thấy công tác.',
    NOT_A_PARTICIPANT: 'Bạn không nằm trong danh sách tham gia công tác này.',
    NOT_A_SUBORDINATE: 'Chỉ được giao hoặc cập nhật cấp dưới trong cùng phòng ban.',
    MODERATOR_DEPARTMENT_SCOPE: 'Moderator chỉ được thao tác trong phòng ban được gán.',
    ATTENDANCE_OUTSIDE_WINDOW: 'Chỉ xác nhận tham gia trong thời gian diễn ra công tác.',
    ATTENDANCE_CONFIRMATION_DISABLED: 'Xác nhận tham gia đang được tắt trong thiết lập hiển thị.',
    INVALID_WORK_FILE: 'Tệp công văn không đúng định dạng được hỗ trợ.',
    WORK_FILE_TOO_LARGE: 'Tệp công văn không được vượt quá 20MB.',
    WORK_UPLOAD_FAILED: 'Không thể tải tệp công văn lên.',
    INVALID_WORK_DEADLINE: 'Hạn chót công việc không hợp lệ.',
    INVALID_WORK_CONTENT: 'Nội dung công việc bắt buộc và tối đa 2.000 ký tự.',
    WORK_DEPARTMENTS_REQUIRED: 'Vui lòng thêm ít nhất một phòng ban nhận việc.',
    WORK_DEPARTMENT_DUPLICATE: 'Mỗi phòng ban chỉ được nhận một đầu việc trong cùng công văn.',
    WORK_APPROVERS_REQUIRED: 'Vui lòng chọn ít nhất một người duyệt.',
    INVALID_WORK_APPROVER: 'Người duyệt phải là thành viên Ban giám hiệu (cấp 4 hoặc 5 sao) đang hoạt động, không phải Administrator/Moderator.',
    WORK_APPROVER_REQUIRED: 'Công việc do Văn thư tạo cần chọn ít nhất một người duyệt thuộc Ban giám hiệu.',
    WORK_APPROVER_FORBIDDEN: 'Bạn không nằm trong danh sách duyệt công việc này.',
    WORK_DOCUMENT_ALREADY_DECIDED: 'Công việc này đã được duyệt hoặc trả lại, không thể đổi quyết định.',
    WORK_RETURN_REASON_INVALID: 'Vui lòng nhập lý do trả lại (tối đa 500 ký tự).',
    WORK_DOCUMENT_IMMUTABLE: 'Công việc đã có người duyệt hoặc người nộp nên không thể sửa hoặc xóa.',
    WORK_DOCUMENT_NOT_FOUND: 'Không tìm thấy công việc hoặc công việc đã bị xóa.',
    WORK_UPDATE_FORBIDDEN: 'Chỉ người tạo mới được sửa hoặc xóa công việc này.',
    WORK_DEPARTMENT_FORBIDDEN: 'Chỉ Văn thư và Ban giám hiệu được giao việc cho cả phòng ban.',
    WORK_ASSIGNEE_NOT_SUBORDINATE: 'Chỉ được giao cho người có cấp thấp hơn bạn. Tổ trưởng/tổ phó chỉ giao trong phòng ban của mình.',
    ADMIN_USE_MANAGEMENT: 'Administrator/Moderator quản lý công việc, không duyệt thay Ban giám hiệu.',
    WORK_NOT_APPROVED: 'Công việc chưa được Ban giám hiệu duyệt đủ.',
    INVALID_PERSONAL_WORK_TITLE: 'Tên công việc cá nhân bắt buộc và tối đa 200 ký tự.',
    WORK_ASSIGNEES_REQUIRED: 'Vui lòng chọn người thực hiện.',
    INVALID_WORK_ASSIGNEE: 'Người thực hiện phải cùng phòng ban và có cấp sao thấp hơn bạn.',
    WORK_ASSIGNER_REQUIRED: 'Chỉ user cấp 2 hoặc 3 mới được chỉ định công việc.',
    WORK_EXECUTOR_REQUIRED: 'Chỉ người được giao mới được hoàn thành task.',
    PERSONAL_WORK_OVERDUE: 'Đầu mục đã quá hạn và không thể xác nhận.',
    QUALITY_PERCENT_REQUIRED: 'Vui lòng nhập mức độ hoàn thành (%).',
    INVALID_QUALITY_PERCENT: 'Mức độ hoàn thành phải từ 0 đến 100%.',
    INVALID_REJECTION_REASON: 'Vui lòng nhập lý do chưa duyệt (tối đa 500 ký tự).',
    ASSIGNMENT_CREATE_FORBIDDEN: 'Bạn không có quyền tạo công tác hoặc công việc.',
    DUTY_CREATE_FORBIDDEN: 'Bạn không có quyền tạo công tác.',
    DUTY_UPDATE_FORBIDDEN: 'Bạn không thể sửa hoặc xóa công tác này.',
    DUTY_DEPARTMENT_FORBIDDEN: 'Tổ trưởng/tổ phó chỉ được giao công tác cho cấp dưới, không chọn cả phòng ban.',
    DUTY_PARTICIPANTS_REQUIRED: 'Vui lòng chọn phòng ban, cá nhân tham gia, hoặc điền thành phần khác.',
    INVALID_OTHER_PARTICIPANTS: 'Thành phần khác tối đa 500 ký tự.',
    INVALID_WEEK: 'Tuần không hợp lệ.',
    DUTY_WEEK_MANAGER_REQUIRED: 'Chỉ văn thư (admin/mod) được nộp hoặc hủy thay đổi lịch tuần.',
    DUTY_WEEK_REVIEWER_REQUIRED: 'Chỉ Ban Giám hiệu được duyệt hoặc trả lại lịch tuần.',
    DUTY_WEEK_ALREADY_SUBMITTED: 'Lịch tuần này đang chờ Ban Giám hiệu duyệt.',
    DUTY_WEEK_NOTHING_TO_SUBMIT: 'Lịch tuần này không có thay đổi nào cần duyệt.',
    DUTY_WEEK_NOT_SUBMITTED: 'Lịch tuần này không còn ở trạng thái chờ duyệt.',
    DUTY_WEEK_CHANGED: 'Văn thư vừa sửa lịch tuần này. Vui lòng xem lại trước khi duyệt.',
    DUTY_WEEK_RETURN_NOTE_REQUIRED: 'Vui lòng ghi lý do trả lại.',
    DUTY_WEEK_RETURN_NOTE_TOO_LONG: 'Lý do trả lại tối đa 500 ký tự.',
    DUTY_WEEK_NO_APPROVED_VERSION: 'Tuần này chưa có bản đã duyệt để quay về.',
    DUTY_REVIEWER_EDIT_FORBIDDEN: 'Chỉ Ban Giám hiệu được sửa trực tiếp công tác trên lịch chung.',
    INVALID_TODO_TITLE: 'Vui lòng nhập tên việc (tối đa 200 ký tự).',
    INVALID_TODO_NOTE: 'Ghi chú tối đa 2000 ký tự.',
    INVALID_TODO_TIME: 'Thời gian không hợp lệ.',
    TODO_REMIND_IN_PAST: 'Giờ nhắc phải ở tương lai.',
    TODO_NOT_FOUND: 'Việc này không còn tồn tại.',
    INVALID_WORK_TITLE: 'Vui lòng nhập tên công việc (tối đa 200 ký tự).',
    WORK_EVIDENCE_REQUIRED: 'Khi nộp việc phải đính kèm file bằng chứng hoàn thành.',
    INVALID_COMPLETION_NOTE: 'Nội dung gửi người giao tối đa 500 ký tự.',
    WORK_COMPLETION_REVIEWER_REQUIRED: 'Chỉ người tạo công việc mới được đánh dấu hoàn thành hoặc trả về.',
    WORK_COMPLETION_NOT_PENDING: 'Task không còn ở trạng thái chờ duyệt hoàn thành.',
    WORK_ASSIGNMENTS_REQUIRED: 'Vui lòng thêm ít nhất một phân công.',
    WORK_ADMIN_MOD_MODE_REQUIRED: 'Thao tác này chỉ dùng ở chế độ Admin/Mod giao việc.',
    WORK_SUPERVISOR_MODE_REQUIRED: 'Thao tác này chỉ dùng ở chế độ Cấp trên giao việc.',
    PEOPLE_REVIEW_FAULT_FORBIDDEN: 'Bạn không có quyền ghi nhận lỗi cho người này.',
    PEOPLE_REVIEW_UPLOAD_FORBIDDEN: 'Bạn không có quyền upload file đánh giá cho người này.',
    PEOPLE_REVIEW_TEXT_FORBIDDEN: 'Bạn không có quyền ghi BGH đánh giá cho người này.',
    PEOPLE_REVIEW_FORBIDDEN: 'Bạn không có quyền xem hồ sơ đánh giá này.',
    EVALUATION_FILE_LOCKED: 'File kỳ này đã có BGH đánh giá — không thể upload lại.',
    EVALUATION_FILE_REQUIRED: 'Cần có file upload trước khi ghi BGH đánh giá.',
    EVALUATION_TEXT_ALREADY_SUBMITTED: 'Bạn đã ghi BGH đánh giá cho kỳ này rồi.',
    BOARDING_NOT_PARTICIPATING: 'Giáo viên không tham gia bán trú kỳ này.',
    INVALID_EVALUATION_FILE: 'File đánh giá phải là PDF/PNG/JPG tối đa 20MB.',
    INVALID_FAULT_REASON: 'Lý do ghi nhận lỗi bắt buộc và tối đa 2.000 ký tự.',
    INVALID_EVALUATION_TEXT: 'Nội dung đánh giá bắt buộc và tối đa 5.000 ký tự.',
    INVALID_EVALUATION_PERIOD: 'Kỳ đánh giá không hợp lệ.',
    HOMEROOM_SCOPE_FORBIDDEN: 'Bạn không có lớp đang chủ nhiệm cho thao tác này.',
    SUPERVISOR_REQUIRED: 'Chỉ Giám thị hoặc Admin/Mod mới được điểm danh.',
    ATTENDANCE_CAMERA_IMPORT_RETIRED: 'Nhập file điểm danh camera đã ngừng sử dụng. Giám thị điểm danh tại menu Điểm danh.',
    ATTENDANCE_DATE_TODAY_ONLY: 'Giám thị chỉ được điểm danh cho ngày hôm nay.',
    ATTENDANCE_STUDENT_NOT_IN_CLASS: 'Có học sinh không thuộc lớp này vào ngày điểm danh. Vui lòng tải lại trang rồi lưu lại.',
    ATTENDANCE_TOO_MANY_ABSENT: 'Số học sinh vắng vượt quá giới hạn của một lớp.',
    SUPERVISOR_IMPORT_HEADERS: 'File cần đủ 3 cột: Lớp học, Tên học sinh, Vắng. Hãy dùng nút “Tải file mẫu”.',
    DISPOSITION_FORBIDDEN: 'Chỉ GVCN của lớp trong ngày đó hoặc Admin/Mod mới được phân loại vắng.',
    DISPOSITION_NOT_ABSENT: 'Chỉ đánh dấu được học sinh đang Vắng.',
    DISPOSITION_BATCH_TOO_LARGE: 'Mỗi lần chỉ phân loại tối đa 100 học sinh.',
    INVALID_DISPOSITION_NOTE: 'Ghi chú phân loại tối đa 500 ký tự.',
    CONTACT_EDIT_FORBIDDEN: 'Bạn chỉ được sửa liên hệ của học sinh thuộc lớp đang chủ nhiệm.',
    INVALID_PHONE: 'Số điện thoại không hợp lệ.',
    INVALID_TEXT: 'Nội dung quá dài hoặc không hợp lệ.',
    INVALID_STUDENT_CODE: 'Mã học sinh không hợp lệ. Chỉ dùng chữ, số, _ hoặc -.',
    GUARDIAN_LIMIT: 'Mỗi học sinh có tối đa 6 người giám hộ.',
    GUARDIAN_NOT_FOUND: 'Không tìm thấy người giám hộ.',
    HOMEROOM_TEACHER_ALREADY_ASSIGNED: 'Giáo viên này đang chủ nhiệm một lớp khác trong cùng thời gian.',
    WITHDRAW_BEFORE_START: 'Ngày thôi học không được trước ngày bắt đầu học ở lớp hiện tại.',
    INVALID_REASON: 'Lý do tối đa 300 ký tự.',
    REPORT_RANGE_TOO_LONG: 'Khoảng thời gian báo cáo quá dài. Vui lòng chọn ngắn hơn.',
    INVALID_DATE_RANGE: 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.',
    CALENDAR_DATE_OUTSIDE_YEAR: 'Ngày nằm ngoài thời gian của năm học.',
    INVALID_CALENDAR_NOTE: 'Ghi chú lịch tối đa 120 ký tự.',
    HOLIDAY_RANGE_TOO_LONG: 'Mỗi đợt nghỉ tối đa 92 ngày. Hãy chia thành nhiều đợt.',
    ATTENDANCE_TEMPLATE_HEADER_NOT_FOUND:
      'Không tìm thấy dòng tiêu đề. File cần có các cột: Lớp học, Tên học sinh, Ngày sinh, Trạng thái điểm danh, Thời gian điểm danh.',
    IMPORT_TOO_MANY_ROWS: 'File có quá nhiều dòng. Vui lòng kiểm tra lại file điểm danh.',
    ATTENDANCE_DATE_OUTSIDE_YEAR: 'Ngày điểm danh nằm ngoài thời gian của năm học.',
    ATTENDANCE_DATE_IN_FUTURE: 'Không thể điểm danh cho ngày trong tương lai.',
    INVALID_REPLACE_MODE: 'Cách xử lý dữ liệu đã có không hợp lệ.',
    HOMEROOM_MENU_HIDDEN: 'Bạn không có quyền mở menu Lớp chủ nhiệm.',
    SCHOOL_YEAR_NOT_FOUND: 'Không tìm thấy năm học.',
    SCHOOL_YEAR_NAME_TAKEN: 'Tên năm học đã tồn tại.',
    SCHOOL_YEAR_OVERLAP: 'Không thể có hai năm học đang hoạt động chồng ngày.',
    SCHOOL_YEAR_LOCKED: 'Năm học đã khóa, không thể sửa thông tin thường.',
    SCHOOL_YEAR_DELETE_DEFAULT:
      'Không thể xoá năm học đang là mặc định của Lớp chủ nhiệm. Hãy đặt năm học khác làm mặc định trước.',
    SCHOOL_YEAR_DELETE_LOCKED: 'Năm học đã khóa, không thể xoá.',
    CLASS_NOT_FOUND: 'Không tìm thấy lớp.',
    CLASS_ARCHIVED: 'Lớp đã lưu trữ. Không thể phân công, nhập danh sách hoặc điểm danh.',
    CLASS_CODE_TAKEN: 'Mã lớp đã tồn tại trong năm học này.',
    INVALID_CLASS_CODE: 'Mã lớp không hợp lệ. Chỉ dùng chữ, số, _ hoặc -.',
    INVALID_GRADE_LEVEL: 'Khối lớp hiện hỗ trợ từ 6 đến 9.',
    HOMEROOM_TEACHER_OVERLAP: 'Lớp đã có giáo viên chủ nhiệm trong khoảng thời gian này.',
    INVALID_ASSIGNMENT_TYPE: 'Chỉ được phân công giáo viên chủ nhiệm cho lớp.',
    INVALID_ASSIGNMENT_SCOPE: 'Phân công lớp chỉ áp dụng theo từng lớp, không theo toàn trường.',
    DUPLICATE_ACTIVE_ENROLLMENT: 'Học sinh đã có một lớp đang học trong năm học này.',
    ENROLLMENT_YEAR_MISMATCH: 'Lớp chuyển đến phải cùng năm học.',
    ENROLLMENT_NOT_FOUND: 'Không tìm thấy quá trình học.',
    STUDENT_NOT_FOUND: 'Không tìm thấy học sinh.',
    STUDENT_CODE_EXISTS: 'Mã học sinh đã tồn tại.',
    ATTENDANCE_DAY_NOT_FOUND: 'Không tìm thấy buổi điểm danh.',
    ATTENDANCE_ALREADY_PUBLISHED: 'Ngày điểm danh này đã được công bố.',
    IMPORT_ROWS_UNRESOLVED: 'Còn dòng lỗi chưa xử lý. Không thể công bố.',
    CORRECTION_REASON_REQUIRED: 'Cần nhập lý do hoặc ghi chú khi phân loại hoặc đổi phân loại vắng.',
    INVALID_DISPOSITION: 'Phân loại vắng không hợp lệ.',
    INVALID_CALENDAR_DAY: 'Loại ngày lịch không hợp lệ.',
    INVALID_TRANSFER: 'Không thể chuyển học sinh tới cùng lớp hiện tại.',
    TRANSFER_BEFORE_START: 'Ngày chuyển lớp không được trước ngày bắt đầu học ở lớp hiện tại.',
    ASSIGNMENT_BEFORE_START: 'Ngày thay GVCN không được trước ngày phân công hiện tại bắt đầu.',
    ASSIGNMENT_END_BEFORE_START: 'Ngày kết thúc không được trước ngày phân công bắt đầu.',
    ASSIGNMENT_ALREADY_ENDED: 'Phân công này đã kết thúc trước ngày đã chọn.',
    ASSIGNMENT_NOT_FOUND: 'Không tìm thấy phân công đang hiệu lực. Vui lòng tải lại trang.',
    ENROLLMENT_NOT_ACTIVE: 'Chỉ chuyển được học sinh đang học.',
    INVALID_AVATAR_FILE: 'Ảnh đại diện phải là PNG, JPG hoặc WEBP.',
    AVATAR_FILE_TOO_LARGE: 'Ảnh đại diện không được vượt quá 2MB.',
    AVATAR_UPLOAD_NOT_FOUND: 'Không tìm thấy ảnh vừa tải lên. Vui lòng chọn lại.',
    AVATAR_NOT_FOUND: 'Chưa có ảnh đại diện.',
    AVATAR_UPLOAD_FAILED: 'Không thể cập nhật ảnh đại diện. Vui lòng thử lại.',
  };

  const knownCodes = Object.keys(messages).sort((a, b) => b.length - a.length);
  for (const key of knownCodes) {
    if (raw.includes(key)) return messages[key];
  }

  const stripped = raw
    .replace(/^Uncaught Error:\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .replace(/^\[Request ID:[^\]]+\]\s*/i, '')
    .replace(/^Server Error\s*/i, '')
    .trim()
    .split(/[\n\r]/)[0]
    .trim();
  if (messages[stripped]) return messages[stripped];

  if (/invalid credentials|invalidsecret/i.test(raw)) return messages['Invalid credentials'];
  if (/FORBIDDEN/i.test(raw)) return 'Bạn không có quyền thực hiện thao tác này.';
  return 'Không thể hoàn tất thao tác. Vui lòng thử lại hoặc liên hệ quản trị viên.';
}
