// /src/dashboard/components/DashboardStatusCards.jsx

import React from 'react';

function DashboardStatusCard({ styles, card }) {
  if (!card) return null;
  return (
    <div className={styles.statusCard}>
      <div className={styles.statusLabel}>{card.label}</div>
      <div className={styles.statusValueRow}>
        <div className={styles.statusValue}>{card.done ?? 0}</div>
        <div className={styles.statusTotal}>/ {card.total ?? 0}</div>
      </div>
      <div className={styles.progressTrack}>
        <div className={styles.progressFill} style={{ width: `${card.percent || 0}%` }} />
      </div>
      <div className={styles.statusHint} title={card.hint || '-'}>{card.hint || '-'}</div>
    </div>
  );
}

export default function DashboardStatusCards({ styles, cards }) {
  const list = [cards?.entry, cards?.assignment, cards?.score, cards?.eventInput];
  return (
    <section className={styles.statusGrid}>
      {list.map((card) => (
        <DashboardStatusCard key={card?.id || card?.label} styles={styles} card={card} />
      ))}
    </section>
  );
}
