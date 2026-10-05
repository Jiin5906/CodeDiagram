# syntax=docker/dockerfile:1
# 멀티 스테이지: base(빌드 도구) → test(개발 의존성 + 테스트) / prod(운영 의존성만, non-root)
# 베이스 이미지는 태그와 digest(멀티 아키텍처 인덱스)로 고정한다. 갱신은 Dependabot이 맡는다.
ARG NODE_IMAGE=node:22.23.3-trixie-slim@sha256:b26b04c123d9ff8ab646ceb18b9d75a1173acf64b9a401094b906d27b29338d4

# ---- base: tree-sitter 네이티브 모듈 빌드 도구 ----
FROM ${NODE_IMAGE} AS base
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json .npmrc ./

# ---- test: 개발 의존성까지 설치하고 테스트를 실행 ----
FROM base AS test
RUN npm ci
COPY . .
CMD ["npm", "test"]

# ---- deps-prod: 운영 의존성만 설치 ----
FROM base AS deps-prod
RUN npm ci --omit=dev && npm cache clean --force

# ---- prod: 빌드 도구 없는 실행 이미지 ----
FROM ${NODE_IMAGE} AS prod
ENV NODE_ENV=production
# Git URL 분석 시 simple-git이 git 바이너리로 clone한다
# 베이스 이미지 이후 나온 OS 보안 업데이트를 반영하고, 실행에 필요 없는 npm/corepack은 지운다(Trivy 지적 대상)
RUN apt-get update \
 && apt-get upgrade -y --no-install-recommends \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
WORKDIR /app
COPY --from=deps-prod --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node public ./public
# 클론 저장 위치(web/repos)는 node 사용자가 쓸 수 있어야 한다
RUN mkdir -p repos && chown node:node repos
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
