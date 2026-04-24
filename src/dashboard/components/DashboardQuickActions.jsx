// /src/dashboard/components/DashboardQuickActions.jsx

import React from 'react';

export default function DashboardQuickActions({ styles, actions, onAction }) {
  return (
    <div className={styles.quickDock}>
      <div className={styles.quickDockInner}>
        {(Array.isArray(actions) ? actions : []).map((action) => (
          <button
            key={action?.id}
            type="button"
            className={styles.quickDockBtn}
            onClick={() => onAction(action)}
          >
            {action?.label}
          </button>
        ))}
      </div>
    </div>
  );
}
