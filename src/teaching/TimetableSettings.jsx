import React, { useEffect } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { settingsSubPath, settingsSubPathname } from '../navigationRoutes';
import { EmptyState, Icon, Loading } from '../homeroom/homeroomUi';
import TimetableEditor from './TimetableEditor';
import { GradeClassPicker, goBack, navigateTo, usePathname, useSchoolYears, YearStepper } from './teachingShared';
import '../homeroom/homeroom.css';
import './teaching.css';

/** Thiết lập lịch dạy (Administrator): khối 6–9 → lớp → chọn giáo viên cho từng tiết. */
export default function TimetableSettings() {
  const path = usePathname();
  const [classId] = settingsSubPath('timetable', path);
  const yearState = useSchoolYears();
  const ensureDefaults = useMutation(anyApi.teachingCatalog.ensureDefaults);
  useEffect(() => {
    void ensureDefaults({}).catch(() => {});
  }, [ensureDefaults]);

  if (yearState.loading) {
    return (
      <section className="homeroom-view">
        <Loading label="Đang tải Thiết lập lịch dạy…" />
      </section>
    );
  }
  if (!yearState.year) {
    return (
      <section className="homeroom-view">
        <EmptyState icon="calendar" title="Chưa có năm học.">Tạo năm học trong Thiết lập năm học trước.</EmptyState>
      </section>
    );
  }
  return (
    <section className="homeroom-view">
      {classId ? (
        <div className="hr-stack">
          <button type="button" className="hr-back" onClick={() => goBack(settingsSubPathname('timetable'))}>
            <Icon name="arrowLeft" size={15} /> Danh sách lớp
          </button>
          <TimetableEditor classId={classId} mode="class" />
        </div>
      ) : (
        <ClassList yearState={yearState} />
      )}
    </section>
  );
}

function ClassList({ yearState }) {
  const classes = useQuery(anyApi.homeroomClasses.listCatalog, { schoolYearId: yearState.year._id });
  return (
    <div className="hr-stack">
      <header className="tc-page-head">
        <div>
          <span className="hr-eyebrow">Thiết lập tối cao</span>
          <h2>Thiết lập lịch dạy</h2>
          <p className="hr-muted">
            Chọn khối rồi chọn lớp để xếp giáo viên cho từng tiết (5 tiết sáng, 5 tiết chiều, Thứ 2 – Thứ 6).
            Danh sách giáo viên lấy từ Thiết lập giáo viên theo Môn giảng dạy.
          </p>
        </div>
        <YearStepper state={yearState} />
      </header>
      {classes === undefined ? (
        <Loading label="Đang tải lớp…" />
      ) : !classes.length ? (
        <EmptyState icon="classes" title="Năm học chưa có lớp.">Tạo lớp tại Lớp học › Quản lý lớp.</EmptyState>
      ) : (
        <GradeClassPicker
          classes={classes}
          renderMeta={(row) => `${row.rosterCount} HS`}
          onOpen={(row) => navigateTo(settingsSubPathname('timetable', row._id))}
        />
      )}
    </div>
  );
}
