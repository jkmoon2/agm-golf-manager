// /src/eventTemplates/rankScoreGame/RankScoreGameEditor.jsx
import React, { useMemo } from 'react';
import { normalizeRankScoreGameParams } from '../../events/rankScoreGame';

export default function RankScoreGameEditor({ participants = [], value, onChange }) {
  const safe = normalizeRankScoreGameParams(value);
  const participantsSafe = Array.isArray(participants) ? participants : [];

  const emit = (patch) => {
    if (typeof onChange !== 'function') return;
    onChange(normalizeRankScoreGameParams({ ...safe, ...patch }));
  };

  const adjustmentRows = useMemo(() => {
    return participantsSafe.map((p, idx) => {
      const id = String(p?.id ?? idx);
      return {
        id,
        name: String(p?.nickname || ''),
        room: p?.room ?? p?.roomNumber ?? '',
        handicap: Number(p?.handicap || 0),
        value: safe.adjustments?.[id] ?? '',
      };
    });
  }, [participantsSafe, safe.adjustments]);

  const setAdjustment = (id, valueText) => {
    const next = { ...(safe.adjustments || {}) };
    if (valueText === '' || valueText == null) {
      delete next[String(id)];
    } else {
      const n = Number(valueText);
      if (Number.isFinite(n)) next[String(id)] = n;
    }
    emit({ adjustments: next });
  };

  return (
    <div style={boxStyle}>
      <div style={titleStyle}>대회 순위 점수 게임 설정</div>
      <div style={helpStyle}>
        결과값(점수-G핸디), 보정 결과값, 참가자 직접 순위 중 하나로 순위를 만들고 환산점수/순위점수로 개인·무작위 포볼팀·방대방 게임을 진행합니다.
      </div>

      <div style={gridStyle}>
        <label style={labelStyle}>
          <span style={fieldLabelStyle}>순위 산출 기준</span>
          <select value={safe.rankingSource} onChange={(e) => emit({ rankingSource: e.target.value })} style={selectStyle}>
            <option value="result">결과값 순위(점수-G핸디)</option>
            <option value="adjusted">보정치 반영 순위(점수-G핸디+보정치)</option>
            <option value="manual">참가자 직접 순위 입력</option>
          </select>
        </label>

        <label style={labelStyle}>
          <span style={fieldLabelStyle}>게임 점수 방식</span>
          <select value={safe.pointType} onChange={(e) => emit({ pointType: e.target.value })} style={selectStyle}>
            <option value="converted">환산점수(N-rank+1)</option>
            <option value="rank">순위점수(rank)</option>
          </select>
        </label>

        <label style={labelStyle}>
          <span style={fieldLabelStyle}>게임 방식</span>
          <select value={safe.gameType} onChange={(e) => emit({ gameType: e.target.value })} style={selectStyle}>
            <option value="person">개인전</option>
            <option value="randomPair">포볼 게임(무작위 2인팀)</option>
            <option value="room">방대방 게임</option>
          </select>
        </label>

        <label style={labelStyle}>
          <span style={fieldLabelStyle}>승리 기준</span>
          <select value={safe.winnerOrder} onChange={(e) => emit({ winnerOrder: e.target.value })} style={selectStyle}>
            <option value="desc">높은 합계 승</option>
            <option value="asc">낮은 합계 승</option>
          </select>
        </label>
      </div>

      {safe.gameType === 'randomPair' && (
        <div style={seedBoxStyle}>
          <div style={{ minWidth: 0 }}>
            <div style={fieldLabelStyle}>무작위 팀 시드</div>
            <div style={smallTextStyle}>동일한 시드는 새로고침해도 같은 팀 구성을 유지합니다.</div>
          </div>
          <button
            type="button"
            style={buttonStyle}
            onClick={() => emit({ randomSeed: `rank-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` })}
          >
            팀 다시 섞기
          </button>
        </div>
      )}

      {safe.rankingSource === 'adjusted' && (
        <div style={adjustBoxStyle}>
          <div style={titleSubStyle}>참가자별 보정치</div>
          <div style={smallTextStyle}>+/- 값을 입력합니다. 비워두면 0으로 계산합니다.</div>
          <div style={adjustListStyle}>
            {adjustmentRows.map((row) => (
              <div key={row.id} style={adjustRowStyle}>
                <div style={{ minWidth: 0 }}>
                  <div style={nameStyle}>{row.name || '-'}</div>
                  <div style={smallTextStyle}>G핸디 {row.handicap}</div>
                </div>
                <input
                  type="number"
                  step="1"
                  value={row.value}
                  onChange={(e) => setAdjustment(row.id, e.target.value)}
                  placeholder="0"
                  style={adjustInputStyle}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={recommendBoxStyle}>
        <div style={titleSubStyle}>추천 게임 5가지</div>
        <ol style={recommendListStyle}>
          <li><b>역전 포인트전</b> · 보정치 순위 + 환산점수 + 높은 합계 승</li>
          <li><b>하위 탈출전</b> · 직접 순위 + 순위점수 + 낮은 합계 승</li>
          <li><b>랜덤 포볼 버디전</b> · 결과값 순위 + 환산점수 + 무작위 2인팀 높은 합계 승</li>
          <li><b>방대방 꼴찌 방지전</b> · 직접 순위 + 순위점수 + 방대방 낮은 합계 승</li>
          <li><b>핸디캡 보정 왕중왕전</b> · 보정치 순위 + 환산점수 + 개인 높은 점수 승</li>
        </ol>
      </div>
    </div>
  );
}

const boxStyle = { marginTop: 10, padding: 12, border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff', display: 'grid', gap: 12, boxSizing: 'border-box' };
const titleStyle = { fontWeight: 800, color: '#111827' };
const titleSubStyle = { fontWeight: 800, color: '#183153', marginBottom: 4 };
const helpStyle = { fontSize: 12, color: '#667085', lineHeight: 1.5 };
const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 };
const labelStyle = { display: 'grid', gap: 6, minWidth: 0 };
const fieldLabelStyle = { fontSize: 13, fontWeight: 700, color: '#344054' };
const selectStyle = { width: '100%', height: 42, borderRadius: 10, border: '1px solid #d0d7de', padding: '0 10px', background: '#fff', boxSizing: 'border-box' };
const smallTextStyle = { fontSize: 12, color: '#667085', lineHeight: 1.35 };
const seedBoxStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: 10, border: '1px solid #eef2f7', borderRadius: 12, background: '#fafcff' };
const buttonStyle = { border: '1px solid #8bb6ff', background: '#eef5ff', color: '#1d4ed8', borderRadius: 10, padding: '8px 10px', fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer' };
const adjustBoxStyle = { border: '1px solid #eef2f7', borderRadius: 12, padding: 10, display: 'grid', gap: 8 };
const adjustListStyle = { display: 'grid', gap: 6, maxHeight: 260, overflow: 'auto', paddingRight: 2 };
const adjustRowStyle = { display: 'grid', gridTemplateColumns: '1fr 88px', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid #f1f5f9', borderRadius: 10, background: '#fff' };
const nameStyle = { fontSize: 13, fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const adjustInputStyle = { width: '100%', height: 36, border: '1px solid #d0d7de', borderRadius: 8, textAlign: 'center', boxSizing: 'border-box' };
const recommendBoxStyle = { border: '1px solid #e7edf7', borderRadius: 12, padding: 10, background: '#fbfdff' };
const recommendListStyle = { margin: '6px 0 0 18px', padding: 0, fontSize: 12, color: '#344054', lineHeight: 1.7 };
