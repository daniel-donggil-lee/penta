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
 *   ├── images/
 *   │   ├── 01_hero.png      (히어로 전체)
 *   │   ├── 02_data.png      (데이터 하이라이트 박스)
 *   │   ├── 03_tips.png      (실천 팁 카드)
 *   │   └── 04_cta.png       (CTA / 브랜드)
 *   ├── naver_text.txt       (텍스트 전문 + 이미지 삽입 위치 표시)
 *   └── guide.txt            (업로드 5단계 안내)
 *
 * 구조 원칙:
 *   - 이미지: 4장 (시각 강조용 / 히어로·데이터·팁·CTA)
 *   - 텍스트: 3,000자+ 실제 본문 → 검색 키워드 인덱싱
 *   - 이미지 사이에 텍스트를 배치해 SEO + 가독성 동시 확보
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

// 스크린샷 대상 — 4장만
const SCREENSHOTS = [
  { selector: '#s0',          name: '01_hero',  label: '히어로 (제목 이미지)' },
  { selector: '#s3 .data-box',name: '02_data',  label: '데이터 하이라이트' },
  { selector: '#s5',          name: '03_tips',  label: '실천 팁 카드' },
  { selector: '#s6',          name: '04_cta',   label: 'CTA / 생각의숲' },
];

async function exportArticle(htmlFile, outputBase) {
  const htmlAbsPath = path.resolve(htmlFile);
  if (!fs.existsSync(htmlAbsPath)) {
    console.error(`❌ 파일 없음: ${htmlAbsPath}`);
    process.exit(1);
  }

  const kitDir    = path.join(outputBase, 'naver_kit');
  const imagesDir = path.join(kitDir, 'images');
  fs.mkdirSync(imagesDir, { recursive: true });

  console.log(`\n🚀 브라우저 실행 중...`);
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox',
      '--disable-web-security', '--allow-file-access-from-files',
    ],
  });

  const page = await browser.newPage();
  // 966px = 네이버 스마트에디터 전체 너비
  await page.setViewport({ width: 966, height: 900, deviceScaleFactor: 2 });

  console.log(`📄 HTML 로딩: ${path.basename(htmlAbsPath)}`);
  await page.goto(`file://${htmlAbsPath}`, { waitUntil: 'networkidle0', timeout: 40000 });
  await new Promise(r => setTimeout(r, 2500));

  // 고정 내비 숨기기
  await page.evaluate(() => {
    const nav = document.querySelector('.site-nav');
    if (nav) nav.style.display = 'none';
    const hero = document.querySelector('#s0');
    if (hero) hero.style.marginTop = '0';
  });

  // ── 텍스트 추출 (SEO용 본문) ─────────────────────────
  console.log(`\n📝 텍스트 추출 중...`);
  const text = await page.evaluate(() => {
    const t = s => (document.querySelector(s) || {}).innerText?.trim() || '';
    const all = (s) => Array.from(document.querySelectorAll(s)).map(el => el.innerText.trim()).filter(Boolean);

    return {
      title:       t('.hero-title'),
      heroSub:     t('.hero-sub'),
      tags:        all('.hero-tag'),
      summaryItems: all('.summary-list li'),
      s2h2:        t('#s2 h2'),
      s2body:      all('#s2 p').join('\n\n'),
      s3h2:        t('#s3 h2'),
      s3intro:     t('#s3 > p:first-of-type'),
      dataNum:     t('#s3 .data-num'),
      dataLabel:   t('#s3 .data-label'),
      dataSource:  t('#s3 .data-source'),
      s3body:      all('#s3 > p').join('\n\n'),
      quote:       t('#s3 blockquote p'),
      quoteSource: t('#s3 blockquote cite'),
      s4h2:        t('#s4 h2'),
      s4body:      all('#s4 p').join('\n\n'),
      s5h2:        t('#s5 h2'),
      s5intro:     t('#s5 > p'),
      tips: Array.from(document.querySelectorAll('.tip-list li')).map(li => ({
        num:   (li.querySelector('.tip-num') || {}).innerText?.trim() || '',
        title: (li.querySelector('.tip-content strong') || {}).innerText?.trim() || '',
        body:  (li.querySelector('.tip-content span') || {}).innerText?.trim() || '',
      })),
      ctaBrand: t('.cta-brand'),
      ctaSub:   t('.cta-sub'),
      ctaTags:  t('.cta-tags'),
    };
  });

  // ── 스크린샷 4장 ─────────────────────────────────────
  console.log(`\n📸 이미지 생성 중 (4장)...`);
  let saved = 0;

  for (const sc of SCREENSHOTS) {
    const el = await page.$(sc.selector);
    if (!el) { console.warn(`  ⚠️  ${sc.selector} 없음 — 스킵`); continue; }
    const filepath = path.join(imagesDir, `${sc.name}.png`);
    await el.screenshot({ path: filepath, omitBackground: false });
    saved++;
    console.log(`  ✅ ${sc.label}  →  ${sc.name}.png`);
  }

  await browser.close();

  // ── naver_text.txt ────────────────────────────────────
  const naverText = buildNaverText(text);
  fs.writeFileSync(path.join(kitDir, 'naver_text.txt'), naverText, 'utf8');
  console.log(`\n  📝 naver_text.txt 생성 완료 (${naverText.length}자)`);

  // ── guide.txt ─────────────────────────────────────────
  const guide = buildGuide(path.basename(htmlAbsPath, '.html'));
  fs.writeFileSync(path.join(kitDir, 'guide.txt'), guide, 'utf8');
  console.log(`  📋 guide.txt 생성 완료`);

  console.log(`\n✨ 완료! → ${path.resolve(kitDir)}\n`);
}

