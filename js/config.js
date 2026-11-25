// =========================================================
// Supabase 접속 정보 — 여기만 수정하세요
// =========================================================
// Supabase 대시보드 > Project Settings > API Keys 에서 복사합니다.
//
//  url     : Project URL (https://xxxx.supabase.co)
//  anonKey : Publishable key (sb_publishable_...)  또는
//            Legacy API Keys 탭의 anon public 키 (eyJ... 로 시작)
//
// ⚠️ 이 키는 누구나 볼 수 있는 공개용 키라 코드에 넣어도 괜찮습니다.
//    (실제 권한은 Supabase 보안 정책(RLS)이 막습니다)
// ⚠️ secret 키(sb_secret_...) 나 service_role 키는 절대 넣지 마세요.
//    브라우저에서는 동작하지도 않고(401 오류), 노출되면 위험합니다.

window.__SUPABASE__ = {
  url: 'https://oztnwiksjbywfibeupwq.supabase.co',
  anonKey: 'YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY',
};
