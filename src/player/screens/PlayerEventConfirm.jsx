// /src/player/screens/PlayerEventConfirm.jsx

import React, { useContext } from 'react';
import { PlayerContext } from '../../contexts/PlayerContext';
import StickyNavBar from '../components/StickyNavBar';
import styles from './PlayerRoomSelect.module.css';

export default function PlayerEventConfirm() {
  const { eventId } = useContext(PlayerContext);

  return (
    <div className={styles.container} style={{ paddingBottom: 160 }}>
      {/* 최종 안내/요약 영역 */}
      <div className={styles.notice} style={{ marginTop: 12 }}>
        최종 확인을 마치셨다면 ‘홈’으로 이동해 주세요.
      </div>

      {/* 홈 → 참가자 8버튼 화면(해당 eventId)로 이동하도록 수정 */}
      <StickyNavBar
        left={{ label: '← 이전', to: `/player/home/${eventId}/5`, variant: 'gray' }}
        right={{ label: '홈', to: `/player/home/${eventId}`, variant: 'blue' }}
      />
    </div>
  );
}
