//프론트엔드 라이브러리를 node_modules에서 public/vendor/로 복사하는 스크립트다.
//CDN 대신 서버가 직접 서빙해서 CDN 변조·장애와 무관하게 하고, CSP의 script-src를 'self'만 남긴다.
//사용법: npm run vendor
//
//- 라이브러리는 devDependencies에 정확한 버전으로 둔다. 운영 이미지·npm audit(운영)에 들어가지 않는다.
//- 복사본은 Git에 커밋한다. 폴더 이름에 버전이 들어가므로(cytoscape@3.30.4/) 버전이 바뀌면 URL도 바뀌어
//  서버가 1년 캐시(immutable)를 걸어도 이전 파일이 남지 않는다.
//- 패키지 버전을 올리면 이 스크립트를 다시 돌리고 index.html의 경로를 함께 고친다.
//  test/unit/vendor.test.js가 커밋된 파일이 설치된 패키지와 바이트 단위로 같은지 검사한다.

const fs = require('fs');
const path = require('path');

const WEB_DIR = path.join(__dirname, '..');
const NODE_MODULES = path.join(WEB_DIR, 'node_modules');
const VENDOR_DIR = path.join(WEB_DIR, 'public', 'vendor');

//pkg: npm 패키지, name: vendor 폴더 이름(없으면 pkg), files: 패키지 안의 상대경로 (복사본도 같은 경로)
//각 패키지의 LICENSE도 함께 복사한다 (MIT·BSD 라이선스 고지 유지)
const MANIFEST = [
  { pkg: 'cytoscape', files: ['dist/cytoscape.min.js'] },
  { pkg: 'layout-base', files: ['layout-base.js'] },
  { pkg: 'cose-base', files: ['cose-base.js'] },
  { pkg: 'cytoscape-fcose', files: ['cytoscape-fcose.js'] },
  { pkg: 'dagre', files: ['dist/dagre.min.js'] },
  { pkg: 'cytoscape-dagre', files: ['cytoscape-dagre.js'] },
  { pkg: 'd3-dispatch', files: ['dist/d3-dispatch.min.js'] },
  { pkg: 'd3-quadtree', files: ['dist/d3-quadtree.min.js'] },
  { pkg: 'd3-timer', files: ['dist/d3-timer.min.js'] },
  { pkg: 'd3-force', files: ['dist/d3-force.min.js'] },
  {
    pkg: '@highlightjs/cdn-assets',
    name: 'highlight.js',
    files: [
      'highlight.min.js',
      'languages/python.min.js',
      'languages/typescript.min.js',
      'languages/cpp.min.js',
      'languages/csharp.min.js',
      'languages/java.min.js',
      'languages/css.min.js',
      'styles/github-dark.min.css',
    ],
  },
];

//설치된 패키지의 버전. require.resolve('pkg/package.json')은 exports가 있는 패키지에서 막히므로 직접 읽는다.
function installedVersion(pkg) {
  const pkgJson = path.join(NODE_MODULES, pkg, 'package.json');
  return JSON.parse(fs.readFileSync(pkgJson, 'utf-8')).version;
}

//복사할 파일 목록 { src, dest, url }. url은 index.html에 쓰는 경로다.
function vendorEntries() {
  const entries = [];
  for (const { pkg, name = pkg, files } of MANIFEST) {
    const dir = `${name}@${installedVersion(pkg)}`;
    for (const file of [...files, 'LICENSE']) {
      entries.push({
        src: path.join(NODE_MODULES, pkg, file),
        dest: path.join(VENDOR_DIR, dir, file),
        url: `vendor/${dir}/${file}`,
      });
    }
  }
  return entries;
}

function main() {
  //이전 버전 폴더가 남지 않게 통째로 다시 만든다
  fs.rmSync(VENDOR_DIR, { recursive: true, force: true });
  for (const { src, dest, url } of vendorEntries()) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    console.log(url);
  }
}

if (require.main === module) main();

module.exports = { vendorEntries, VENDOR_DIR };
