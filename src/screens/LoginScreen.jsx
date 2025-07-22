// src/screens/LoginScreen.jsx

import React, { useState } from 'react';
import { useAuth }          from '../contexts/AuthContext';
import { useNavigate }      from 'react-router-dom';
import styles               from './LoginScreen.module.css';

export default function LoginScreen() {
  const [role, setRole]         = useState('admin');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode]         = useState('');
  const [error, setError]       = useState('');
  const { loginAdmin, loginPlayer } = useAuth();
  const navigate                = useNavigate();

  // .env.local 에서 불러오는 관리자 정보
  const ADMIN_EMAIL    = process.env.REACT_APP_ADMIN_EMAIL;
  const ADMIN_PASSWORD = process.env.REACT_APP_ADMIN_PASSWORD;

  const validAdmin  = email.trim() === ADMIN_EMAIL && password === ADMIN_PASSWORD;
  const validPlayer = code.trim().length > 0;

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');

    if (role === 'admin') {
      // 운영자 인증
      if (!validAdmin) {
        setError('이메일 또는 비밀번호가 올바르지 않습니다.');
        return;
      }
      try {
        // AuthContext 내부에서 Firebase 로그인 처리
        await loginAdmin(ADMIN_EMAIL, ADMIN_PASSWORD);
        // 로그인 후 관리자 홈(10버튼)으로 이동
        navigate('/admin', { replace: true });
      } catch (err) {
        setError('관리자 인증 실패: ' + err.message);
      }
    } else {
      // 참가자 인증
      if (!validPlayer) {
        setError('인증 코드를 입력하세요.');
        return;
      }
      try {
        await loginPlayer(code.trim());
        navigate('/player/home', { replace: true });
      } catch (err) {
        setError('참가자 인증 실패: ' + err.message);
      }
    }
  };

  return (
    <div className={styles.fullscreen}>
      <div className={styles.card}>
        <h2 className={styles.title}>로그인</h2>

        {/* 역할 선택 탭 */}
        <div className={styles.tabContainer}>
          <button
            type="button"
            className={role === 'admin' ? styles.tabActive : styles.tab}
            onClick={() => { setRole('admin'); setError(''); }}
          >
            운영자
          </button>
          <button
            type="button"
            className={role === 'player' ? styles.tabActive : styles.tab}
            onClick={() => { setRole('player'); setError(''); }}
          >
            참가자
          </button>
        </div>

        {/* 입력 폼 */}
        <form onSubmit={handleSubmit} className={styles.form}>
          {role === 'admin' ? (
            <>
              <input
                type="email"
                placeholder="이메일"
                className={styles.input}
                value={email}
                onChange={e => setEmail(e.target.value)}
                onInput={e => setEmail(e.target.value)}
                required
              />
              <input
                type="password"
                placeholder="비밀번호"
                className={styles.input}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onInput={e => setPassword(e.target.value)}
                required
              />
            </>
          ) : (
            <input
              type="text"
              placeholder="인증 코드"
              className={styles.input}
              value={code}
              onChange={e => setCode(e.target.value)}
              onInput={e => setCode(e.target.value)}
              required
            />
          )}

          {error && <div className={styles.error}>{error}</div>}

          {/* 디버깅용 출력 */}
          <div style={{ fontSize:12, color:'#999', marginBottom:8 }}>
            email: “{email}”<br/>
            ADMIN_EMAIL: “{ADMIN_EMAIL}”<br/>
            validAdmin: {String(validAdmin)}
          </div>

          <button
            type="submit"
            className={styles.submit}
            disabled={role === 'admin' ? !validAdmin : !validPlayer}
          >
            {role === 'admin' ? '로그인' : '입장'}
          </button>
        </form>
      </div>
    </div>
);
}
