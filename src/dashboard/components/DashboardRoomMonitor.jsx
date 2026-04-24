// /src/dashboard/components/DashboardRoomMonitor.jsx

import React from 'react';

function flagClass(styles, variant) {
  if (variant === 'critical') return `${styles.flagChip} ${styles.flagCritical}`;
  if (variant === 'warn') return `${styles.flagChip} ${styles.flagWarn}`;
  return `${styles.flagChip} ${styles.flagNormal}`;
}

export default function DashboardRoomMonitor({ styles, rooms }) {
  const [expanded, setExpanded] = React.useState(false);
  const roomList = Array.isArray(rooms) ? rooms : [];
  const abnormalCount = roomList.filter((room) => (Array.isArray(room?.flags) ? room.flags : []).some((flag) => flag?.variant !== 'normal')).length;
  const scoreDelayRooms = roomList.filter((room) => Number(room?.scoreEnteredCount || 0) < Number(room?.occupancy?.current || 0)).length;
  const eventDelayRooms = roomList.filter((room) => (Array.isArray(room?.flags) ? room.flags : []).some((flag) => String(flag?.label || '').includes('이벤트지연'))).length;
  const visibleRooms = expanded ? roomList : roomList.slice(0, 2);

  return (
    <section className={`${styles.monitorSection} ${styles.summarySectionCard}`}>
      <button type="button" className={styles.summaryToggle} onClick={() => setExpanded((prev) => !prev)}>
        <div>
          <div className={styles.sectionTitle}>방 현황</div>
          <div className={styles.sectionDesc}>각 방의 인원과 입력 상태를 요약해서 보여줍니다.</div>
        </div>
        <span className={styles.toggleText}>{expanded ? '접기' : '펼치기'}</span>
      </button>

      <div className={styles.summaryStatsBar}>
        <div className={styles.summaryMiniStat}><span>방</span><strong>{roomList.length}</strong></div>
        <div className={styles.summaryMiniStat}><span>이상</span><strong>{abnormalCount}</strong></div>
        <div className={styles.summaryMiniStat}><span>점수지연</span><strong>{scoreDelayRooms}</strong></div>
        <div className={styles.summaryMiniStat}><span>이벤트지연</span><strong>{eventDelayRooms}</strong></div>
      </div>

      {expanded && (
        <div className={styles.roomGridCompact}>
          {visibleRooms.map((room) => (
            <article key={room?.roomNo} className={styles.roomCardCompact}>
              <div className={styles.cardTopCompact}>
                <div>
                  <div className={styles.cardTitle}>{room?.roomName}</div>
                  <div className={styles.cardMeta}>
                    <span className={styles.smallPill}>{room?.occupancy?.current || 0} / {room?.occupancy?.capacity || 0}명</span>
                    <span className={styles.smallPill}>G핸디 합 {room?.sumHandicap || 0}</span>
                  </div>
                </div>
              </div>

              <div className={styles.memberListCompact}>
                {(Array.isArray(room?.members) ? room.members : []).map((member) => (
                  <div key={member?.id || member?.nickname} className={styles.memberRowCompact}>
                    <div className={styles.memberNameCompact}>{member?.nickname || '-'}</div>
                    <div className={styles.memberBadgesCompact}>
                      <span className={styles.memberBadge}>{member?.group ? `${member.group}조` : '-'}</span>
                      <span className={styles.memberBadge}>{member?.scoreEntered ? '점수입력' : '미입력'}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className={styles.cardStatsInlineCompact}>
                <div className={styles.statBlockCompact}>
                  <div className={styles.statLabel}>점수입력</div>
                  <div className={styles.statValueCompact}>{room?.scoreEnteredCount || 0}</div>
                </div>
                <div className={styles.statBlockCompact}>
                  <div className={styles.statLabel}>이벤트입력</div>
                  <div className={styles.statValueCompact}>{room?.eventEnteredCount || 0}</div>
                </div>
                <div className={styles.statBlockCompact}>
                  <div className={styles.statLabel}>인원</div>
                  <div className={styles.statValueCompact}>{room?.occupancy?.current || 0}</div>
                </div>
              </div>

              <div className={styles.flagRowCompact}>
                {(Array.isArray(room?.flags) ? room.flags : []).map((flag, index) => (
                  <span key={`${room?.roomNo}-${index}`} className={flagClass(styles, flag?.variant)}>{flag?.label}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
