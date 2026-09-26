//분석한 프로젝트 경로를 기억해두는 레지스트리다.
//프론트엔드가 절대 경로를 몰라도 analysisId + 상대 경로로 파일 원본을 요청할 수 있게 한다.
const crypto = require('crypto');

const MAX_PROJECTS = 20;
const projects = new Map(); // analysisId -> projectPath

//프로젝트 경로를 등록하고 analysisId를 돌려준다. 같은 경로는 항상 같은 id가 된다.
function registerProject(projectPath) {
  const id = crypto.createHash('sha256').update(projectPath).digest('hex').slice(0, 16);
  //최근 사용 순서를 유지하려고 지웠다가 다시 넣는다
  projects.delete(id);
  projects.set(id, projectPath);
  if (projects.size > MAX_PROJECTS) {
    projects.delete(projects.keys().next().value);
  }
  return id;
}

function getProjectRoot(id) {
  return projects.get(id) || null;
}

module.exports = { registerProject, getProjectRoot };
