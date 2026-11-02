//API 키 등록 (AI 해설·리팩토링에만 필요하다). 코드 이름은 auth/login이지만 화면에서는 '키 등록'이라 부른다.
//키는 서버로 한 번 보내고 끝이다. 브라우저에는 저장하지 않으며(localStorage 금지),
//서버가 준 HttpOnly 세션 쿠키만 남는다. 그래서 JS는 로그인 여부만 /api/auth/me로 묻는다.

let authLoggedIn = false;
//개발 환경의 더미 로그인(아무 값이나 넣으면 로그인)이 켜져 있는지. 서버 /me가 알려준다.
let authDummyLogin = false;
//로그인에 성공하면 다시 실행할 요청 (예: 401을 받은 리팩토링 요청)
let authPendingRetry = null;

const AUTH_TIPS = {
  loggedOut: 'Anthropic API 키를 등록하면 AI 해설·리팩토링을 쓸 수 있습니다',
  loggedIn: '등록한 키를 해제합니다 (서버에서 지웁니다)',
};

async function refreshAuthState() {
  try {
    const response = await fetch('/api/auth/me');
    const data = await response.json();
    authLoggedIn = !!data.loggedIn;
    authDummyLogin = !!data.dummyLogin;
  } catch {
    authLoggedIn = false;
  }
  updateAuthButton();
}

function updateAuthButton() {
  const btn = document.getElementById('auth-btn');
  if (!btn) return;
  btn.classList.toggle('logged-in', authLoggedIn);
  if (authLoggedIn) setRibbonLabel('auth-btn', '키 해제', AUTH_TIPS.loggedIn);
  else setRibbonLabel('auth-btn', '키 등록', AUTH_TIPS.loggedOut);
}

/* ── 키 등록 창 ── */

function isLoginModalOpen() {
  const el = document.getElementById('login-overlay');
  return !!el && !el.classList.contains('hidden');
}

//onSuccess를 주면 로그인에 성공한 뒤 한 번 실행한다
function openLoginModal(onSuccess) {
  const el = document.getElementById('login-overlay');
  if (!el) return;
  authPendingRetry = typeof onSuccess === 'function' ? onSuccess : null;
  _setLoginError('');
  const hint = document.getElementById('login-dummy-hint');
  if (hint) hint.classList.toggle('hidden', !authDummyLogin);
  el.classList.remove('hidden');
  const input = document.getElementById('login-key-input');
  if (input) input.focus();
}

//닫을 때 입력값을 지워 키가 DOM에 남지 않게 한다
function closeLoginModal() {
  const el = document.getElementById('login-overlay');
  if (!el) return;
  el.classList.add('hidden');
  const input = document.getElementById('login-key-input');
  if (input) input.value = '';
  _setLoginError('');
  _setLoginBusy(false);
  authPendingRetry = null;
}

function _setLoginError(text) {
  const el = document.getElementById('login-error');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('hidden', !text);
}

function _setLoginBusy(busy) {
  const submit = document.getElementById('login-submit');
  const input = document.getElementById('login-key-input');
  if (submit) {
    submit.disabled = busy;
    submit.textContent = busy ? '확인 중...' : '등록';
  }
  if (input) input.disabled = busy;
}

async function submitLogin(e) {
  e.preventDefault();
  const input = document.getElementById('login-key-input');
  const apiKey = input ? input.value.trim() : '';
  if (!apiKey) {
    _setLoginError('API 키를 입력해 주세요.');
    return;
  }

  _setLoginBusy(true);
  _setLoginError('');
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      _setLoginBusy(false);
      _setLoginError(data.error || '키를 등록하지 못했습니다.');
      if (input) input.focus();
      return;
    }

    authLoggedIn = true;
    updateAuthButton();
    //closeLoginModal이 authPendingRetry를 비우므로 먼저 꺼내 둔다
    const retry = authPendingRetry;
    closeLoginModal();
    if (retry) retry();
  } catch {
    _setLoginBusy(false);
    _setLoginError('서버에 연결하지 못했습니다.');
  }
}

async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch {
    //서버에 닿지 않아도 화면은 로그아웃 상태로 돌린다 (세션은 8시간 뒤 만료된다)
  }
  authLoggedIn = false;
  updateAuthButton();
}

//AI 요청이 401을 받았을 때 부른다. 로그인 창을 띄우고, 성공하면 retry를 다시 실행한다.
function requireLoginFor(retry) {
  authLoggedIn = false;
  updateAuthButton();
  openLoginModal(retry);
}

function setupAuth() {
  const btn = document.getElementById('auth-btn');
  const overlay = document.getElementById('login-overlay');
  const form = document.getElementById('login-form');
  const closeBtn = document.getElementById('login-close');

  if (btn) {
    btn.addEventListener('click', () => {
      if (authLoggedIn) logout();
      else openLoginModal();
    });
  }
  if (form) form.addEventListener('submit', submitLogin);
  if (closeBtn) closeBtn.addEventListener('click', closeLoginModal);
  //바깥 어두운 영역을 누르면 닫는다
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeLoginModal();
    });
  }

  refreshAuthState();
}

document.addEventListener('DOMContentLoaded', setupAuth);
