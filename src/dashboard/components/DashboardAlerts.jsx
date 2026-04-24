// /src/dashboard/components/DashboardAlerts.jsx

import React from 'react';

function severityClass(styles, severity) {
  if (severity === 'critical') return `${styles.severityChip} ${styles.severityCritical}`;
  if (severity === 'warn') return `${styles.severityChip} ${styles.severityWarn}`;
  return `${styles.severityChip} ${styles.severityInfo}`;
}

export default function DashboardAlerts({ styles, alerts, onAction }) {
  const [expanded, setExpanded] = React.useState(false);
  const list = Array.isArray(alerts) ? alerts : [];
  const visibleAlerts = expanded ? list : list.slice(0, 2);
  const headline = list.slice(0, 2).map((item) => item?.title).filter(Boolean).join(' / ');

  return (
    <section className={`${styles.monitorSection} ${styles.summarySectionCard}`}>
      <button type="button" className={styles.summaryToggle} onClick={() => setExpanded((prev) => !prev)}>
        <div>
          <div className={styles.sectionTitle}>운영 현황</div>
          <div className={styles.sectionDesc}>우선 확인이 필요한 핵심 경고만 먼저 보여줍니다.</div>
        </div>
        <span className={styles.toggleText}>{expanded ? '접기' : '펼치기'}</span>
      </button>

      <div className={styles.summaryMetaRow}>
        <span className={styles.summaryMainStat}>경고 {list.length}건</span>
        <span className={styles.summarySubStat}>{headline || '현재 조치 필요 항목이 없습니다.'}</span>
      </div>

      {expanded && (
        <div className={styles.alertListCompact}>
          {visibleAlerts.map((alert) => (
            <div key={alert?.id} className={styles.alertItemCompact}>
              <div className={styles.alertLeftCompact}>
                <div className={styles.alertTitleRow}>
                  <span className={severityClass(styles, alert?.severity)}>{String(alert?.severity || 'info').toUpperCase()}</span>
                  <div className={styles.alertTitle}>{alert?.title}</div>
                </div>
                <div className={styles.alertDesc}>{alert?.description}</div>
              </div>
              <button type="button" className={styles.alertBtn} onClick={() => onAction(alert)}>
                {alert?.actionLabel || '이동'}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
