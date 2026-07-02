// /src/utils/adminAuth.js
// Firestore Rules의 isAdmin() 기준과 앱 내부 관리자 판정을 한 곳으로 통일합니다.
// 현재 Firestore Rules 기준: request.auth.token.email == 'a@a.com'

export const ADMIN_EMAIL = 'a@a.com';
export const ADMIN_EMAILS = [ADMIN_EMAIL];

export function normalizeEmail(email = '') {
  return String(email || '').trim().toLowerCase();
}

export function isAdminEmail(email) {
  const normalized = normalizeEmail(email);
  return ADMIN_EMAILS.includes(normalized);
}

export function isRulesAdminUser(user) {
  return !!user && isAdminEmail(user.email || user?.providerData?.[0]?.email || '');
}
