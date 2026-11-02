//단위 테스트: public/vendor/에 커밋된 라이브러리 복사본이 설치된 패키지와 맞는지 검사한다.
//패키지 버전만 올리고 npm run vendor를 잊거나, index.html 경로를 고치지 않으면 여기서 실패한다.
const fs = require('fs');
const path = require('path');
const { vendorEntries, VENDOR_DIR } = require('../../scripts/vendor');
const { CYTOSCAPE_INJECTED_STYLE } = require('../../server/middleware/securityHeaders');

const entries = vendorEntries();
const INDEX_HTML = fs.readFileSync(path.join(__dirname, '../../public/index.html'), 'utf-8');

//폴더 아래 모든 파일의 경로
function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

describe('public/vendor 복사본', () => {
  test.each(entries.map((e) => [e.url, e]))('%s 가 설치된 패키지 파일과 같다', (_url, entry) => {
    expect(fs.existsSync(entry.dest)).toBe(true);
    expect(fs.readFileSync(entry.dest).equals(fs.readFileSync(entry.src))).toBe(true);
  });

  test('목록에 없는 파일이 남아 있지 않다 (이전 버전 폴더 등)', () => {
    const expected = entries.map((e) => e.dest).sort();
    expect(listFiles(VENDOR_DIR).sort()).toEqual(expected);
  });
});

describe('index.html과 vendor 목록', () => {
  const htmlVendorUrls = [...INDEX_HTML.matchAll(/(?:src|href)="(vendor\/[^"]+)"/g)].map(
    (m) => m[1],
  );

  test('index.html이 쓰는 vendor 경로는 모두 복사본에 있다 (버전 포함)', () => {
    const urls = new Set(entries.map((e) => e.url));
    expect(htmlVendorUrls.length).toBeGreaterThan(0);
    for (const url of htmlVendorUrls) {
      expect(urls.has(url) ? url : `missing: ${url}`).toBe(url);
    }
  });

  test('복사한 라이브러리 파일은 모두 index.html에서 쓴다 (LICENSE 제외)', () => {
    const used = new Set(htmlVendorUrls);
    const unused = entries
      .filter((e) => !e.url.endsWith('/LICENSE') && !used.has(e.url))
      .map((e) => e.url);
    expect(unused).toEqual([]);
  });
});

describe('Cytoscape CSP 해시', () => {
  //securityHeaders.js는 Cytoscape가 넣는 <style> 내용의 해시만 허용한다.
  //Cytoscape를 올려 내용이 바뀌면 그래프 컨테이너 스타일이 CSP에 막히므로 여기서 미리 잡는다.
  test('vendor의 cytoscape가 CSP 해시를 계산한 것과 같은 <style> 내용을 만든다', () => {
    const cytoscape = entries.find((e) => e.url.endsWith('cytoscape.min.js'));
    const source = fs.readFileSync(/** @type {any} */ (cytoscape).dest, 'utf-8');
    //소스에서는 "." + 클래스이름 + " { position: relative; }" 형태로 조립된다
    expect(source).toContain('"__________cytoscape_container"');
    expect(source).toContain('" { position: relative; }"');
    expect(CYTOSCAPE_INJECTED_STYLE).toBe('.__________cytoscape_container { position: relative; }');
  });
});
