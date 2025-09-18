// /src/player/components/SignupModal.jsx

import React, { useState, useEffect } from 'react';
import './modal.css';

export default function SignupModal({ defaultEmail='', onClose, onComplete }) {
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  useEffect(()=>{ if(!defaultEmail) return; setEmail(defaultEmail); },[defaultEmail]);

  const submit = async () => {
    if(!email.trim() || !password.trim() || !name.trim()){
      alert('이메일/비밀번호/이름을 모두 입력해 주세요.'); return;
    }
    await onComplete?.({email:email.trim(), password, name:name.trim()});
    onClose?.();
  };

  return (
    <div className="modal__backdrop" onClick={onClose}>
      <div className="modal__card" onClick={(e)=>e.stopPropagation()}>
        <h3 className="modal__title">회원가입</h3>
        <div className="modal__form">
          <input className="modal__input" placeholder="이메일" value={email} onChange={e=>setEmail(e.target.value)} />
          <input className="modal__input" placeholder="비밀번호" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
          <input className="modal__input" placeholder="이름" value={name} onChange={e=>setName(e.target.value)} />
        </div>
        <div className="modal__actions">
          <button className="modal__ghost" onClick={onClose}>취소</button>
          <button className="modal__primary" onClick={submit}>가입 완료</button>
        </div>
      </div>
    </div>
  );
}
