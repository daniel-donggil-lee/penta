/**
 * 생각의숲 카드뉴스 자동 PNG 추출
 *
 * 사용법:
 *   node export_cards.js <html파일> [출력폴더]
 *
 * 예시:
 *   node export_cards.js cardnews-genz-brain.html
 *   node export_cards.js cardnews-genz-brain.html ./output/genz
 *
 * 출력: 1080×1080 PNG 10장 (Instagram 캐러셀 바로 업로드 가능)
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const CARDS = [
  { id: 'c1',  name: '01_훅'    },
  { id: 'c2',  name: '02_팩트'  },
  { id: 'c3',  name: '03_원인'  },
  { id: 'c4',  name: '04_교실'  },
  { id: 'c5',  name: '05_뇌과학' },
  { id: 'c6',  name: '06_문제'  },
  { id: 'c7',  name: '07_입시'  },
  { id: 'c8',  name: '08_팁'    },
  { id: 'c9',  name: '09_브랜드' },
  { id: 'c10', name: '10_CTA'   },
];

async function exportCards(htmlFile, outputDir) {
  const htmlAbsPath = path.resolve(htmlFile);
  if (!fs.existsSync(htmlAbsPath)) {
    console.error(`❌ 파일 없음: ${htmlAbsPath}`);
    process.exit(1);
  }

  fs.mkdirSync(outputDir, { recursive: true });

  console.log(`\n🚀 브라우저 실행 중...`);
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',       // Unsplash cross-origin 허용
      '--allow-file-access-from-files',
    ],
  });

  const page = await browser.newPage();

  // 1080×1080 기준 뷰포트 (카드 540px + 여백)
  await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 2 });

  console.log(`📄 HTML 로딩: ${path.basename(htmlAbsPath)}`);
  await page.goto(`file://${htmlAbsPath}`, {
    waitUntil: 'networkidle0',
    timeout: 40000,
  });

  // 폰트·이미지 렌더링 안정화 대기
  await new Promise(r => setTimeout(r, 2500));

  const prefix = path.basename(htmlAbsPath, '.html');
  let saved = 0;

  for (const card of CARDS) {
    const el = await page.$(`#${card.id}`);
    if (!el) {
      console.warn(`  ⚠️  #${card.id} 없음 — 스킵`);
      continue;
    }

    const filename = `${prefix}_${card.name}.png`;
    const filepath = path.join(outputDir, filename);

    await el.screenshot({ path: filepath, omitBackground: false });
    saved++;
    console.log(`  ✅ ${card.name}  →  ${filename}`);
  }

  await browser.close();

  console.log(`\n✨ 완료! ${saved}장 저장 → ${path.resolve(outputDir)}\n`);
}

// ── CLI 실행 ──────────────────────────────────────────────────────
const [, , htmlArg, outArg] = process.argv;

if (!htmlArg) {
  console.log('사용법: node export_cards.js <html파일> [출력폴더]');
  process.exit(0);
}

// 출력 폴더 기본값: ./output/<html파일명>
const defaultOut = path.join(
  path.dirname(path.resolve(htmlArg)),
  'output',
  path.basename(htmlArg, '.html')
);

exportCards(htmlArg, outArg || defaultOut).catch(err => {
  console.error('❌ 오류:', err.message);
  process.exit(1);
});
