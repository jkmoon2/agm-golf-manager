// /src/dashboard/components/DashboardEventMonitor.jsx

import React from 'react';

function eventStatusClass(styles, status) {
  if (status === 'delay') return `${styles.flagChip} ${styles.flagWarn}`;
  if (status === 'check') return `${styles.flagChip} ${styles.flagCritical}`;
  return `${styles.flagChip} ${styles.flagNormal}`;
}

export default function DashboardEventMonitor({ styles, events, onAction }) {
  const [expanded, setExpanded] = React.useState(false);
  const eventList = Array.isArray(events) ? events : [];
  const okCount = eventList.filter((event) => event?.status === 'ok').length;
  const delayCount = eventList.filter((event) => event?.status === 'delay').length;
  const checkCount = eventList.filter((event) => event?.status === 'check').length;
  const visibleEvents = expanded ? eventList : eventList.slice(0, 2);

  return (
    <section className={`${styles.monitorSection} ${styles.summarySectionCard}`}>
      <button type="button" className={styles.summaryToggle} onClick={() => setExpanded((prev) => !prev)}>
        <div>
          <div className={styles.sectionTitle}>이벤트 현황</div>
          <div className={styles.sectionDesc}>이벤트별 입력 진행률과 상태를 요약해서 보여줍니다.</div>
        </div>
        <span className={styles.toggleText}>{expanded ? '접기' : '펼치기'}</span>
      </button>

      <div className={styles.summaryStatsBar}>
        <div className={styles.summaryMiniStat}><span>이벤트</span><strong>{eventList.length}</strong></div>
        <div className={styles.summaryMiniStat}><span>정상</span><strong>{okCount}</strong></div>
        <div className={styles.summaryMiniStat}><span>지연</span><strong>{delayCount}</strong></div>
        <div className={styles.summaryMiniStat}><span>확인</span><strong>{checkCount}</strong></div>
      </div>

      {expanded && (
        <div className={styles.eventGridCompact}>
          {visibleEvents.map((event) => (
            <article key={event?.eventId} className={styles.eventCardCompact}>
              <div className={styles.cardTopCompact}>
                <div>
                  <div className={styles.cardTitle}>{event?.title}</div>
                  <div className={styles.cardMeta}>
                    <span className={styles.smallPill}>{event?.template}</span>
                    <span className={styles.smallPill}>{event?.target}</span>
                    <span className={styles.smallPill}>{event?.rankOrder}</span>
                  </div>
                </div>
              </div>

              <div className={styles.flagRowCompact}>
                <span className={eventStatusClass(styles, event?.status)}>
                  {event?.status === 'delay' ? '입력 지연' : event?.status === 'check' ? '결과 확인' : '정상'}
                </span>
                <span className={styles.summaryText}>입력 {event?.inputDone || 0}/{event?.inputTarget || 0} · 미완료 {event?.inputMissing || 0}</span>
              </div>

              <div className={styles.eventActionsCompact}>
                {(Array.isArray(event?.actions) ? event.actions : []).map((action) => (
                  <button key={`${event?.eventId}-${action?.id}-${action?.label}`} type="button" className={styles.eventActionBtn} onClick={() => onAction(action)}>
                    {action?.label}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
