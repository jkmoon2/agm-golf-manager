// /src/screens/DashboardV2.jsx

import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './DashboardV2.module.css';
import useDashboardSnapshot from '../dashboard/hooks/useDashboardSnapshot';
import DashboardHeader from '../dashboard/components/DashboardHeader';
import DashboardStatusCards from '../dashboard/components/DashboardStatusCards';
import DashboardAlerts from '../dashboard/components/DashboardAlerts';
import DashboardRoomMonitor from '../dashboard/components/DashboardRoomMonitor';
import DashboardEventMonitor from '../dashboard/components/DashboardEventMonitor';
import DashboardQuickActions from '../dashboard/components/DashboardQuickActions';
import { EventContext } from '../contexts/EventContext';

export default function DashboardV2() {
  const navigate = useNavigate();
  const { eventId, loadEvent } = React.useContext(EventContext) || {};

  const {
    loading,
    empty,
    availableEvents,
    meta,
    statusCards,
    alerts,
    roomCards,
    eventCards,
    quickActions,
  } = useDashboardSnapshot(eventId);

  const sortedEvents = useMemo(() => {
    const list = Array.isArray(availableEvents) ? [...availableEvents] : [];
    return list.sort((a, b) => String(b?.dateStart || '').localeCompare(String(a?.dateStart || '')));
  }, [availableEvents]);

  const handleSelectEvent = async (nextId) => {
    if (!nextId || typeof loadEvent !== 'function') return;
    await loadEvent(nextId);
  };

  const findQuickAction = (id) => (Array.isArray(quickActions) ? quickActions : []).find((item) => item.id === id);

  const handleQuickAction = (action) => {
    if (!action) return;
    if (typeof action?.onClick === 'function') {
      action.onClick();
      return;
    }

    switch (action?.id) {
      case 'go-step4':
        navigate('/admin/home/4');
        return;
      case 'go-assignment':
        navigate(meta?.mode === 'fourball' ? '/admin/home/7' : '/admin/home/5');
        return;
      case 'go-step6':
        navigate(meta?.mode === 'fourball' ? '/admin/home/8' : '/admin/home/6');
        return;
      case 'go-event-manager':
        navigate('/admin/home/events');
        return;
      case 'refresh-now': {
        const linkedRefresh = findQuickAction('refresh-now');
        if (typeof linkedRefresh?.onClick === 'function') linkedRefresh.onClick();
        return;
      }
      default:
        if (action?.href) {
          navigate(action.href);
        }
    }
  };

  const handleAlertAction = (alert) => {
    const linked = findQuickAction(alert?.actionId);
    if (linked) {
      handleQuickAction(linked);
      return;
    }
    handleQuickAction({ id: alert?.actionId });
  };

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <DashboardHeader
          styles={styles}
          meta={meta}
          selectedEventId={eventId || ''}
          events={sortedEvents}
          onSelectEvent={handleSelectEvent}
        />

        {loading && (
          <section className={styles.section}>
            <div className={styles.loadingBox}>대시보드 데이터를 불러오는 중입니다...</div>
          </section>
        )}

        {!loading && empty && (
          <section className={styles.section}>
            <div className={styles.emptyBox}>
              <div className={styles.emptyTitle}>선택된 대회가 없습니다.</div>
              <div className={styles.emptyDesc}>상단에서 대회를 선택하면 새 대시보드에서 전체 진행 상태를 확인할 수 있습니다.</div>
            </div>
          </section>
        )}

        {!loading && !empty && (
          <>
            <DashboardStatusCards styles={styles} cards={statusCards} compact />

            <div className={styles.summarySectionStack}>
              <DashboardAlerts styles={styles} alerts={alerts} onAction={handleAlertAction} />
              <DashboardRoomMonitor styles={styles} rooms={roomCards} />
              <DashboardEventMonitor styles={styles} events={eventCards} onAction={handleQuickAction} />
            </div>
          </>
        )}
      </div>

      {!loading && !empty && (
        <DashboardQuickActions
          styles={styles}
          actions={quickActions}
          onAction={handleQuickAction}
        />
      )}
    </div>
  );
}
