// Vercel 서버리스 함수: 환경변수에 넣은 Supabase 접속 정보를 브라우저에 전달합니다.
// anon key 는 공개용 키라 노출돼도 괜찮고, 실제 권한은 Supabase RLS 정책이 막습니다.
// (service_role 키는 절대 여기에 넣지 마세요.)
module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  const config = {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
  };
  res.status(200).send(`window.__SUPABASE__ = ${JSON.stringify(config)};`);
};
