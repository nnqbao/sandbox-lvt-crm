import { useEffect, useRef, useState } from 'react';
import './introduction.css';

// Screenshots come from scripts/guide-shots/shots/intro.mjs: the real screens rendered with
// fictional people and classes (never school records).
const shot = (id) => `/gioi-thieu/intro-${id}.webp`;
/** Stagger for the scroll-in animation (CSS custom property, not in React's style typings). */
const delay = (ms) => Object.fromEntries([['--delay', `${ms}ms`]]);

const NAV = [
  ['vai-tro', 'Ai dùng'],
  ['phan-he', 'Các phân hệ'],
  ['duyet', 'Quy trình duyệt'],
  ['dien-thoai', 'Trên điện thoại'],
  ['an-toan', 'An toàn dữ liệu'],
];

const HIGHLIGHTS = [
  ['Lịch công tác', 'Văn thư soạn, Ban Giám hiệu duyệt theo tuần'],
  ['Công việc', 'Giao việc, nộp bằng chứng, duyệt hoàn thành'],
  ['Lớp học', 'Sổ đầu bài, lịch dạy, điểm, học sinh vắng'],
  ['Trao đổi', 'Nhắn tin theo việc, theo công tác và theo nhóm'],
];

const ROLES = [
  {
    id: 'van-thu',
    name: 'Văn thư',
    who: 'Người điều phối giấy tờ, lịch họp của trường',
    does: [
      'Soạn Lịch công tác chung của cả tuần, mời theo tổ, phòng ban hoặc từng người.',
      'Nộp lịch tuần cho Ban Giám hiệu duyệt; giáo viên chỉ thấy bản đã duyệt.',
      'Tạo công việc từ công văn, đính kèm file và gửi Ban Giám hiệu duyệt trước khi giao.',
    ],
    image: 'ct-chung',
    alt: 'Lịch công tác chung theo mẫu của trường',
  },
  {
    id: 'bgh',
    name: 'Ban Giám hiệu',
    who: 'Hiệu trưởng, Phó Hiệu trưởng',
    does: [
      'Duyệt hoặc trả lại lịch công tác tuần và công việc Văn thư gửi lên.',
      'Giao việc trực tiếp cho cấp dưới ở mọi tổ, theo dõi tiến độ từng người.',
      'Xem báo cáo toàn trường và ghi nhận xét đánh giá nhân sự.',
    ],
    image: 'cv-cho-toi-duyet',
    alt: 'Danh sách công việc chờ Ban Giám hiệu duyệt',
  },
  {
    id: 'to-truong',
    name: 'Tổ trưởng, tổ phó',
    who: 'Người phụ trách một tổ chuyên môn',
    does: [
      'Giao việc và lịch công tác cho giáo viên trong tổ, giao ngay không cần duyệt.',
      'Duyệt bằng chứng hoàn thành của những việc mình đã giao.',
      'Xem lịch và tiến độ của người trong tổ mình.',
    ],
    image: 'bc-cong-viec',
    alt: 'Báo cáo công việc theo từng người, dạng lịch tháng',
  },
  {
    id: 'giao-vien',
    name: 'Giáo viên',
    who: 'Giáo viên bộ môn và giáo viên chủ nhiệm',
    does: [
      'Xem lịch công tác của mình, xác nhận tham gia, nhận nhắc việc.',
      'Nhận việc được giao, nộp bằng chứng hoàn thành ngay trên điện thoại.',
      'Ghi sổ đầu bài, xem lịch dạy, nhập điểm môn mình dạy; GVCN theo dõi học sinh vắng của lớp.',
    ],
    image: 'cv-viec-duoc-giao',
    alt: 'Danh sách việc được giao của một giáo viên',
  },
  {
    id: 'giam-thi',
    name: 'Giám thị',
    who: 'Người điểm danh học sinh mỗi ngày',
    does: [
      'Điểm danh từng lớp trong ngày, chỉ cần đánh dấu học sinh vắng.',
      'Thấy ngay lớp nào đã điểm danh, lớp nào chưa.',
      'GVCN sau đó đánh dấu vắng có phép hay không phép.',
    ],
    image: 'dd-tong-quan',
    alt: 'Màn hình điểm danh các lớp trong ngày',
  },
];

