import React, { useEffect, useState } from 'react';
import { useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import './boarding.css';

function periodLabel(period) {
  return period ? `Kỳ ${period.semester} · Năm học ${period.schoolYear}` : 'Chưa có kỳ bán trú';
}

export default function BoardingReportsView() {
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const data = useQuery(
    anyApi.boarding.report,
    selectedPeriodId ? { periodId: selectedPeriodId } : {},
  );

  useEffect(() => {
    if (data?.selectedPeriod?._id && !selectedPeriodId) {
      setSelectedPeriodId(data.selectedPeriod._id);
    }
  }, [data?.selectedPeriod?._id, selectedPeriodId]);

  if (data === undefined) {
    return <div className="boarding-report-loading">Đang tải các kỳ bán trú…</div>;
  }

  const selectedPeriod = data.selectedPeriod;
  const groups = data.groups || [];
  const isGlobalView = data.visibilityScope === 'all';

  return (
    <section className="boarding-report">
      <section className="boarding-period-picker">
        <div>
          <span className="boarding-report-kicker">CHỌN KỲ CẦN XEM</span>
          <h3>{periodLabel(selectedPeriod)}</h3>
          <p>
            {isGlobalView
              ? 'Bạn đang xem toàn bộ phòng ban tham gia bán trú.'
              : 'Bạn đang xem giáo viên tham gia bán trú trong phòng ban của mình.'}
          </p>
        </div>
        <label>
          <span>Kỳ bán trú</span>
          <select
            value={selectedPeriodId || selectedPeriod?._id || ''}
            onChange={(event) => setSelectedPeriodId(event.target.value)}
            disabled={!data.periods.length}
          >
            {!data.periods.length ? <option value="">Chưa có kỳ bán trú</option> : null}
            {data.periods.map((period) => (
              <option value={period._id} key={period._id}>
                {periodLabel(period)}
              </option>
            ))}
          </select>
        </label>
      </section>

      {selectedPeriod ? (
        <>
          <div className="boarding-report-stats">
            <div>
              <i>◉</i>
              <span><strong>{data.totalParticipants}</strong><small>Giáo viên tham gia</small></span>
            </div>
            <div>
              <i>◇</i>
              <span><strong>{groups.length}</strong><small>Phòng ban</small></span>
            </div>
            <p>Danh sách do quản trị viên thiết lập trong menu Bán trú.</p>
          </div>

          {groups.length ? (
            <div className="boarding-report-groups">
              {groups.map((group) => (
                <article className="boarding-report-group" key={group.departmentName}>
                  <header>
                    <div>
                      <span>PHÒNG BAN</span>
                      <h3>{group.departmentName}</h3>
                    </div>
                    <strong>{group.participantCount}<small> giáo viên</small></strong>
                  </header>
                  <div className="boarding-report-table-wrap">
                    <table className="boarding-report-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Họ tên</th>
                          <th>Chức vụ</th>
                          <th>Tham gia kỳ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.participants.map((participant, index) => (
                          <tr key={participant._id}>
                            <td><span className="boarding-row-index">{String(index + 1).padStart(2, '0')}</span></td>
                            <td>
                              <strong>{participant.name}</strong>
                              <small>{participant.email}</small>
                            </td>
                            <td>{participant.positionName}</td>
                            <td><span className="boarding-participation-badge">Đã đăng ký</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="boarding-report-empty">
              <span>☼</span>
              <h3>Chưa có giáo viên tham gia trong kỳ này</h3>
              <p>Hãy chọn kỳ khác. Quản trị viên cập nhật danh sách ở menu Bán trú › Kỳ bán trú.</p>
            </div>
          )}
        </>
      ) : (
        <div className="boarding-report-empty">
          <span>☼</span>
          <h3>Chưa có kỳ bán trú để xem</h3>
          <p>Quản trị viên cần tạo kỳ bán trú và thêm giáo viên tham gia trước.</p>
        </div>
      )}
    </section>
  );
}
