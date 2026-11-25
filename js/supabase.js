// Supabase 클라이언트 준비
// /api/config 가 window.__SUPABASE__ 에 접속 정보를 넣어 줍니다.
// 정보가 없으면(로컬 미리보기 등) null 을 돌려주고, 사이트는 데모 데이터로 동작합니다.

let clientPromise = null;

export function getSupabase() {
  if (clientPromise) return clientPromise;
  clientPromise = (async () => {
    const cfg = window.__SUPABASE__ || {};
    if (!cfg.url || !cfg.anonKey) return null;
    try {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      return createClient(cfg.url, cfg.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
      });
    } catch (err) {
      console.error('[premiere] Supabase 라이브러리를 불러오지 못했습니다.', err);
      return null;
    }
  })();
  return clientPromise;
}

export const DEMO_SETTINGS = {
  event_title: 'ONLINE PREMIERE',
  event_subtitle: '데모 모드 · Supabase 연결 전 미리보기입니다',
};

export const DEMO_FILMS = [
  { id: 'd1', title: '첫 번째 이야기', director: '김감독', runtime: '12분', description: '데모용 작품입니다. 관리자 화면에서 실제 작품을 등록하세요.', file_id: 'DEMO', poster_color: '#c0392b' },
  { id: 'd2', title: '밤의 정류장', director: '이감독', runtime: '18분', description: '막차를 기다리는 두 사람의 대화.', file_id: 'DEMO', poster_color: '#2e5c8a' },
  { id: 'd3', title: '여름, 바다', director: '박감독', runtime: '9분', description: '어느 여름날의 기록.', file_id: 'DEMO', poster_color: '#16a085' },
  { id: 'd4', title: '회색 도시', director: '최감독', runtime: '21분', description: '도시의 소음 속 고요를 찾는 이야기.', file_id: 'DEMO', poster_color: '#7d5ba6' },
  { id: 'd5', title: '편지', director: '정감독', runtime: '15분', description: '부치지 못한 편지 한 통.', file_id: 'DEMO', poster_color: '#d68910' },
];
