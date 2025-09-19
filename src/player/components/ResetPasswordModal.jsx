// /src/player/components/ResetPasswordModal.jsx
//
// 기존 코드 100% 유지 + 안내문 노출 타이밍만 수정
// - (변경점) 하단 고정 힌트 텍스트를 제거해서, '메일 보내기' 실행 후 부모에서 alert로만 알림이 뜨도록 함.

import React, { useState, useEffect } from 'react';
import './modal.css';

export default function ResetPasswordModal({ defaultEmail='', onClose, onComplete }) {
  const [email, setEmail] = useState(defaultEmail);
  const [name, setName]   = useState('');

  useEffect(() => { if (!defaultEmail) return; setEmail(defaultEmail); }, [defaultEmail]);

  const submit = async () => {
    if (!email.trim()) { alert('이메일을 입력해 주세요.'); return; }
    // 이름은 선택값(기록용) — 검증은 서버 로직 확장 시 연동 가능
    await onComplete?.({ email: email.trim(), name: name.trim() });
    onClose?.();
  };

  return (
    <div className="modal__backdrop" onClick={onClose}>
      <div className="modal__card" onClick={(e)=>e.stopPropagation()}>
        <h3 className="modal__title">비밀번호 재설정</h3>
        <div className="modal__form">
          <input
            className="modal__input"
            placeholder="이메일"
            value={email}
            onChange={(e)=>setEmail(e.target.value)}
          />
          <input
            className="modal__input"
            placeholder="이름"
            value={name}
            onChange={(e)=>setName(e.target.value)}
          />
        </div>
        <div className="modal__actions">
          <button className="modal__ghost" onClick={onClose}>닫기</button>
          <button className="modal__primary" onClick={submit}>메일 보내기</button>
        </div>
        {/* (삭제됨) 안내 힌트는 고정으로 보여주지 않습니다. */}
      </div>
    </div>
  );
}
