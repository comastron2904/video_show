// 구글 드라이브 링크 → 사이트 내 재생용 주소 자동 변환
//
// 지원하는 입력 예시
//   https://drive.google.com/file/d/FILE_ID/view?usp=sharing
//   https://drive.google.com/file/d/FILE_ID/preview
//   https://drive.google.com/open?id=FILE_ID
//   https://drive.google.com/uc?id=FILE_ID&export=download
//   https://docs.google.com/file/d/FILE_ID/edit
//   FILE_ID (ID만 붙여넣은 경우)

const ID_PATTERN = /^[A-Za-z0-9_-]{20,}$/;

export function extractDriveId(input) {
  if (!input) return null;
  const raw = String(input).trim();

  if (ID_PATTERN.test(raw)) return raw;

  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (!/(^|\.)google\.com$/.test(url.hostname)) return null;

  const pathMatch = url.pathname.match(/\/(?:file\/)?d\/([A-Za-z0-9_-]{20,})/);
  if (pathMatch) return pathMatch[1];

  const qId = url.searchParams.get('id');
  if (qId && ID_PATTERN.test(qId)) return qId;

  return null;
}

export function drivePreviewUrl(fileId) {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`;
}

export function driveViewUrl(fileId) {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
}
