// **src/screens/LoginScreen.jsx**

import React, { useState } from 'react';
import styles from './LoginScreen.module.css';
import { useNavigate } from 'react-router-dom';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleSubmit = e => {
    e.preventDefault();
    // TODO: 실제 인증 로직 → token 설정
    localStorage.setItem('token', 'dummy-token');
    navigate('/');
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.cardInner}>
          <h2 className={styles.title}>로그인</h2>
          <form onSubmit={handleSubmit}>
            <label className={styles.label}>이메일</label>
            <input
              type="email"
              className={styles.input}
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />

            <label className={styles.label}>비밀번호</label>
            <input
              type="password"
              className={styles.input}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />

            <button type="submit" className={styles.button}>
              로그인
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}