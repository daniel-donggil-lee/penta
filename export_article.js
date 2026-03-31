/**
 * 생각의숲 웹 아티클 → 네이버 블로그 키트 자동 생성
 *
 * 사용법:
 *   node export_article.js <html파일> [출력폴더]
 *
 * 예시:
 *   node export_article.js article-handwriting-brain.html
 *
 * 출력: output/<slug>/naver_kit/
 *   ├── images/  01_hero.png ~ 07_cta.png  (966px 기준 스크린샷)
 *   ├── naver_text.txt  (섹션별 복붙용 텍스트)
 *   └── guide.txt       (네이버 업로드 5단계 안내)
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

// 아티클 섹션 정의 (id → 파일명)
const SECTIONS = [
  { id: 's0', name: '01_hero',    label: '히어로 (제목 이미지)' },
  { id: 's1', name: '02_summary', label: '핵심 요약 박스' },
  { id: 's2', name: '03_hook',    label: '공감 훅' },
  { id: 's3', name: '04_data',    label: '연구 데이터' },
  { id: 's4', name: '05_meaning', label: '우리 아이에게' },
  { id: 's5', name: '06_tips',    label: '실천 팁' },
  { id: 's6', name: '07_cta',     label: 'CTA / 생각의숲' },
];

async function exportArticle(htmlFile, outputBase) {
  const htmlAbsPath = path.resolve(htmlFile);
  if (!fs.existsSync(htmlAbsPath)) {
    console.error(`❌ 파일 없음: ${htmlAbsPath}`);
    process.exit(1);
  }

  const kitDir   = path.join(outputBase, 'naver_kit');
  const imagesDir = path.join(kitDir, 'images');
  fs.mkdirSync(imagesDir, { recursive: true });

  console.log(`\n🚀 브라우저 실행 중...`);
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--allow-file-access-from-files',
    ],
  });

  const page = await browser.newPage();

  // 966px = 네이버 스마트에디터 전체 너비 기준
  await page.setViewport({ width: 966, height: 900, deviceScaleFactor: 2 });

  console.log(`📄 HTML 로딩: ${path.basename(htmlAbsPath)}`);
  await page.goto(`file://${htmlAbsPath}`, {
    waitUntil: 'networkidle0',
    timeout: 40000,
  });

  // 폰트·이미지 렌더링 안정화 대기
  await new Promise(r => setTimeout(r, 2500));

  // 고정 내비게이션 숨기기 (스크린샷 시 방해 방지)
  await page.evaluate(() => {
    const nav = document.querySelector('.site-nav');
    if (nav) nav.style.display = 'none';
    // margin-top 제거 (nav 공간)
    const hero = document.querySelector('#s0');
    if (hero) hero.style.marginTop = '0';
  });

  console.log(`\n📸 섹션 스크린샷 시작...\n`);
  let saved = 0;

  for (const sec of SECTIONS) {
    const el = await page.$(`#${sec.id}`);
    if (!el) {
      console.warn(`  ⚠️  #${sec.id} 없음 — 스킵`);
      continue;
    }

    const filepath = path.join(imagesDir, `${sec.name}.png`);
    await el.screenshot({ path: filepath, omitBackground: false });
    saved++;
    console.log(`  ✅ ${sec.label}  →  ${sec.name}.png`);
  }

  await browser.close();

  // ── naver_text.txt 생성 ──────────────────────────────
  const slug   = path.basename(htmlAbsPath, '.html');
  const title  = await extractTitle(htmlAbsPath);
  const navText = buildNaverText(title, SECTIONS);
  fs.writeFileSync(path.join(kitDir, 'naver_text.txt'), navText, 'utf8');
  console.log(`\n  📝 naver_text.txt 생성 완료`);

  // ── guide.txt 생성 ────────────────────────────────────
  const guide = buildGuide(slug, SECTIONS);
  fs.writeFileSync(path.join(kitDir, 'guide.txt'), guide, 'utf8');
  console.log(`  📋 guide.txt 생성 완료`);

  console.log(`\n✨ 완료! → ${path.resolve(kitDir)}\n`);
}

// HTML 파일에서 og:title 또는 <title> 추출
function extractTitle(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const ogMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
  if (ogMatch) return ogMatch[1];
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  if (titleMatch) return titleMatch[1].split('—')[0].trim();
  return '생각의숲 아티클';
}

// 네이버용 텍스트 템플릿 생성
function buildNaverText(title, sections) {
  const divider = '━'.repeat(32);
  const lines = [];

  lines.push(`[제목]`);
  lines.push(title);
  lines.push('');
  lines.push(divider);
  lines.push('');
  lines.push(`※ 아래 순서대로 텍스트를 붙여넣고, 각 [이미지] 위치에 해당 번호 이미지를 삽입하세요.`);
  lines.push('');
  lines.push(divider);
  lines.push('');

  for (const sec of sections) {
    lines.push(`[이미지 ${sec.name}.png 삽입]`);
    lines.push('');
    lines.push(`[${sec.label}]`);
    lines.push('(이 섹션의 텍스트는 이미지로 대체되었습니다)');
    lines.push('');
    lines.push(divider);
    lines.push('');
  }

  lines.push('');
  lines.push('#생각의숲 #초등글쓰기 #문해력 #손글씨 #뇌과학 #초등교육 #사고력');
  lines.push('');
  lines.push('생각의숲 | 읽고, 쓰고, 생각하는 문해력 전문 교육센터');
  lines.push('오픈 소식 사전 신청 → [링크]');

  return lines.join('\n');
}

// 업로드 가이드 생성
function buildGuide(slug, sections) {
  const lines = [];
  lines.push('═'.repeat(40));
  lines.push(' 네이버 블로그 업로드 가이드');
  lines.push(' 생각의숲 — ' + slug);
  lines.push('═'.repeat(40));
  lines.push('');
  lines.push('[ 준비물 ]');
  lines.push('  - images/ 폴더의 PNG 파일 7장');
  lines.push('  - naver_text.txt');
  lines.push('');
  lines.push('[ 업로드 순서 ]');
  lines.push('');
  lines.push('  Step 1. 네이버 블로그 → 글쓰기 클릭');
  lines.push('');
  lines.push('  Step 2. 제목 입력');
  lines.push('           naver_text.txt 상단 [제목] 참고');
  lines.push('');
  lines.push('  Step 3. 이미지 순서대로 삽입 (사진 추가 버튼)');
  lines.push('');

  sections.forEach((sec, i) => {
    lines.push(`           ${i + 1}. ${sec.name}.png  ← ${sec.label}`);
  });

  lines.push('');
  lines.push('  Step 4. 각 이미지 아래 naver_text.txt의');
  lines.push('           해당 섹션 내용 붙여넣기');
  lines.push('           (이미지만으로도 충분하므로 간략하게 OK)');
  lines.push('');
  lines.push('  Step 5. 마지막에 해시태그 추가 후 발행');
  lines.push('           naver_text.txt 맨 아래 해시태그 복붙');
  lines.push('');
  lines.push('[ 예상 소요 시간: 10~15분 ]');
  lines.push('');
  lines.push('━'.repeat(40));

  return lines.join('\n');
}

// ── CLI 실행 ──────────────────────────────────────────
const [, , htmlArg, outArg] = process.argv;

if (!htmlArg) {
  console.log('사용법: node export_article.js <html파일> [출력폴더]');
  process.exit(0);
}

const defaultOut = path.join(
  path.dirname(path.resolve(htmlArg)),
  'output',
  path.basename(htmlArg, '.html')
);

exportArticle(htmlArg, outArg || defaultOut).catch(err => {
  console.error('❌ 오류:', err.message);
  process.exit(1);
});
