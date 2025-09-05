// /src/events/registry.js

export const EVENT_TEMPLATES = [
  {
    type: 'raw-number',
    label: '숫자 입력(그대로 점수)',
    defaultParams: { aggregator: 'sum' } // 방/팀 합산 시 기본 sum
  },
  {
    type: 'number-convert',
    label: '숫자 × 계수(환산)',
    defaultParams: { factor: 1, aggregator: 'sum' }
  },
  {
    type: 'range-convert',
    label: '숫자 범위→점수(테이블)',
    defaultParams: {
      table: [ // 예시
        { min: 0, max: 5, score: 10 },
        { min: 6, max: 10, score: 7 },
        { min: 11, max: 99, score: 3 }
      ],
      aggregator: 'sum'
    }
  }
];

// value → score
export function computeScore(def, value) {
  const v = Number(value ?? 0);
  switch (def.template) {
    case 'raw-number':
      return v;

    case 'number-convert': {
      const factor = Number(def.params?.factor ?? 1);
      return Math.round(v * factor);
    }

    case 'range-convert': {
      const table = Array.isArray(def.params?.table) ? def.params.table : [];
      for (const row of table) {
        const okMin = (row.min == null) || (v >= row.min);
        const okMax = (row.max == null) || (v <= row.max);
        if (okMin && okMax) return Number(row.score ?? 0);
      }
      return 0;
    }

    default:
      return v;
  }
}

export function aggregate(values = [], aggregator = 'sum') {
  const arr = values.map(Number).filter(n => Number.isFinite(n));
  if (!arr.length) return 0;
  switch (aggregator) {
    case 'avg':   return Math.round(arr.reduce((a,b)=>a+b,0) / arr.length);
    case 'best':  return Math.min(...arr);   // 낮은 값이 좋다 가정
    case 'count': return arr.length;
    case 'sum':
    default:      return arr.reduce((a,b)=>a+b,0);
  }
}
