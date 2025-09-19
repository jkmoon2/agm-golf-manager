// /src/player/components/ResetPasswordModal.jsx
// 기존 코드 100% 유지 + inputs/buttons에 .selectable 클래스만 추가

import React, { useState, useEffect } from 'react';
import './modal.css';

export default function ResetPasswordModal({ defaultEmail='', onClose, onComplete }) {
  const [email, setEmail] = useState(defaultEmail);
  const [name, setName]   = useState('');

  useEffect(() => { if (!defaultEmail) return; setEmail(defaultEmail); }, [defaultEmail]);

  const submit = async () => {
    if (!email.trim()) { alert('이메일을 입력해 주세요.'); return; }
    await onComplete?.({ email: email.trim(), name: name.trim() });
    onClose?.();
  };

  return (
    <div className="modal__backdrop" onClick={onClose}>
      <div className="modal__card" onClick={(e)=>e.stopPropagation()}>
        <h3 className="modal__title">비밀번호 재설정</h3>
        <div className="modal__form">
          <input
            className="modal__input selectable"
            placeholder="이메일"
            value={email}
            onChange={(e)=>setEmail(e.target.value)}
          />
          <input
            className="modal__input selectable"
            placeholder="이름"
            value={name}
            onChange={(e)=>setName(e.target.value)}
          />
        </div>
        <div className="modal__actions">
          <button className="modal__ghost selectable" onClick={onClose}>닫기</button>
          <button className="modal__primary selectable" onClick={submit}>메일 보내기</button>
        </div>
      </div>
    </div>
  );
}