const MODULES = [
  {
    id: 'lich-cong-tac',
    kicker: 'Lịch công tác',
    title: 'Lịch tuần của trường, đúng mẫu quen thuộc',
    text: 'Văn thư soạn lịch công tác chung; Ban Giám hiệu duyệt một lần cho cả tuần. Mọi người mở lịch theo đúng mẫu Word nhà trường vẫn dùng, tải PDF để in, và mỗi giáo viên có lịch cá nhân riêng.',
    points: ['Mời theo tổ chuyên môn, phòng ban hoặc từng người', 'Sửa lịch đã duyệt thì giáo viên vẫn thấy bản cũ cho tới khi duyệt lại', 'Xác nhận tham gia và nhắc trước giờ họp'],
    image: 'ct-bgh-duyet',
    alt: 'Ban Giám hiệu xem lịch tuần chờ duyệt',
    phone: 'ct-ca-nhan-mobile',
    phoneAlt: 'Lịch công tác cá nhân trên điện thoại',
  },
  {
    id: 'cong-viec',
    kicker: 'Công việc',
    title: 'Giao việc rõ người, rõ hạn, có bằng chứng',
    text: 'Mỗi công văn thành một công việc: giao cho cả tổ, một phòng ban hoặc từng người, mỗi dòng có nội dung và hạn chót riêng. Người nhận nộp bằng chứng, người giao duyệt hoàn thành.',
    points: ['Việc của Văn thư phải qua Ban Giám hiệu duyệt rồi mới tới người nhận', 'Đã có người nộp bằng chứng thì không ai sửa được nội dung việc', '"Việc của tôi": danh sách việc riêng, chỉ mình thấy'],
    image: 'cv-viec-duoc-giao',
    alt: 'Việc được giao, chia theo tab Cần làm, Chờ duyệt, Quá hạn',
    phone: 'cv-viec-cua-toi-mobile',
    phoneAlt: 'Việc của tôi trên điện thoại',
  },
  {
    id: 'lop-hoc',
    kicker: 'Lớp học',
    title: 'Lớp chủ nhiệm, lớp giảng dạy và học bạ ở một chỗ',
    text: 'Giáo viên thấy tiết dạy hôm nay, ghi sổ đầu bài, xem lịch dạy theo tuần và nhập điểm môn mình dạy. Giáo viên chủ nhiệm thấy sĩ số, học sinh vắng và tỉ lệ chuyên cần của lớp.',
    points: ['Thời khoá biểu theo tuần, theo tháng', 'Điểm danh do Giám thị lưu, GVCN xác nhận có phép hay không', 'Học bạ từng học sinh theo môn và học kỳ'],
    image: 'cn-tong-quan',
    alt: 'Tổng quan lớp chủ nhiệm: sĩ số, có mặt, vắng, chuyên cần',
    phone: 'cn-diem-danh-lop-mobile',
    phoneAlt: 'Điểm danh một lớp trên điện thoại',
    more: [
      ['lh-lich-day-tuan', 'Lịch dạy theo tuần'],
      ['lh-hoc-ba-diem', 'Học bạ: điểm theo môn'],
    ],
  },
  {
    id: 'trao-doi',
    kicker: 'Trao đổi',
    title: 'Nhắn tin ngay trong công việc',
    text: 'Mỗi công việc, mỗi buổi công tác có cuộc trao đổi riêng, cùng với các nhóm do thầy cô tự lập. Không phải tìm lại tin nhắn trong các nhóm chat bên ngoài.',
    points: ['Thu hồi tin nhắn trong 15 phút', 'Chuông thông báo gom mọi việc cần chú ý', 'Thông báo đẩy về điện thoại'],
    image: 'td-trao-doi',
    alt: 'Màn hình Trao đổi: danh sách cuộc trò chuyện và nội dung nhóm',
    phone: 'td-trao-doi-mobile',
    phoneAlt: 'Trao đổi trên điện thoại',
  },
  {
    id: 'bao-cao',
    kicker: 'Báo cáo, Bán trú, Đánh giá',
    title: 'Ban Giám hiệu nắm được toàn trường',
    text: 'Báo cáo cho biết mỗi người được giao gì, hoàn thành đúng hạn hay trễ. Bán trú lập danh sách giáo viên tham gia theo học kỳ. Đánh giá nhân sự gom nhận xét, mức hoàn thành công việc và ghi nhận lỗi vào hồ sơ từng người.',
    points: ['Xem theo tuần, tháng, quý, năm', 'Nhận xét do Văn thư ghi thay phải được Ban Giám hiệu duyệt', 'Người bị ghi nhận lỗi được báo, nhưng thông báo không kèm lý do'],
    image: 'dg-bgh-danh-sach',
    alt: 'Đánh giá nhân sự: danh sách theo tổ, hồ sơ và mức hoàn thành công việc',
    more: [
      ['bt-danh-sach', 'Bán trú: danh sách theo tổ'],
      ['bc-cong-viec', 'Báo cáo công việc'],
    ],
  },
  {
    id: 'thiet-lap',
    kicker: 'Thiết lập',
    title: 'Theo đúng cơ cấu của trường',
    text: 'Quản trị viên khai báo tổ chuyên môn (mỗi người một tổ), phòng ban như Ban Giám hiệu, Đảng uỷ, Công đoàn (một người nhiều phòng ban), chức vụ theo cấp sao và nhóm quyền quyết định mỗi người thấy menu nào.',
    points: ['Nhập danh sách người dùng bằng file Excel', 'Năm học, ngày nghỉ, môn học, lịch dạy', 'Giám thị chỉ mở menu Điểm danh'],
    image: 'tl-nhom-quyen',
    alt: 'Thiết lập nhóm quyền: bảng menu và mức xem',
    more: [['tl-phong-ban', 'Phòng ban: Ban Giám hiệu, Công đoàn, Đảng uỷ']],
  },
];

