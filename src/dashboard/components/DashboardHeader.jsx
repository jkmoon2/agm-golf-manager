// /src/dashboard/components/DashboardHeader.jsx

import React from 'react';

export default function DashboardHeader({ styles, meta, selectedEventId, events, onSelectEvent }) {
  return (
    <section className={styles.headerCard}>
      <div className={styles.headerTop}>
        <div className={styles.headerLeft}>
          <div className={styles.headerTitleBlock}>
            <div className={styles.headerTitle}>{meta?.title || '대회를 선택해 주세요'}</div>
            <div className={styles.headerSub}>
              <span className={styles.metaPill}>{meta?.eventId || '-'}</span>
              <span className={`${styles.metaPill} ${meta?.mode === 'fourball' ? styles.modeFourball : styles.modeStroke}`}>
                {meta?.modeLabel || '스트로크'}
              </span>
              <span className={styles.metaPill}>{meta?.dateRange || '-'}</span>
            </div>
          </div>
        </div>

        <div className={styles.headerControls}>
          <select
            className={styles.select}
            value={selectedEventId || ''}
            onChange={async (e) => {
              await onSelectEvent(e.target.value);
              if (typeof e?.currentTarget?.blur === 'function') e.currentTarget.blur();
            }}
          >
            <option value="">대회를 선택하세요</option>
            {(Array.isArray(events) ? events : []).map((event) => (
              <option key={event?.id} value={event?.id}>
                {event?.title || event?.id}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.headerTop} style={{ marginTop: 14 }}>
        <div className={styles.liveStateWrap}>
          <span
            className={[
              styles.liveBadge,
              meta?.liveState === 'LIVE' ? styles.liveLive : '',
              meta?.liveState === 'STALE' ? styles.liveStale : '',
              meta?.liveState === 'OFFLINE' ? styles.liveOffline : '',
            ].join(' ').trim()}
          >
            {meta?.liveState || 'STALE'}
          </span>
          <span className={styles.lastUpdated}>마지막 업데이트: {meta?.lastUpdatedText || '-'}</span>
        </div>
      </div>
    </section>
  );
}
