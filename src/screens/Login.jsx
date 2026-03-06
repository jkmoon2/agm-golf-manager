// src/screens/Login.jsx

import React, { useState } from 'react';
import { useAuth }    from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import styles from './Login.module.css';  // ← 이 CSS 모듈을 사용하세요

export default function Login() {
  const [code, setCode] = useState('');
  const { login } = useAuth();
  const nav = useNavigate();
  const valid = code.trim().length > 0;

  const submit = e => {
    e.preventDefault();
    if (!valid) return;
    login(code);
    nav('/admin/home', { replace: true });
  };

  return (
    <div className={styles.container}>
      <form className={styles.card} onSubmit={submit}>
        <h2 className={styles.title}>로그인</h2>
        <input
          className={styles.input}
          placeholder="인증 코드"
          value={code}
          onChange={e => setCode(e.target.value)}
        />
        <button
          type="submit"
          disabled={!valid}
          className={`${styles.button} ${
            valid ? styles.buttonActive : styles.buttonDisabled
          }`}
        >
          로그인
        </button>
      </form>
    </div>
  );
}
