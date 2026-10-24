import {
  ACCOUNT_DELETION_CANONICAL_PATH,
  PRIVACY_APP_NAME,
  PRIVACY_CONTACT_EMAIL,
  PRIVACY_EFFECTIVE_DATE_EN,
  PRIVACY_EFFECTIVE_DATE_VI,
  PRIVACY_ORGANIZATION_EN,
  PRIVACY_ORGANIZATION_VI,
  PRIVACY_SITE_ORIGIN,
} from './privacyPolicy';
import './privacy.css';

export default function PrivacyPolicyPage() {
  const mail = `mailto:${PRIVACY_CONTACT_EMAIL}`;
  return (
    <main className="privacy-page">
      <article className="privacy-page-inner">
        <img src="/assets/logo-thcs-le-van-tam.png" alt={`Logo ${PRIVACY_ORGANIZATION_VI}`} />
        <nav className="privacy-lang" aria-label="Language">
          <a href="#vi">Tiếng Việt</a>
          <a href="#en">English</a>
        </nav>

        <section id="vi" lang="vi">
          <p className="eyebrow">{PRIVACY_APP_NAME}</p>
          <h1>Chính sách bảo mật</h1>
          <p className="privacy-lede">
            Có hiệu lực từ {PRIVACY_EFFECTIVE_DATE_VI}. Áp dụng cho website {PRIVACY_SITE_ORIGIN} và ứng dụng
            di động {PRIVACY_APP_NAME} do {PRIVACY_ORGANIZATION_VI} vận hành.
          </p>

          <div className="privacy-section">
            <h2>1. Người kiểm soát dữ liệu</h2>
            <p>
              {PRIVACY_ORGANIZATION_VI} (“nhà trường”) vận hành hệ thống quản lý nội bộ {PRIVACY_APP_NAME} dành
              cho cán bộ, giáo viên và nhân viên được cấp tài khoản. Không có đăng ký công khai.
            </p>
            <p>
              Liên hệ: <a href={mail}>{PRIVACY_CONTACT_EMAIL}</a>
            </p>
          </div>

          <div className="privacy-section">
            <h2>2. Dữ liệu chúng tôi xử lý</h2>
            <p>Chỉ xử lý dữ liệu cần cho công việc nhà trường:</p>
            <ul>
              <li>Tài khoản: họ tên, email, mật khẩu (đã băm, không lưu bản rõ), phòng ban, chức vụ, nhóm quyền, vai trò, trạng thái tài khoản.</li>
              <li>Nghiệp vụ: công tác, điểm danh, công việc, tệp công văn, thông báo nội bộ và nhật ký thao tác liên quan.</li>
              <li>Thiết bị đăng nhập: tên thiết bị, nền tảng (web / Android / iOS), phiên bản ứng dụng, user-agent, thời điểm hoạt động.</li>
              <li>Thông báo đẩy: mã thiết bị FCM (Android) hoặc APNs (iOS) để gửi thông báo công tác và công việc.</li>
              <li>Bảo mật đăng nhập: số lần đăng nhập sai, thời điểm khóa tài khoản; email mật khẩu tạm khi người dùng yêu cầu quên mật khẩu.</li>
            </ul>
            <p>
              Ứng dụng không dùng GPS. Địa điểm công tác là chữ do người dùng nhập. Không chạy quảng cáo, không bán dữ liệu, không dùng SDK phân tích quảng cáo.
            </p>
          </div>

          <div className="privacy-section">
            <h2>3. Mục đích và cơ sở</h2>
            <p>
              Dữ liệu dùng để xác thực, phân quyền, điều hành công tác/công việc, gửi thông báo liên quan nhiệm vụ, và bảo vệ tài khoản. Cơ sở xử lý là vận hành nội bộ nhà trường và nghĩa vụ quản lý nhân sự / công vụ, không phải tiếp thị.
            </p>
          </div>

          <div className="privacy-section">
            <h2>4. Bên xử lý thay mặt nhà trường</h2>
            <ul>
              <li>Convex — lưu toàn bộ dữ liệu và tệp công văn trên tài khoản do nhà trường quản lý; tệp chỉ tải được sau khi hệ thống kiểm tra quyền, không có liên kết công khai.</li>
              <li>VSC (đơn vị kỹ thuật) — vận hành máy chủ chuyển tiếp; không lưu trữ dữ liệu hay tệp của nhà trường.</li>
              <li>Google Firebase Cloud Messaging — chỉ để chuyển thông báo đẩy Android.</li>
              <li>Apple Push Notification service — chỉ để chuyển thông báo đẩy iOS.</li>
              <li>AgentMail — gửi email mật khẩu tạm khi người dùng yêu cầu.</li>
            </ul>
            <p>Các bên này nhận dữ liệu tối thiểu để cung cấp dịch vụ trên, không được dùng cho quảng cáo của {PRIVACY_APP_NAME}.</p>
          </div>

          <div className="privacy-section">
            <h2>5. Lưu trữ và bảo mật</h2>
            <p>
              Dữ liệu được giữ khi tài khoản còn hiệu lực và khi nhà trường cần cho vận hành/lưu trữ hồ sơ. Tài khoản có thể bị vô hiệu hóa (không xóa cứng ngay). Mật khẩu được băm. Tệp công văn chỉ tải sau khi hệ thống kiểm tra quyền. Ứng dụng Android không sao lưu dữ liệu ứng dụng lên dịch vụ backup mặc định.
            </p>
          </div>

          <div className="privacy-section">
            <h2>6. Quyền của người dùng</h2>
            <p>
              Cán bộ có tài khoản có thể xem hồ sơ trên menu Cá nhân, đổi mật khẩu, và xem thiết bị đã đăng nhập. Yêu cầu sửa, hạn chế hoặc xóa tài khoản: xem{' '}
              <a href={ACCOUNT_DELETION_CANONICAL_PATH}>hướng dẫn xóa tài khoản</a> hoặc gửi email tới{' '}
              <a href={mail}>{PRIVACY_CONTACT_EMAIL}</a>. Nhà trường sẽ xử lý theo quy chế nội bộ và quy định pháp luật Việt Nam.
            </p>
          </div>

          <div className="privacy-section">
            <h2>7. Trẻ em</h2>
            <p>
              Ứng dụng dành cho nhân sự nhà trường, không hướng tới trẻ em dưới 13 tuổi và không dùng để thu thập dữ liệu học sinh trên cửa hàng ứng dụng.
            </p>
          </div>

          <div className="privacy-section">
            <h2>8. Thay đổi</h2>
            <p>
              Khi chính sách đổi, phiên bản mới sẽ được đăng tại địa chỉ này. Việc tiếp tục dùng hệ thống sau ngày hiệu lực nghĩa là bạn đã biết nội dung cập nhật.
            </p>
          </div>
        </section>

        <section id="en" className="privacy-en" lang="en">
          <p className="eyebrow">{PRIVACY_APP_NAME}</p>
          <h1>Privacy policy</h1>
          <p className="privacy-lede">
            Effective {PRIVACY_EFFECTIVE_DATE_EN}. This policy covers {PRIVACY_SITE_ORIGIN} and the {PRIVACY_APP_NAME}{' '}
            mobile apps operated by {PRIVACY_ORGANIZATION_EN}.
          </p>

          <div className="privacy-section">
            <h2>1. Data controller</h2>
            <p>
              {PRIVACY_ORGANIZATION_EN} (“the school”) operates {PRIVACY_APP_NAME} as an internal staff system. Accounts are issued by administrators. There is no public sign-up.
            </p>
            <p>
              Contact: <a href={mail}>{PRIVACY_CONTACT_EMAIL}</a>
            </p>
          </div>

          <div className="privacy-section">
            <h2>2. Data we process</h2>
            <p>We process only what the school needs to run the product:</p>
            <ul>
              <li>Account data: name, email, hashed password (never stored in plaintext), department, position, permission group, role, and account status.</li>
              <li>Operational records: duties, attendance, work assignments, official documents, in-app notifications, and related audit metadata.</li>
              <li>Signed-in devices: device name, platform (web / Android / iOS), app version, user-agent, and last-active time.</li>
              <li>Push delivery: FCM tokens (Android) or APNs tokens (iOS) so duty and work alerts can reach the device.</li>
              <li>Sign-in security: failed-attempt counts, lockout timestamps, and temporary-password email when a reset is requested.</li>
            </ul>
            <p>
              The app does not use GPS. Duty locations are free-text entered by staff. We do not show ads, sell personal data, or use advertising-analytics SDKs.
            </p>
          </div>

          <div className="privacy-section">
            <h2>3. Purpose and legal basis</h2>
            <p>
              Data is used to authenticate users, enforce permissions, run school workflows, send task-related notifications, and protect accounts. Processing is for the school’s internal administration, not marketing.
            </p>
          </div>

          <div className="privacy-section">
            <h2>4. Processors</h2>
            <ul>
              <li>Convex — stores all data and official documents in an account managed by the school; files can only be downloaded after an access check and are never published as public links.</li>
              <li>VSC (technical operator) — runs the relay server; it does not store the school’s data or files.</li>
              <li>Google Firebase Cloud Messaging — Android push delivery only.</li>
              <li>Apple Push Notification service — iOS push delivery only.</li>
              <li>AgentMail — sending a temporary password when a user requests a reset.</li>
            </ul>
            <p>These providers receive only what they need to perform that service. {PRIVACY_APP_NAME} does not use them for advertising.</p>
          </div>

          <div className="privacy-section">
            <h2>5. Retention and security</h2>
            <p>
              Data is kept while an account is active and as long as the school needs it for operations or records. Accounts may be disabled rather than immediately erased. Passwords are hashed. Document downloads are authorized before content is served. The Android app disables default cloud backup of app data.
            </p>
          </div>

          <div className="privacy-section">
            <h2>6. Your rights</h2>
            <p>
              Staff can view their profile, change their password, and review signed-in devices in the app. To correct, restrict, or delete an account, follow the{' '}
              <a href={ACCOUNT_DELETION_CANONICAL_PATH}>account deletion page</a> or email{' '}
              <a href={mail}>{PRIVACY_CONTACT_EMAIL}</a>. The school will handle requests under internal rules and applicable Vietnamese law.
            </p>
          </div>

          <div className="privacy-section">
            <h2>7. Children</h2>
            <p>
              The product is for school staff. It is not directed at children under 13 and is not used on the app stores to collect student data.
            </p>
          </div>

          <div className="privacy-section">
            <h2>8. Changes</h2>
            <p>
              Updates will be posted at this URL. Continued use after the effective date means you have been informed of the revised policy.
            </p>
          </div>
        </section>

        <a className="privacy-home" href="/">
          ← {PRIVACY_APP_NAME}
        </a>
      </article>
    </main>
  );
}