// ── 네이버 텍스트 빌더 ───────────────────────────────────
function buildNaverText(t) {
  const D = '━'.repeat(36);
  const lines = [];

  // 제목
  lines.push(`[제목]`);
  lines.push(t.title);
  if (t.heroSub) lines.push(t.heroSub);
  lines.push('');

  // 히어로 이미지
  lines.push(D);
  lines.push(`▶ 이미지 삽입: 01_hero.png`);
  lines.push(D);
  lines.push('');

  // 핵심 요약
  lines.push(`■ 이 글의 핵심 3가지`);
  lines.push('');
  t.summaryItems.forEach(item => lines.push(`• ${item}`));
  lines.push('');

  // S2 공감 훅
  lines.push(`■ ${t.s2h2}`);
  lines.push('');
  lines.push(t.s2body);
  lines.push('');

  // 데이터 이미지
  lines.push(D);
  lines.push(`▶ 이미지 삽입: 02_data.png`);
  lines.push(D);
  lines.push('');

  // S3 연구
  lines.push(`■ ${t.s3h2}`);
  lines.push('');
  lines.push(t.s3body);
  lines.push('');

  // 인용구
  if (t.quote) {
    lines.push(`"${t.quote}"`);
    if (t.quoteSource) lines.push(`  ${t.quoteSource}`);
    lines.push('');
  }

  // 데이터 수치 텍스트
  if (t.dataNum) {
    lines.push(`[ 연구 데이터 ]`);
    lines.push(`${t.dataNum} — ${t.dataLabel}`);
    lines.push(t.dataSource);
    lines.push('');
  }

  // S4 우리 아이에게
  lines.push(`■ ${t.s4h2}`);
  lines.push('');
  lines.push(t.s4body);
  lines.push('');

  // 팁 이미지
  lines.push(D);
  lines.push(`▶ 이미지 삽입: 03_tips.png`);
  lines.push(D);
  lines.push('');

  // S5 팁 텍스트 (이미지 보조용 — SEO 키워드 확보)
  lines.push(`■ ${t.s5h2}`);
  lines.push('');
  if (t.s5intro) { lines.push(t.s5intro); lines.push(''); }
  t.tips.forEach(tip => {
    lines.push(`${tip.num}. ${tip.title}`);
    lines.push(tip.body);
    lines.push('');
  });

  // CTA 이미지
  lines.push(D);
  lines.push(`▶ 이미지 삽입: 04_cta.png`);
  lines.push(D);
  lines.push('');

  // 마무리 텍스트
  lines.push(`■ ${t.ctaBrand}`);
  lines.push('');
  if (t.ctaSub) lines.push(t.ctaSub.replace(/\n/g, ' '));
  lines.push('');

  // 해시태그
  lines.push(t.ctaTags || '#생각의숲 #초등글쓰기 #문해력 #손글씨 #뇌과학 #초등교육 #사고력');
  lines.push('');
  lines.push('생각의숲 | 읽고, 쓰고, 생각하는 문해력 전문 교육센터');
  lines.push('오픈 소식 사전 신청 → [링크]');

  return lines.join('\n');
}

// ── 가이드 빌더 ────────────────────────────────────────
function buildGuide(slug) {
  return [
    '═'.repeat(42),
    ' 네이버 블로그 업로드 가이드',
    ' 생각의숲 — ' + slug,
    '═'.repeat(42),
    '',
    '[ 준비물 ]',
    '  images/ 폴더의 PNG 4장 + naver_text.txt',
    '',
    '[ 구조 원칙 ]',
    '  이미지는 시각 강조용 4장만.',
    '  텍스트 3,000자+가 SEO 핵심 — 반드시 본문 입력.',
    '',
    '[ 업로드 순서 ]',
    '',
    '  1. 네이버 블로그 → 글쓰기',
    '',
    '  2. 제목 입력 (naver_text.txt 상단 [제목] 참고)',
    '',
    '  3. 본문 구성 — naver_text.txt 순서대로 진행:',
    '',
    '     ▶ 01_hero.png 삽입 (사진 추가)',
    '     → 핵심 요약 텍스트 붙여넣기',
    '     → 공감 훅 텍스트 붙여넣기',
    '',
    '     ▶ 02_data.png 삽입',
    '     → 연구 설명 텍스트 붙여넣기',
    '     → 우리 아이에게 텍스트 붙여넣기',
    '',
    '     ▶ 03_tips.png 삽입',
    '     → 팁 텍스트 붙여넣기 (이미지 아래)',
    '',
    '     ▶ 04_cta.png 삽입',
    '     → 마무리 + 해시태그 붙여넣기',
    '',
    '  4. 발행 전 제목 한 번 읽어보고 자연스럽게 다듬기',
    '     (이은경 감수 후 발행 권장)',
    '',
    '  5. 발행',
    '',
    '[ 예상 소요 시간: 10~15분 ]',
    '',
    '━'.repeat(42),
  ].join('\n');
}

// ── CLI ────────────────────────────────────────────────
const [, , htmlArg, outArg] = process.argv;
if (!htmlArg) { console.log('사용법: node export_article.js <html파일> [출력폴더]'); process.exit(0); }

const defaultOut = path.join(path.dirname(path.resolve(htmlArg)), 'output', path.basename(htmlArg, '.html'));
exportArticle(htmlArg, outArg || defaultOut).catch(err => { console.error('❌ 오류:', err.message); process.exit(1); });
