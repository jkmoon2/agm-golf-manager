// /src/screens/LoginScreen.jsx
// 변경 요약(기존 코드 100% 유지 + 최소 보완):
// 1) ?role=admin|player, ?redirect=/some/path 쿼리 파라미터 읽기
// 2) 로그인 성공 시 redirect가 있으면 그쪽으로 이동
// 3) 참가자 로그인 완료 후에는 '/player/events'로 보내 참가자 첫 화면을 일관화

import React, { useState, useEffect } from 'react';
import { useAuth }          from '../contexts/AuthContext';
import { useNavigate, useLocation }      from 'react-router-dom';
import styles               from './LoginScreen.module.css';

export default function LoginScreen() {
  const [role, setRole]         = useState('admin');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode]         = useState('');
  const [error, setError]       = useState('');
  const { loginAdmin, loginPlayer } = useAuth();
  const navigate                = useNavigate();
  const { search }              = useLocation();

  // .env.local
  const ADMIN_EMAIL    = process.env.REACT_APP_ADMIN_EMAIL;
  const ADMIN_PASSWORD = process.env.REACT_APP_ADMIN_PASSWORD;

  const validAdmin  = email.trim() === ADMIN_EMAIL && password === ADMIN_PASSWORD;
  const validPlayer = code.trim().length > 0;

  // ✅ 쿼리 파라미터로 기본 탭/리다이렉트 제어
  const params    = React.useMemo(() => new URLSearchParams(search), [search]);
  const qRole     = (params.get('role') || '').toLowerCase();       // 'admin' | 'player'
  const redirect  = params.get('redirect') || '';

  useEffect(() => {
    if (qRole === 'player') setRole('player');
    else if (qRole === 'admin') setRole('admin');
  }, [qRole]);

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');

    if (role === 'admin') {
      if (!validAdmin) { setError('이메일 또는 비밀번호가 올바르지 않습니다.'); return; }
      try {
        await loginAdmin(ADMIN_EMAIL, ADMIN_PASSWORD);
        navigate(redirect || '/admin', { replace: true }); // ✅ redirect 우선
      } catch (err) {
        setError('관리자 인증 실패: ' + err.message);
      }
    } else {
      if (!validPlayer) { setError('인증 코드를 입력하세요.'); return; }
      try {
        await loginPlayer(code.trim());
        // 참가자 성공 시: 참가자 홈(대회 리스트)로 통일
        navigate('/player/events', { replace: true });      // ✅ 포인트
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
