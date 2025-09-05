// /src/screens/Settings.jsx

import React, { useContext, useEffect, useMemo, useState } from 'react';
import styles from './Settings.module.css';
import { EventContext } from '../contexts/EventContext';

const STATUS = ['hidden', 'disabled', 'enabled'];

function getDefaultGate() {
  return {
    steps: { 1:'enabled', 2:'enabled', 3:'enabled', 4:'enabled', 5:'enabled', 6:'enabled', 7:'enabled', 8:'enabled' },
    step1: { teamConfirmEnabled: true },
  };
}
function mergeGate(prev, next) {
  const a = prev || {};
  const b = next || {};
  return {
    steps: { ...(a.steps || {}), ...(b.steps || {}) },
    step1: { ...(a.step1 || {}), ...(b.step1 || {}) },
  };
}

export default function Settings() {
  const { eventId, eventData, updatePlayerGate, updateEvent, updateEventImmediate } = useContext(EventContext);
  const hasEvent = !!eventId;

  const initial = useMemo(() => mergeGate(getDefaultGate(), eventData?.playerGate), [eventData]);
  const [gate, setGate] = useState(initial);
  useEffect(() => { setGate(initial); }, [initial]);

  const save = async (partial) => {
    const next = mergeGate(gate, partial);
    setGate(next);

    if (!hasEvent) {
      console.warn('[Settings] save blocked: no event selected');
      return;
    }

    try {
      if (typeof updateEventImmediate === 'function') {
        await updateEventImmediate({ playerGate: next }, true);
        console.info('[Settings] saved playerGate for', eventId, next);
        return;
      }
      if (typeof updatePlayerGate === 'function') {
        await updatePlayerGate(next);
      } else if (typeof updateEvent === 'function') {
        await updateEvent({ playerGate: next });
      }
    } catch (e) {
      console.error('[Settings] save failed:', e);
    }
  };

  const setStepStatus = (n, status) => {
    if (!STATUS.includes(status)) return;
    save({ steps: { [n]: status } });
  };

  const applyPreset = (key) => {
    if (key === 'allHidden') {
      save({ steps: { 1:'hidden',2:'hidden',3:'hidden',4:'hidden',5:'hidden',6:'hidden',7:'hidden',8:'hidden' } });
    } else if (key === 'openOnlyStep1') {
      save({ steps: { 1:'enabled',2:'disabled',3:'hidden',4:'hidden',5:'hidden',6:'hidden',7:'hidden',8:'hidden' }, step1: { teamConfirmEnabled: true } });
    } else if (key === 'progressFlow') {
      save({ steps: { 1:'enabled',2:'enabled',3:'disabled',4:'disabled',5:'disabled',6:'disabled',7:'hidden',8:'hidden' }, step1: { teamConfirmEnabled: true } });
    } else if (key === 'allEnabled') {
      save(getDefaultGate());
    }
  };

  const guideNextBlocked = gate.steps?.[2] !== 'enabled';

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2>운영자 설정</h2>
        <div className={styles.caption}>
          참가자 홈(8버튼)과 STEP1 “팀확인” 버튼의 노출/상태를 제어합니다.
          {guideNextBlocked && (
            <span className={styles.warn}>
              ※ 현재 설정에서 STEP2가 활성화되지 않아, 참가자 STEP1의 “다음” 버튼은 비활성화됩니다.
            </span>
          )}
        </div>
      </div>

      {!hasEvent && (
        <div className={styles.notice}>
          이벤트가 선택되지 않았습니다. 먼저 대회를 선택하세요.
        </div>
      )}

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h3>① 전체 프리셋</h3>
        </div>
        <div className={styles.presetRow}>
          <button onClick={() => applyPreset('allHidden')}>전체 숨김</button>
          <button onClick={() => applyPreset('openOnlyStep1')}>STEP1만 오픈</button>
          <button onClick={() => applyPreset('progressFlow')}>1·2만 오픈(진행형)</button>
          <button onClick={() => applyPreset('allEnabled')}>전체 활성</button>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h3>② 스텝별 제어 (숨김 / 비활성 / 활성)</h3>
          <div className={styles.subtle}>* 숨김: 버튼 자체 미노출 · 비활성: 회색/클릭 불가 · 활성: 정상 동작</div>
        </div>

        <table className={styles.table}>
          <thead>
            <tr>
              <th>STEP</th>
              <th>기능</th>
              <th>숨김</th>
              <th>비활성</th>
              <th>활성</th>
            </tr>
          </thead>
          <tbody>
            {[1,2,3,4,5,6,7,8].map((n) => (
              <tr key={n}>
                <td className={styles.stepCol}>STEP {n}</td>
                <td className={styles.titleCol}>
                  {n===1 && '방 선택'}
                  {n===2 && '방배정표'}
                  {n===3 && '이벤트'}
                  {n===4 && '점수 입력'}
                  {n===5 && '결과 확인'}
                  {n===6 && '이벤트 확인'}
                  {n===7 && '#TEMP'}
                  {n===8 && '#TEMP'}
                </td>
                {STATUS.map(s => (
                  <td key={s}>
                    <label className={styles.radio}>
                      <input
                        type="radio"
                        name={`step-${n}`}
                        checked={(gate.steps?.[n] || 'enabled') === s}
                        onChange={() => setStepStatus(n, s)}
                      />
                      <span />
                    </label>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h3>③ STEP1 옵션</h3>
          <div className={styles.subtle}>
            * “팀확인” 버튼을 끄면 참가자 STEP1에서 팀확인을 할 수 없습니다.
          </div>
        </div>
        <div className={styles.optionRow}>
          <label className={styles.switch}>
            <input
              type="checkbox"
              checked={!!gate.step1?.teamConfirmEnabled}
              onChange={e => save({ step1: { teamConfirmEnabled: e.target.checked } })}
            />
            <span className={styles.slider} />
          </label>
          <span className={styles.optionLabel}>팀확인 버튼 활성화</span>
        </div>
        <div className={styles.hint}>
          ※ 권장: 경기 시작 전엔 STEP1만 활성화, STEP2 비활성 → 진행 신호 후 STEP2 활성.
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h3>④ (선택) 진행 안내</h3>
        </div>
        <ul className={styles.todoList}>
          <li>진행 시작: <b>STEP1만 활성화</b>하여 참가자 대기 유도</li>
          <li>방배정 공개: <b>STEP2 활성화</b> → STEP1의 “다음” 활성</li>
          <li>스코어 입력: <b>STEP4 활성화</b> (필드 종료 후)</li>
          <li>최종 결과 공개: <b>STEP5 활성화</b></li>
        </ul>
      </section>
    </div>
  );
}