const FLOW = [
  ['Văn thư soạn', 'Lịch công tác tuần hoặc công việc từ công văn.'],
  ['Gửi Ban Giám hiệu', 'Người duyệt nhận chuông "chờ duyệt" và thông báo đẩy.'],
  ['Duyệt hoặc trả lại', 'Trả lại phải ghi lý do; Văn thư sửa rồi gửi lại.'],
  ['Mọi người nhận', 'Chỉ khi đã duyệt, giáo viên mới thấy và được báo.'],
];

const SAFETY = [
  ['Mỗi người một tài khoản', 'Tài khoản do nhà trường cấp. Đăng nhập sai nhiều lần thì khoá, chỉ quản trị viên mở lại.'],
  ['Thấy đúng phần của mình', 'Mọi quyền được kiểm tra trên máy chủ, không chỉ ẩn nút trên màn hình.'],
  ['File công văn riêng tư', 'File chỉ mở được sau khi đăng nhập và có quyền xem; không có đường link công khai.'],
  ['Không quảng cáo, không bán dữ liệu', 'Dịch vụ bên ngoài (lưu trữ, gửi mail, thông báo đẩy) chỉ nhận phần tối thiểu cần dùng. Xem chi tiết ở Chính sách bảo mật.'],
];

function useReveal() {
  useEffect(() => {
    const items = document.querySelectorAll('.intro-reveal');
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      items.forEach((item) => item.classList.add('is-visible'));
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      }
    }, { rootMargin: '0px 0px -10% 0px' });
    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);
}

function Zoomable({ id, alt, className = '', onZoom, eager = false }) {
  return (
    <button type="button" className={`intro-zoom ${className}`} onClick={() => onZoom({ id, alt })} aria-label={`Phóng to: ${alt}`}>
      <img src={shot(id)} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" />
    </button>
  );
}

function BrowserFrame({ id, alt, onZoom, eager = false }) {
  return (
    <figure className="intro-browser">
      <div className="intro-browser-bar" aria-hidden="true"><span /><span /><span /><i>thcslevantam.ai.vn</i></div>
      <Zoomable id={id} alt={alt} onZoom={onZoom} eager={eager} />
    </figure>
  );
}

function PhoneFrame({ id, alt, onZoom, className = '' }) {
  return (
    <figure className={`intro-phone ${className}`}>
      <Zoomable id={id} alt={alt} onZoom={onZoom} />
    </figure>
  );
}

function Lightbox({ image, onClose }) {
  const closeRef = useRef(null);
  useEffect(() => {
    if (!image) return undefined;
    closeRef.current?.focus();
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.documentElement.classList.add('intro-locked');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.documentElement.classList.remove('intro-locked');
    };
  }, [image, onClose]);
  if (!image) return null;
  return (
    <div className="intro-lightbox" role="dialog" aria-modal="true" aria-label={image.alt} onClick={onClose}>
      <figure onClick={(event) => event.stopPropagation()}>
        <img src={shot(image.id)} alt={image.alt} />
        <figcaption>{image.alt}</figcaption>
      </figure>
      <button ref={closeRef} type="button" className="intro-lightbox-close" onClick={onClose}>Đóng</button>
    </div>
  );
}

