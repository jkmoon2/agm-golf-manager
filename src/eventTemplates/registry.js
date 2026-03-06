// /src/eventTemplates/registry.js
// 템플릿 레지스트리(등록만) - EventManager는 여기서 목록/기본값/표시옵션을 가져옵니다.
// ✅ 새로운 템플릿 추가 시: 이 파일에 1개 항목 추가만 하면 됩니다. (EventManager 코드 증식 방지)

export const TEMPLATE_REGISTRY = [
  {
    type: 'raw-number',
    label: '숫자 입력(그대로 점수)',
    defaultParams: { aggregator: 'sum' },
    help: '* 입력 숫자를 그대로 점수로 사용합니다.',
    ui: {
      inputMode: true,
      paramsJson: true,
      factor: false,
      rangeTable: false,
      bonusTable: false,
      supportsEventInputs: true,
      supportsQuickInput: true,
    },
  },
  {
    type: 'range-convert',
    label: '숫자 범위→점수(테이블)',
    defaultParams: {
      aggregator: 'sum',
      table: [
        { min: 0, max: 0.5, score: 3 },
        { min: 0.51, max: 1, score: 2 },
        { min: 1.1, max: 1.5, score: 1 },
      ],
    },
    help: '* 구간별 점수표로 환산합니다. (범위 편집기에서 구간/점을 관리)',
    ui: {
      inputMode: true,
      paramsJson: true,
      factor: false,
      rangeTable: true,
      bonusTable: false,
      supportsEventInputs: true,
      supportsQuickInput: true,
    },
  },
  {
    type: 'range-convert-bonus',
    label: '숫자 범위→점수(테이블)+보너스',
    defaultParams: {
      aggregator: 'sum',
      table: [
        { min: 0, max: 0.5, score: 3 },
        { min: 0.51, max: 1, score: 2 },
        { min: 1.1, max: 1.5, score: 1 },
      ],
      bonus: [
        { label: '파', score: 1 },
        { label: '버디', score: 2 },
      ],
    },
    help: '* 구간별 점수표 환산 + 보너스 점수를 추가로 더합니다.',
    ui: {
      inputMode: true,
      paramsJson: true,
      factor: false,
      rangeTable: true,
      bonusTable: true,
      supportsEventInputs: true,
      supportsQuickInput: true,
    },
  },
  {
    type: 'number-convert',
    label: '숫자 × 계수(환산)',
    defaultParams: { aggregator: 'sum', factor: 1 },
    help: '* 입력값에 계수(factor)를 곱해 환산합니다.',
    ui: {
      inputMode: true,
      paramsJson: true,
      factor: true,
      rangeTable: false,
      bonusTable: false,
      supportsEventInputs: true,
      supportsQuickInput: true,
    },
  },
  {
    type: 'group-battle',
    label: '그룹/개인 대결',
    defaultParams: {},
    help: '* 그룹/개인 대결은 별도 입력이 없습니다. 운영자가 선택한 점수/결과 기준으로 순위를 계산합니다. (반땅룰 미적용)',
    ui: {
      inputMode: false,
      paramsJson: false,
      factor: false,
      rangeTable: false,
      bonusTable: false,
      supportsEventInputs: false,
      supportsQuickInput: false, // (대신) G핸디 수정 메뉴 사용
    },
  },
];

export function getTemplateByType(type) {
  return TEMPLATE_REGISTRY.find(t => t.type === type) || TEMPLATE_REGISTRY[0];
}

export function getTemplateHelp(type) {
  return (getTemplateByType(type)?.help) || '';
}

export function templateUi(type) {
  return (getTemplateByType(type)?.ui) || {};
}
