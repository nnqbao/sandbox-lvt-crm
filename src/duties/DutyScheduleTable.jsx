import { OfficialDutyHeader } from './DutyWorkspaceTabs';
import { canOpenDutyContentEditor, SHARED_SCHEDULE_DRAFT_MARK } from './sharedDutySchedule.js';
import { DutyChatButton } from './DutyChatButton';
import { CardIconButton, PencilIcon } from '../lib/CardActionIcons';
import '../work/work.css';

function DutyContentLabel({ content, edited }) {
  if (!edited || !content) return content;
  return (
    <span className="lct-content-edited" data-edited="true" title="Đã chỉnh sửa">
      {content}
    </span>
  );
}

export default function DutyScheduleTable({
  title,
  rows,
  onEditContent = null,
  onSelectEvent = null,
  draft = false,
}) {
  return (
    <article
      className={draft ? 'lct-sheet is-draft' : 'lct-sheet'}
      aria-label={draft ? `${title} (${SHARED_SCHEDULE_DRAFT_MARK})` : title}
      data-draft-mark={draft ? SHARED_SCHEDULE_DRAFT_MARK : undefined}
    >
      <OfficialDutyHeader title={title} />
      {draft ? <p className="lct-draft-mark">{SHARED_SCHEDULE_DRAFT_MARK}</p> : null}
      <table className="lct-table">
        <colgroup>
          <col className="lct-col-day" />
          <col className="lct-col-time" />
          <col className="lct-col-content" />
          <col className="lct-col-place" />
          <col className="lct-col-people" />
        </colgroup>
        <thead>
          <tr>
            <th>Ngày</th>
            <th>Thời gian</th>
            <th>Nội dung</th>
            <th>Địa điểm</th>
            <th>Thành phần</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const selectable = Boolean(row.eventId && onSelectEvent);
            const editable = Boolean(onEditContent) && canOpenDutyContentEditor(row);
            const edited = Boolean(row.edited);
            return (
              <tr
                key={`${row.dayIso}-${row.eventId || 'empty'}-${index}`}
                className={[
                  selectable ? 'lct-row-selectable' : '',
                  row.approvalChange ? 'lct-row-pending' : '',
                ].filter(Boolean).join(' ') || undefined}
                title={row.approvalChange === 'added' ? 'Công tác mới, chưa duyệt' : row.approvalChange ? 'Đã sửa, chưa duyệt' : undefined}
                onClick={selectable ? () => onSelectEvent(row) : undefined}
              >
                {row.showDay ? (
                  <th scope="row" rowSpan={row.rowSpan}>{row.dayLabel}</th>
                ) : null}
                <td>{row.time}</td>
                <td className={editable ? 'lct-content-cell is-editable' : 'lct-content-cell'}>
                  <div className="lct-content-with-actions">
                    <div className="lct-content-text">
                      {editable ? (
                        <button
                          type="button"
                          className={`lct-content-button${row.content ? '' : ' is-empty'}`}
                          title="Sửa công tác"
                          aria-label={row.content ? `Sửa công tác: ${row.content}` : 'Sửa công tác'}
                          onClick={(event) => {
                            event.stopPropagation();
                            onEditContent(row);
                          }}
                        >
                          <DutyContentLabel content={row.content} edited={edited} />
                        </button>
                      ) : (
                        <DutyContentLabel content={row.content} edited={edited} />
                      )}
                    </div>
                    {row.eventId ? (
                      <span
                        className="lct-row-actions"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {row.canChat !== false ? (
                          <DutyChatButton dutyId={row.eventId} title={row.content} />
                        ) : null}
                        {editable ? (
                          <CardIconButton
                            className="work-edit-button"
                            title="Sửa"
                            onClick={() => onEditContent(row)}
                          >
                            <PencilIcon />
                          </CardIconButton>
                        ) : null}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td>{row.location}</td>
                <td>
                  {row.participants || !editable ? (
                    row.participants
                  ) : (
                    <button
                      type="button"
                      className="lct-add-participants"
                      onClick={(event) => {
                        event.stopPropagation();
                        onEditContent(row);
                      }}
                    >
                      + Thêm thành phần
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </article>
  );
}
