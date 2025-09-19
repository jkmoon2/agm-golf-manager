// /src/player/components/ResetPasswordModal.jsx

import React, { useState, useEffect } from 'react';
import './modal.css';

export default function ResetPasswordModal({ defaultEmail='', onClose, onComplete }) {
  const [email, setEmail] = useState(defaultEmail);
  const [name, setName]   = useState('');

  useEffect(()=>{ if(!defaultEmail) return; setEmail(defaultEmail); },[defaultEmail]);

  const submit = async () => {
    if(!email.trim()){ alert('이메일을 입력해 주세요.'); return; }
    // 이름은 기록/확인용(선택) — 현재는 UI 표기만, 필요하면 서버 검증으로 확장
    await onComplete?.({email:email.trim(), name:name.trim()});
    onClose?.();
  };

  return (
    <div className="modal__backdrop" onClick={onClose}>
      <div className="modal__card" onClick={(e)=>e.stopPropagation()}>
        <h3 className="modal__title">비밀번호 재설정</h3>
        <div className="modal__form">
          <input className="modal__input" placeholder="이메일" value={email} onChange={e=>setEmail(e.target.value)} />
          <input className="modal__input" placeholder="이름" value={name} onChange={e=>setName(e.target.value)} />
        </div>
        <div className="modal__actions">
          <button className="modal__ghost" onClick={onClose}>닫기</button>
          <button className="modal__primary" onClick={submit}>메일 보내기</button>
        </div>
        <div className="modal__hint">입력한 이메일로 비밀번호 재설정 메일을 보냈습니다.</div>
      </div>
    </div>
  );
}
