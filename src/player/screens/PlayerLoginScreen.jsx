// src/player/screens/PlayerLoginScreen.jsx

import React, { useState, useContext } from 'react'
import { getAuth, signInAnonymously } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { PlayerContext } from '../../contexts/PlayerContext'
import { useNavigate, useParams } from 'react-router-dom'
import styles from './PlayerLoginScreen.module.css'

export default function PlayerLoginScreen() {
  const [inputCode, setInputCode] = useState('')
  const { setEventId, setAuthCode, setParticipant } = useContext(PlayerContext)
  const nav = useNavigate()
  const { eventId: routeEventId } = useParams()

  const handleSubmit = async e => {
    e.preventDefault()
    const auth = getAuth()
    if (!auth.currentUser) {
      try {
        await signInAnonymously(auth)
      } catch (err) {
        alert('익명 로그인 실패: ' + err.message)
        return
      }
    }
    const snap = await getDoc(doc(db, 'events', routeEventId))
    if (!snap.exists()) {
      alert('존재하지 않는 대회 ID입니다.')
      return
    }
    const data = snap.data()
    const part = data.participants?.find(p => p.authCode === inputCode.trim())
    if (!part) {
      alert('인증 코드가 일치하지 않습니다.')
      return
    }
    setEventId(routeEventId)
    setAuthCode(inputCode.trim())
    setParticipant(part)
    nav('home', { replace: true })
  }

  return (
    <div className={styles.container}>
      <div className={styles.cardWrapper}>
        <h2 className={styles.heading}>참가자</h2>
        <form onSubmit={handleSubmit} className={styles.form}>
          <input
            type="text"
            className={styles.input}
            placeholder="인증 코드를 입력하세요"
            value={inputCode}
            onChange={e => setInputCode(e.target.value)}
            required
          />
          <button type="submit" className={styles.button}>
            입장하기
          </button>
        </form>
      </div>
    </div>
  )
}