export default function IntroductionPage() {
  const [roleId, setRoleId] = useState(ROLES[0].id);
  const [zoomed, setZoomed] = useState(null);
  const role = ROLES.find((item) => item.id === roleId) || ROLES[0];
  useReveal();
  useEffect(() => { document.title = 'Giới thiệu · CRM Lê Văn Tám'; }, []);

  return (
    <div className="intro-page">
      <header className="intro-top">
        <a className="intro-brand" href="#dau-trang">
          <img src="/assets/logo-thcs-le-van-tam.png" alt="" />
          <span><strong>CRM Lê Văn Tám</strong><small>Trường THCS Lê Văn Tám</small></span>
        </a>
        <nav className="intro-nav" aria-label="Các phần của trang">
          {NAV.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
        </nav>
        <a className="intro-top-cta" href="/huong-dan-su-dung.html">Hướng dẫn sử dụng</a>
      </header>

      <main id="dau-trang">
        <section className="intro-hero">
          <div className="intro-hero-copy">
            <p className="intro-eyebrow">Hệ thống quản lý công tác nội bộ</p>
            <h1>Lịch, việc, lớp học và trao đổi của cả trường trong một ứng dụng</h1>
            <p className="intro-lede">
              Trường THCS Lê Văn Tám dùng CRM Lê Văn Tám để thay cho giấy tờ, tin nhắn rời rạc và bảng tính.
              Ban Giám hiệu duyệt, Văn thư điều phối, giáo viên nhận việc và báo kết quả, trên máy tính lẫn điện thoại.
            </p>
            <div className="intro-hero-actions">
              <a className="intro-button" href="#phan-he">Xem các phân hệ</a>
              <a className="intro-button is-ghost" href="/huong-dan-su-dung.html">Xem hướng dẫn và video</a>
            </div>
            <ul className="intro-platforms" aria-label="Dùng được trên">
              <li>Trình duyệt máy tính</li>
              <li>Android</li>
              <li>iPhone, iPad</li>
            </ul>
          </div>
          <div className="intro-hero-visual">
            <BrowserFrame id="giao-dien-chung" alt="Giao diện chung: menu bên trái, nội dung ở giữa" onZoom={setZoomed} eager />
            <PhoneFrame id="giao-dien-mobile" alt="Giao diện trên điện thoại" onZoom={setZoomed} className="is-floating" />
          </div>
        </section>

        <section className="intro-highlights" aria-label="Điểm chính">
          {HIGHLIGHTS.map(([title, text], index) => (
            <div className="intro-highlight intro-reveal" key={title} style={delay(index * 60)}>
              <strong>{title}</strong>
              <span>{text}</span>
            </div>
          ))}
        </section>

        <section className="intro-section" id="vai-tro" aria-labelledby="vai-tro-title">
          <div className="intro-section-head intro-reveal">
            <p className="intro-eyebrow">Ai dùng</p>
            <h2 id="vai-tro-title">Mỗi người thấy đúng phần việc của mình</h2>
            <p>Chọn một vai trò để xem họ làm gì trong ứng dụng.</p>
          </div>
          <div className="intro-roles intro-reveal">
            <div className="intro-role-tabs" role="tablist" aria-label="Vai trò">
              {ROLES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  id={`vai-tro-${item.id}`}
                  aria-selected={item.id === role.id}
                  aria-controls="vai-tro-panel"
                  className={item.id === role.id ? 'is-active' : ''}
                  onClick={() => setRoleId(item.id)}
                >
                  {item.name}
                </button>
              ))}
            </div>
            <div className="intro-role-panel" role="tabpanel" id="vai-tro-panel" aria-labelledby={`vai-tro-${role.id}`} key={role.id}>
              <div className="intro-role-copy">
                <h3>{role.name}</h3>
                <p className="intro-muted">{role.who}</p>
                <ul className="intro-checks">{role.does.map((line) => <li key={line}>{line}</li>)}</ul>
              </div>
              <BrowserFrame id={role.image} alt={role.alt} onZoom={setZoomed} />
            </div>
          </div>
        </section>

        <section className="intro-section" id="phan-he" aria-labelledby="phan-he-title">
          <div className="intro-section-head intro-reveal">
            <p className="intro-eyebrow">Các phân hệ</p>
            <h2 id="phan-he-title">Những gì nhà trường đang dùng hằng ngày</h2>
            <p>Hình chụp từ ứng dụng thật, dùng dữ liệu minh hoạ. Bấm vào hình để phóng to.</p>
          </div>
          {MODULES.map((module, index) => (
            <article className={`intro-module intro-reveal ${index % 2 ? 'is-flipped' : ''}`} key={module.id} id={module.id}>
              <div className="intro-module-copy">
                <p className="intro-kicker">{module.kicker}</p>
                <h3>{module.title}</h3>
                <p>{module.text}</p>
                <ul className="intro-checks">{module.points.map((line) => <li key={line}>{line}</li>)}</ul>
              </div>
              <div className="intro-module-visual">
                <BrowserFrame id={module.image} alt={module.alt} onZoom={setZoomed} />
                {module.phone ? <PhoneFrame id={module.phone} alt={module.phoneAlt} onZoom={setZoomed} className="is-floating" /> : null}
              </div>
              {module.more ? (
                <div className="intro-module-more">
                  {module.more.map(([id, label]) => (
                    <figure key={id}>
                      <Zoomable id={id} alt={label} onZoom={setZoomed} />
                      <figcaption>{label}</figcaption>
                    </figure>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </section>

        <section className="intro-section intro-flow-section" id="duyet" aria-labelledby="duyet-title">
          <div className="intro-section-head intro-reveal">
            <p className="intro-eyebrow">Quy trình duyệt</p>
            <h2 id="duyet-title">Ban Giám hiệu duyệt trước, giáo viên nhận sau</h2>
            <p>Lịch công tác chung và công việc do Văn thư tạo đều đi qua bước duyệt này. Việc tổ trưởng hay Ban Giám hiệu tự giao thì tới người nhận ngay.</p>
          </div>
          <ol className="intro-flow">
            {FLOW.map(([title, text], index) => (
              <li className="intro-reveal" key={title} style={delay(index * 80)}>
                <span className="intro-flow-number" aria-hidden="true">{index + 1}</span>
                <strong>{title}</strong>
                <p>{text}</p>
              </li>
            ))}
          </ol>
          <div className="intro-flow-shots intro-reveal">
            <figure><Zoomable id="cv-cho-toi-duyet" alt="Ban Giám hiệu: công việc chờ duyệt" onZoom={setZoomed} /><figcaption>Ban Giám hiệu thấy việc chờ duyệt</figcaption></figure>
            <figure><Zoomable id="tb-chuong" alt="Chuông thông báo với các mục mới" onZoom={setZoomed} /><figcaption>Chuông thông báo báo ngay khi có việc</figcaption></figure>
          </div>
        </section>

        <section className="intro-section intro-mobile" id="dien-thoai" aria-labelledby="dien-thoai-title">
          <div className="intro-section-head intro-reveal">
            <p className="intro-eyebrow">Trên điện thoại</p>
            <h2 id="dien-thoai-title">Ứng dụng Android và iOS, cùng giao diện với web</h2>
            <p>Đăng nhập bằng mật khẩu, vân tay, Face ID hoặc passkey. Thông báo đẩy báo lịch họp, việc mới và tin nhắn.</p>
          </div>
          <div className="intro-phones intro-reveal">
            <PhoneFrame id="ct-ca-nhan-mobile" alt="Lịch công tác cá nhân" onZoom={setZoomed} />
            <PhoneFrame id="cv-viec-cua-toi-mobile" alt="Việc của tôi" onZoom={setZoomed} />
            <PhoneFrame id="dd-dien-thoai-mobile" alt="Giám thị điểm danh trên điện thoại" onZoom={setZoomed} />
            <PhoneFrame id="td-trao-doi-mobile" alt="Trao đổi" onZoom={setZoomed} />
          </div>
        </section>

        <section className="intro-section" id="an-toan" aria-labelledby="an-toan-title">
          <div className="intro-section-head intro-reveal">
            <p className="intro-eyebrow">An toàn dữ liệu</p>
            <h2 id="an-toan-title">Dữ liệu của trường chỉ dành cho người trong trường</h2>
          </div>
          <div className="intro-safety">
            {SAFETY.map(([title, text], index) => (
              <div className="intro-safety-card intro-reveal" key={title} style={delay(index * 60)}>
                <strong>{title}</strong>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="intro-closing intro-reveal">
          <h2>Muốn xem kỹ từng thao tác?</h2>
          <p>Bộ hướng dẫn sử dụng có hơn 60 bài viết và video ngắn cho từng vai trò.</p>
          <a className="intro-button" href="/huong-dan-su-dung.html">Mở hướng dẫn sử dụng</a>
        </section>
      </main>

      <footer className="intro-footer">
        <p>© Trường THCS Lê Văn Tám · Hình minh hoạ dùng tên người, lớp và học sinh giả định, không phải dữ liệu thật.</p>
        <nav aria-label="Liên kết">
          <a href="/privacy">Chính sách bảo mật</a>
          <a href="/">Đăng nhập</a>
        </nav>
      </footer>

      <Lightbox image={zoomed} onClose={() => setZoomed(null)} />
    </div>
  );
}
