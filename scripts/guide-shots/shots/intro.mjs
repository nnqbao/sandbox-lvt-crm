// Clean screenshots (no numbered callouts) for the public introduction page /introduction.
// Reuses the user-guide shot recipes with the same fictional data; written to public/gioi-thieu.
import attendance from './attendance.mjs';
import boarding from './boarding.mjs';
import duties from './duties.mjs';
import homeroom from './homeroom.mjs';
import people from './people.mjs';
import settings from './settings.mjs';
import social from './social.mjs';
import start from './start.mjs';
import teaching from './teaching.mjs';
import work from './work.mjs';

export const dir = 'gioi-thieu';

const recipes = [...attendance, ...boarding, ...duties, ...homeroom, ...people, ...settings, ...social, ...start, ...teaching, ...work];

/** Guide recipe `id` without callouts, sharper (2x) unless the recipe sets its own scale. */
function clean(id, extra = {}) {
  const recipe = recipes.find((shot) => shot.id === id);
  if (!recipe) throw new Error(`intro: không có shot ${id}`);
  const { callouts, ...rest } = recipe;
  return { ...rest, id: `intro-${id}`, callouts: [], dpr: rest.dpr || 2, quality: 74, ...extra };
}

export default [
  clean('giao-dien-chung'),
  clean('giao-dien-mobile'),
  clean('ct-chung'),
  clean('ct-bgh-duyet'),
  clean('ct-ca-nhan-mobile'),
  clean('cv-cho-toi-duyet'),
  clean('cv-viec-duoc-giao'),
  clean('cv-viec-cua-toi-mobile'),
  clean('td-trao-doi'),
  clean('td-trao-doi-mobile'),
  clean('tb-chuong'),
  clean('cn-tong-quan'),
  clean('cn-diem-danh-lop-mobile'),
  clean('dd-tong-quan'),
  clean('dd-dien-thoai-mobile'),
  clean('lh-lich-day-tuan'),
  clean('lh-hoc-ba-diem'),
  clean('bt-danh-sach'),
  clean('bc-cong-viec'),
  clean('dg-bgh-danh-sach'),
  clean('ln-ghi-nhan-loi'),
  clean('tl-nhom-quyen'),
  clean('tl-phong-ban'),
];
