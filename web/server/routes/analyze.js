//파일 명 그대로 코드를 분석하는 코드
//깃서비스로 프로젝트 경로를 확보

const express = require('express');
const router = express.Router();
const { getProjectPath, holdRepo } = require('../services/gitService');
const { buildGraph } = require('../services/graphBuilder');
const { registerProject } = require('../services/projectRegistry');
const analysisQueue = require('../services/analysisQueue');
const { logError, asyncHandler } = require('../utils/errors');

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { source } = req.body;

    //잘못된 요청은 분석 자리를 차지하기 전에 거른다
    if (!source || typeof source !== 'string' || !source.trim()) {
      return res.status(400).json({ error: 'source is required (Git URL or local path)' });
    }

    //브라우저가 응답을 받기 전에 연결을 끊으면 대기열에서 빠지고 파싱도 멈춘다.
    //req가 아니라 res의 close를 본다. req의 close는 본문을 다 읽으면 바로 발생한다.
    const controller = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) controller.abort();
    });

    let release;
    try {
      release = await analysisQueue.acquire(controller.signal);
    } catch (err) {
      if (controller.signal.aborted) return;
      res.set('Retry-After', String(err.retryAfter));
      return res.status(err.status).json({ error: err.message, code: err.code });
    }

    let releaseRepo = () => {};
    try {
      //clone은 같은 URL을 동시에 요청한 다른 요청과 공유하므로 연결이 끊겨도 중단하지 않는다
      const projectPath = await getProjectPath(source.trim());
      //분석하는 동안 repos/ 정리가 이 폴더를 지우지 않게 한다
      releaseRepo = holdRepo(projectPath);
      const graph = await buildGraph(projectPath, { signal: controller.signal });
      //파일 원본 조회(/api/file)용 id
      graph.analysisId = registerProject(projectPath);
      res.json(graph);
    } catch (err) {
      //브라우저가 떠났으면 응답할 곳이 없다
      if (controller.signal.aborted) return;
      //경로 정책·존재 여부·clone 실패는 gitService가 status와 사용자용 메시지를 붙여 준다
      if (err.status) {
        return res.status(err.status).json({ error: err.message, errorId: err.errorId });
      }
      if (err.message.includes('지원하는 파일을 찾을 수 없습니다')) {
        return res.status(400).json({ error: err.message });
      }
      //원인 상세(경로·stack)는 서버 로그에만 남기고 응답에는 오류 ID만 준다
      const errorId = logError('Analyze error', err);
      res.status(500).json({ error: '분석 중 오류가 발생했습니다', errorId });
    } finally {
      releaseRepo();
      release();
    }
  }),
);

module.exports = router;
