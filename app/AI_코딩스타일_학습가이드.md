# AI 코딩 스타일 학습 가이드

> 이 문서는 특정 개발자의 코딩테스트 코드 21개(C 13개, C++ 5개, SQL 3개)를 분석하여 작성되었습니다.
> AI가 이 문서를 참고하면 해당 개발자의 코딩 습관과 스타일을 재현하되, 알려진 단점은 보완하여 코드를 작성할 수 있습니다.
> **이 문서를 AI에게 제공한 뒤, "이 문서의 스타일대로 코드를 작성해줘"라고 지시하면 됩니다.**

---

## 1. 언어 선호도 및 사용 기준

| 상황 | 사용 언어 |
|------|-----------|
| 기본 코딩테스트 | **C** (주력 언어) |
| STL 자료구조/알고리즘이 필요한 경우 | **C++** |
| 데이터 조회 문제 | **SQL** |

- C를 주력으로 사용하며, 포인터, 구조체, `malloc`, `qsort`/`bsearch` 등 저수준 기능을 자신 있게 다룬다.
- C++을 쓸 때는 `vector`, `string`, `sort`, `remove_if`, `unique`, 람다 등 **모던 C++ STL**을 적극 활용한다.
- SQL은 간결하고 정확하게 작성하며, 비트 연산(`&`), `IFNULL`, 집계 함수를 능숙하게 사용한다.

---

## 2. 코드 구조 및 포맷팅 규칙

### 2.1 기본 포맷
- **들여쓰기:** 4칸 스페이스 (탭 사용하지 않음)
- **중괄호 스타일:** K&R 스타일 (여는 중괄호를 같은 줄에 배치)
  ```c
  for (int i = 0; i < n; i++) {
      // 로직
  }

  if (condition) {
      // 로직
  } else {
      // 로직
  }
  ```
- **논리 섹션 사이:** 한 줄 공백으로 구분
- **간단한 조건문:** 한 줄로 작성 (중괄호 생략)
  ```c
  if (sec_pos < 0) sec_pos = 0;
  if (current_health > health) current_health = health;
  if (dp[i][j] > max_size) max_size = dp[i][j];
  ```
- **복잡한 조건문:** 중괄호 블록 사용
  ```c
  if (matrix[i][j] > matrix[j][i]) {
      next_month_gifts[i]++;
  } else if (matrix[i][j] < matrix[j][i]) {
      next_month_gifts[j]++;
  } else {
      if (gift_score[i] > gift_score[j]) next_month_gifts[i]++;
      else if (gift_score[i] < gift_score[j]) next_month_gifts[j]++;
  }
  ```
- **연산자 앞뒤:** 공백을 넣는다 (`a + b`, `i < n`, `a == b`)
- **함수 호출 괄호:** 공백 없음 (`strcmp(a, b)`, `malloc(size)`)
- **캐스팅:** `malloc` 반환값에 명시적 캐스팅 사용 (`(int*)malloc(...)`)

### 2.2 함수 시작 패턴 (answer 변수)
- 코딩테스트 플랫폼 관례에 따라 함수 첫 줄에 `answer` 변수를 선언하고 초기화한다.
- `answer`는 코딩테스트 프레임워크의 표준 반환 변수이므로 **항상 선언한다.**
  ```c
  // 정수 반환형
  int solution(...) {
      int answer = 0;
      // 로직 ...
      return answer;
  }

  // 배열 반환형 (C)
  int* solution(...) {
      int* answer = (int*)malloc(size * sizeof(int));
      // 로직 ...
      return answer;
  }

  // 문자열 반환형 (C++)
  string solution(...) {
      string answer = "";
      // 로직 ...
      return answer;
  }
  ```

### 2.3 C 파일 기본 include 세트
- 필요 여부와 관계없이 아래 4개를 항상 포함한다:
```c
#include <stdio.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>
```

### 2.4 C++ 파일 기본 구성
- `using namespace std;`를 항상 사용한다.
- 필요한 헤더를 상단에 모아둔다:
```cpp
#include <string>
#include <vector>
#include <algorithm>
// 필요시 추가: <cctype>, <cmath>, <queue>, <stack>, <map> 등

using namespace std;
```

### 2.5 함수 선언 포맷
- C: 반환형과 함수명을 같은 줄에 쓴다.
  ```c
  int solution(const char* friends[], size_t friends_len, const char* gifts[], size_t gifts_len) {
  ```
- C++: 반환형과 함수명을 같은 줄에 쓴다.
  ```cpp
  vector<vector<int>> solution(vector<vector<int>> data, string ext, int val_ext, string sort_by) {
  ```
- 헬퍼 함수는 `solution()` 함수 **위에** 선언한다 (전방 선언 없이 정의 순서로 해결).

---

## 3. 변수 네이밍 규칙

### 3.1 네이밍 컨벤션 표

| 대상 | 네이밍 스타일 | 예시 |
|------|--------------|------|
| 일반 변수 (C) | snake_case | `current_health`, `last_attack_time`, `gift_score`, `next_month_gifts` |
| 일반 변수 (C++) | snake_case 또는 camelCase | `sort_idx`, `ext_idx`, `word_count`, `max_size` |
| 헬퍼 함수 (C) | snake_case | `get_gcd`, `get_lcm`, `time_to_sec`, `get_column`, `time_change`, `startday_cycle` |
| 헬퍼 함수 (C++) | camelCase | `getIndex`, `step2`, `step3` |
| 루프 변수 | 단일 문자 | `i`, `j`, `k`, `step` |
| 인덱스 매핑 변수 | `_idx` 접미사 | `g_idx`, `r_idx`, `report_idx`, `ext_idx`, `sort_idx` |
| 불리언 변수 | `is_` 접두사 | `is_valid`, `is_center`, `is_success`, `is_spoiler`, `in_word`, `all_yellow` |
| 임시/파싱 변수 | 짧은 단일 문자 | `a`, `b`, `m`, `s`, `n`, `op` |
| 방향 배열 | `d` 접두사 + 축 이름 | `dh[4]`, `dw[4]` |
| 크기/길이 관련 | 직관적 이름 | `row`, `col`, `len`, `count`, `word_count` |
| 현재 상태 | `current_` 또는 `curr_` 접두사 | `current_health`, `current_day` |
| 임시 저장 | `temp_` 접두사 | `temp_row`, `temp_col`, `temp_name`, `temp_rank` |
| 접두사 `p_` | 파싱 대상 구분 | `p_year`, `p_month`, `p_day`, `p_term`, `p_total_day` |

### 3.2 의미 있는 네이밍 패턴
- 행렬/그리드 관련: `matrix`, `dp`, `board`, `park`
- 점수/카운트: `gift_score`, `report_score`, `count`, `word_count`
- 시간 관련: `sec_pos`, `sec_video_len`, `absolute_time`, `total_day`
- 경계값: `lux`, `luy`, `rdx`, `rdy` (left-upper / right-down 약어)

---

## 4. 주석 스타일

### 4.1 기본 규칙
- **한국어**로 작성한다. 영어 주석은 사용하지 않는다.
- `//` 단일 행 주석만 사용한다. `/* */` 블록 주석은 사용하지 않는다.
- `//` 뒤에 공백 없이 바로 한국어 텍스트를 쓰기도 하고, 공백 한 칸을 두기도 한다 (혼용 가능).

### 4.2 번호 매기기 주석
- 핵심 로직의 각 단계에 **번호를 매겨** 흐름을 표시한다.
  ```c
  //1. 직원별 순회
  for (int i = 0; i < schedules_len; i++) {
      //2. 출근 커트라인 계산
      int absolute_time = time_change(schedules[i]) + 10;

      //3. 일주일 순회
      for (int j = 0; j <= 6; j++) {
          //4. 주말 무적 쉴드
          int current_day = startday_cycle(startday, j);
          if (current_day == 6 || current_day == 0) continue;
      }
  }
  ```

### 4.3 짧은 동작 설명 주석
- 코드 블록 바로 위에 간결하게 단다.
  ```c
  //오프닝 건너뛰기
  if (sec_pos >= sec_op_start && sec_pos <= sec_op_end) {
      sec_pos = sec_op_end;
  }

  //총 일수를 구하기
  int total_day = (year * 12 * 28) + (month * 28) + day;

  //term매핑하기
  for (size_t i = 0; i < terms_len; i++) { ... }
  ```

### 4.4 헬퍼 함수 위 주석
- 헬퍼 함수 위에 한 줄로 역할을 설명한다.
  ```c
  //시간을 만드는 함수
  int time_change(int time) { ... }

  //요일 순환 주기
  int startday_cycle(int startday, int j) { ... }

  // 단어의 메타데이터를 저장할 구조체
  typedef struct message_meta { ... } message_meta;
  ```

### 4.5 유머/비유 주석
- 로직을 직관적으로 이해시키기 위해 비유적 표현을 사용하기도 한다.
  ```c
  //4. 주말 무적 쉴드
  //4. 트랜잭션 커밋
  ```

### 4.6 주석을 달지 않는 곳
- 함수 단위 docstring은 작성하지 않는다.
- 자명한 코드(변수 선언, 단순 반복문 등)에는 주석을 달지 않는다.
- 코딩테스트 플랫폼이 자동 생성한 파라미터 주석은 그대로 유지한다.

---

## 5. 문제 풀이 접근 패턴

### 5.1 문자열 파싱 (C)
- C에서는 **항상 `sscanf`**를 사용한다. `strtok`이나 수동 파싱보다 선호한다.
  ```c
  // 공백 구분 두 단어 파싱
  sscanf(gifts[i], "%s %s", giver, receiver);

  // 날짜 파싱 (구분자: '.')
  sscanf(today, "%d.%d.%d", &year, &month, &day);

  // 문자 + 숫자 파싱
  sscanf(terms[i], "%c %d", &a, &b);

  // 방향 + 거리 파싱
  sscanf(routes[k], "%c %d", &op, &n);

  // 시간 파싱 (구분자: ':')
  sscanf(time_str, "%d:%d", &m, &s);

  // 날짜 + 문자 파싱
  sscanf(privacies[i], "%d.%d.%d %c", &p_year, &p_month, &p_day, &p_term);
  ```

### 5.2 문자열 비교 (C)
- `strcmp`를 사용하며, 결과를 `== 0`으로 비교한다.
  ```c
  if (strcmp(friends[j], giver) == 0) g_idx = j;
  if (strcmp(commands[i], "prev") == 0) { ... }
  ```

### 5.3 도메인 값 변환 (핵심 패턴)
- 복잡한 도메인 값(시간, 날짜 등)을 **단일 정수로 평탄화**하여 비교 연산을 단순화한다.
- 이 패턴은 여러 문제에서 반복적으로 등장하는 핵심 습관이다.
  ```c
  // 날짜 -> 총 일수 (28일 기준)
  int total_day = (year * 12 * 28) + (month * 28) + day;

  // 시간(HH:MM) -> 총 초
  int time_to_sec(const char* time_str) {
      int m, s;
      sscanf(time_str, "%d:%d", &m, &s);
      return (m * 60) + s;
  }

  // 시간(HHMM 정수) -> 총 분
  int time_change(int time) {
      int hour = time / 100;
      int minutes = time % 100;
      return (hour * 60) + minutes;
  }
  ```

### 5.4 관계 모델링 (2D 인접 행렬)
- 두 엔티티 간 관계(선물, 신고 등)는 **고정 크기 2D 배열**로 표현한다.
- 이름 → 인덱스 매핑은 선형 탐색(`strcmp` 루프)으로 수행한다.
  ```c
  int matrix[50][50] = {0};   // 선물 주고받기 횟수
  int gift_score[50] = {0};   // 선물 지수 (준 횟수 - 받은 횟수)

  // 이름 -> 인덱스 매핑
  for (size_t j = 0; j < friends_len; j++) {
      if (strcmp(friends[j], giver) == 0) g_idx = j;
      if (strcmp(friends[j], receiver) == 0) r_idx = j;
  }
  matrix[g_idx][r_idx]++;
  ```

### 5.5 매핑/룩업 전략

#### 5.5.1 알파벳 문자 키 → 문자 인덱스 배열
```c
int term_map[26] = {0};
term_map[a - 'A'] = b;       // 'A'~'Z' → 0~25
term_month = term_map[p_term - 'A'];
```

#### 5.5.2 문자열 키 → 정렬 배열 + bsearch (C)
- C에 해시맵이 없으므로, `struct` 배열을 `qsort`로 정렬한 뒤 `bsearch`로 O(log n) 검색한다.
```c
// 구조체 정의
typedef struct {
    const char* name;
    int rank;
} PlayerDict;

// 비교 함수 (qsort, bsearch 공용)
int compare(const void* a, const void* b) {
    PlayerDict* dictA = (PlayerDict*)a;
    PlayerDict* dictB = (PlayerDict*)b;
    return strcmp(dictA->name, dictB->name);
}

// 정렬
qsort(dict, players_len, sizeof(PlayerDict), compare);

// 검색
PlayerDict key;
key.name = callings[i];
PlayerDict* result = (PlayerDict*)bsearch(&key, dict, players_len, sizeof(PlayerDict), compare);
```

#### 5.5.3 문자열 키 → 헬퍼 함수 (C++)
```cpp
int getIndex(string s) {
    if (s == "code") return 0;
    if (s == "date") return 1;
    if (s == "maximum") return 2;
    if (s == "remain") return 3;
    return -1;
}
```

### 5.6 그리드/격자 탐색
- **방향 배열 패턴**으로 4방향(상하좌우) 탐색을 수행한다.
  ```c
  int dh[4] = {0, 1, -1, 0};
  int dw[4] = {1, 0, 0, -1};

  for (int i = 0; i < 4; i++) {
      int h_check = h + dh[i];
      int w_check = w + dw[i];

      // 범위 체크
      if (h_check >= 0 && h_check < n && w_check >= 0 && w_check < n) {
          if (board[h][w] == board[h_check][w_check]) count++;
      }
  }
  ```
- 격자에서 시작점(`S`) 찾기:
  ```c
  for (size_t i = 0; i < park_len; i++) {
      for (size_t j = 0; j < park_width; j++) {
          if (park[i][j] == 'S') {
              S_row = i;
              S_col = j;
          }
      }
  }
  ```

### 5.7 시뮬레이션 패턴
- **"가상 이동 → 유효성 검증 → 커밋"** 패턴을 사용한다.
- 임시 변수에 먼저 이동 결과를 저장하고, 유효하면 실제 상태를 갱신한다.
  ```c
  int temp_row = S_row;
  int temp_col = S_col;
  bool is_valid = true;

  for (int step = 0; step < n; step++) {
      if (op == 'E') temp_col += 1;
      else if (op == 'W') temp_col -= 1;
      else if (op == 'S') temp_row += 1;
      else if (op == 'N') temp_row -= 1;

      // 범위 초과 또는 장애물 체크
      if (temp_row < 0 || temp_row >= park_len || temp_col < 0 || temp_col >= park_width || park[temp_row][temp_col] == 'X') {
          is_valid = false;
          break;
      }
  }
  if (is_valid) {
      S_row = temp_row;
      S_col = temp_col;
  }
  ```

### 5.8 스왑/교환 패턴
- 두 값을 교환할 때 `temp` 변수를 사용한다.
  ```c
  // 배열 내 교환
  char* temp_name = answer[curr_rank];
  answer[curr_rank] = answer[front_rank];
  answer[front_rank] = temp_name;

  // 구조체 필드 교환
  int temp_rank = current_player->rank;
  current_player->rank = front_player->rank;
  front_player->rank = temp_rank;
  ```

### 5.9 문제 분해 (단계별 함수 분리)
- 문제가 여러 단계로 구성된 경우, 각 단계를 **별도 함수로 분리**한다.
- C++에서는 `string&` 참조로 전달하여 원본을 직접 수정한다.
  ```cpp
  void step2(string& new_id) {
      new_id.erase(remove_if(new_id.begin(), new_id.end(), [](char c) {
          return !(islower(c) || isdigit(c) || c == '-' || c == '_' || c == '.');
      }), new_id.end());
  }

  void step3(string& new_id) {
      new_id.erase(unique(new_id.begin(), new_id.end(), [](char a, char b) {
          return a == '.' && b == '.';
      }), new_id.end());
  }

  string solution(string new_id) {
      //1단계
      transform(new_id.begin(), new_id.end(), new_id.begin(), ::tolower);
      //2단계
      step2(new_id);
      //3단계
      step3(new_id);
      // ...
      return new_id;
  }
  ```

### 5.10 수학적 최적화
- 탐색 범위를 줄이기 위해 **GCD/LCM**, **모듈러 연산** 등을 활용한다.
- 오버플로우를 방지하기 위해 `(a / gcd) * b` 순서를 지킨다.
  ```c
  int get_gcd(int a, int b) {
      int temp;
      while (b != 0) {
          temp = a % b;
          a = b;
          b = temp;
      }
      return a;
  }

  int get_lcm(int a, int b) {
      int gcd = get_gcd(a, b);
      return (a / gcd) * b;  // 오버플로우 방지: 나누기 먼저
  }
  ```
- 주기적 패턴에서 모듈러 연산 활용:
  ```c
  int pos = (t - 1) % cycle;              // 주기 내 위치
  int current_day = (startday + j) % 7;   // 요일 순환
  ```

### 5.11 DP (동적 프로그래밍)
- 최대 정사각형 부분행렬 등 클래식 DP 문제를 정확히 적용한다.
  ```cpp
  vector<vector<int>> dp(row, vector<int>(col, 0));
  for (int i = 0; i < row; i++) {
      for (int j = 0; j < col; j++) {
          if (park[i][j] == "-1") {
              if (i == 0 || j == 0) {
                  dp[i][j] = 1;
              } else {
                  dp[i][j] = min(dp[i-1][j], min(dp[i][j-1], dp[i-1][j-1])) + 1;
              }
              if (dp[i][j] > max_size) max_size = dp[i][j];
          }
      }
  }
  ```

### 5.12 조건 분기 시 if-else if 체인 사용
- `switch-case`보다 `if-else if` 체인을 선호한다.
  ```c
  if (op == 'E') temp_col += 1;
  else if (op == 'W') temp_col -= 1;
  else if (op == 'S') temp_row += 1;
  else if (op == 'N') temp_row -= 1;
  ```

### 5.13 범위 체크 패턴
- 경계 검사를 하나의 조건문에 `||`로 연결한다.
  ```c
  if (temp_row < 0 || temp_row >= park_len || temp_col < 0 || temp_col >= park_width) { ... }
  if (h_check >= 0 && h_check < n && w_check >= 0 && w_check < n) { ... }
  ```

### 5.14 최솟값/최댓값 갱신 패턴
- C: `#define` 매크로 또는 직접 비교
  ```c
  #define MIN(a, b) ((a) < (b) ? (a) : (b))
  #define MAX(a, b) ((a) > (b) ? (a) : (b))

  lux = MIN(lux, (int)i);
  rdx = MAX(rdx, (int)i);
  ```
- C++: `std::min`, `std::max` 사용 (보완 규칙 적용)
  ```cpp
  dp[i][j] = min(dp[i-1][j], min(dp[i][j-1], dp[i-1][j-1])) + 1;
  ```

### 5.15 결과 포맷팅 (출력 변환)
- `sprintf`로 결과 문자열을 생성한다.
  ```c
  char *answer = (char *)malloc(8);
  sprintf(answer, "%02d:%02d", sec_pos / 60, sec_pos % 60);
  ```

### 5.16 구조체 활용 (복잡한 메타데이터)
- 단어별 메타데이터 등 복잡한 정보를 저장할 때 `typedef struct`를 사용한다.
  ```c
  typedef struct message_meta {
      int start_idx;
      int end_idx;
      char *word;
      bool is_spoiler;
  } message_meta;

  message_meta meta[10000];
  ```

### 5.17 상태 머신 기반 토큰 분리
- 문자열을 단어 단위로 분리할 때 `in_word` 플래그로 상태를 추적한다.
  ```c
  bool in_word = false;
  for (int i = 0; i <= len; i++) {
      if (!in_word && message[i] != ' ' && message[i] != '\0') {
          meta[word_count].start_idx = i;
          in_word = true;
      } else if (in_word && (message[i] == ' ' || message[i] == '\0')) {
          meta[word_count].end_idx = i - 1;
          in_word = false;
          // 단어 추출 및 저장 ...
          word_count++;
      }
  }
  ```

### 5.18 구간 겹침 판별
- 두 구간 `[s1, e1]`과 `[s2, e2]`의 겹침 여부를 판별한다.
  ```c
  // start <= end2 && end >= start2 → 겹침
  if (meta[i].start_idx <= spoiler_ranges[k][1] && meta[i].end_idx >= spoiler_ranges[k][0]) {
      meta[i].is_spoiler = true;
  }
  ```

### 5.19 지그재그(사행) 인덱싱
- 짝수/홀수 행에 따라 방향이 달라지는 인덱싱을 처리한다.
  ```c
  int get_column(int index, int w) {
      int layer = index / w;
      if (layer % 2 == 0) {
          return index % w;
      } else {
          return (w - 1) - (index % w);
      }
  }
  ```

### 5.20 C++ STL 알고리즘 활용 패턴
- `remove_if` + `erase` (Erase-Remove 관용구):
  ```cpp
  new_id.erase(remove_if(new_id.begin(), new_id.end(), [](char c) {
      return !(islower(c) || isdigit(c));
  }), new_id.end());
  ```
- `unique` + `erase` (연속 중복 제거):
  ```cpp
  new_id.erase(unique(new_id.begin(), new_id.end(), [](char a, char b) {
      return a == '.' && b == '.';
  }), new_id.end());
  ```
- `sort` + 람다 (커스텀 정렬):
  ```cpp
  sort(answer.begin(), answer.end(), [sort_idx](const vector<int>& a, const vector<int>& b) {
      return a[sort_idx] < b[sort_idx];
  });
  ```
- `sort` + 내림차순:
  ```cpp
  sort(mats.begin(), mats.end(), greater<int>());
  ```
- `transform` (일괄 변환):
  ```cpp
  transform(new_id.begin(), new_id.end(), new_id.begin(), ::tolower);
  ```
- `const auto&` 범위 기반 for (불필요한 복사 방지):
  ```cpp
  for (const auto& row : data) {
      if (row[ext_idx] < val_ext) {
          answer.push_back(row);
      }
  }
  ```

---

## 6. 자주 사용하는 자료구조

| 자료구조 | 용도 | 언어 | 실제 사용 예 |
|----------|------|------|-------------|
| 고정 크기 1D 배열 | 점수, 카운트, 매핑 | C | `int gift_score[50]`, `int term_map[26]`, `int report_score[1000]` |
| 고정 크기 2D 배열 | 인접 행렬, 관계 모델링 | C | `int matrix[50][50]`, `char matrix[1000][1000]` |
| `typedef struct` | 딕셔너리/메타데이터 | C | `PlayerDict`, `message_meta` |
| `qsort` + `bsearch` | 정렬 + 이진 탐색 | C | 달리기경주 문제 |
| `#define MIN/MAX` | 최솟값/최댓값 매크로 | C | 바탕화면정리 문제 |
| `vector<int>` | 1D 동적 배열 | C++ | 대부분의 C++ 풀이 |
| `vector<vector<int>>` | 2D 동적 배열, DP 테이블 | C++ | 공원 DP, 데이터분석 |
| `string` | 문자열 처리/변환 | C++ | 신규아이디추천 |
| 문자 인덱스 배열 `[26]` | 알파벳 키 → 값 매핑 | C | 개인정보수집유효기간 |

---

## 7. 보완 규칙 (원래 습관의 단점을 수정)

아래 항목들은 원래 코딩 습관에서 발견된 단점을 보완한 규칙이다. **반드시 이 보완 규칙을 적용하여 코드를 작성할 것.**

### 7.1 메모리 관리
- `malloc`으로 할당한 **임시 메모리**는 함수 내에서 **반드시 `free`로 해제**한다.
- `answer`로 반환하는 메모리는 호출자가 관리하므로 해제하지 않는다.
  ```c
  // 임시 메모리: 사용 후 해제
  PlayerDict* dict = (PlayerDict*)malloc(players_len * sizeof(PlayerDict));
  // ... 사용 ...
  free(dict);  // 반드시 해제

  // 반환 메모리: 해제하지 않음
  int* answer = (int*)malloc(size * sizeof(int));
  return answer;  // 호출자가 해제
  ```
- 루프 안에서 `malloc`한 개별 문자열도 사용이 끝나면 해제한다.

### 7.2 불리언 비교 간결화
- `== true`, `== false` 대신 직접 불리언 값을 사용한다.
  ```c
  // 보완 전: if (is_valid == true)
  // 보완 후:
  if (is_valid) { ... }
  if (!is_valid) { ... }

  // 보완 전: if (new_id.empty() == true)
  // 보완 후:
  if (new_id.empty()) { ... }
  ```

### 7.3 변수명 오타 방지
- 인덱스 약어는 **`idx`**로 통일한다 (`inx` 사용 금지).
  ```c
  // 보완 전: int r_inx = -1;
  // 보완 후:
  int r_idx = -1;
  ```
- 영어 철자를 정확히 쓴다:
  ```c
  // 보완 전: int currnet_time
  // 보완 후:
  int current_time
  ```

### 7.4 스택 오버플로우 방지
- 큰 배열(총 크기 약 100KB 이상)은 `static`으로 선언하거나 동적 할당한다.
  ```c
  // 보완 전: char matrix[1000][1000] = {0};  (스택에 1MB)
  // 보완 후:
  static char matrix[1000][1000];
  memset(matrix, 0, sizeof(matrix));
  ```

### 7.5 C++ 표준 라이브러리 활용
- `std::min`, `std::max`가 제공하는 기능을 커스텀 함수로 재구현하지 않는다.
  ```cpp
  // 보완 전: int smaller(int a, int b) { if (a > b) return b; else return a; }
  // 보완 후:
  min(a, b);
  max(a, b);
  ```

### 7.6 C++ 참조 전달
- `vector`, `string` 등 STL 컨테이너를 함수 인자로 받을 때, 수정이 필요 없으면 **`const &`**, 수정이 필요하면 **`&`**를 사용한다.
  ```cpp
  // 보완 전: int solution(vector<vector<string>> board, int h, int w)  // 전체 복사 발생
  // 보완 후:
  int solution(const vector<vector<string>>& board, int h, int w)      // 참조 전달
  ```

### 7.7 반환값 검증
- `malloc`, `bsearch` 등 실패 가능한 함수의 반환값은 NULL 체크를 수행한다.
  ```c
  int* arr = (int*)malloc(n * sizeof(int));
  if (arr == NULL) return NULL;

  PlayerDict* result = (PlayerDict*)bsearch(&key, dict, len, sizeof(PlayerDict), compare);
  if (result == NULL) { /* 에러 처리 */ }
  ```

### 7.8 중괄호 스타일 통일
- C, C++ 모두 **K&R 스타일**로 통일한다 (Allman 스타일 혼용 금지).
  ```c
  // 올바른 스타일 (K&R)
  if (condition) {
      // 로직
  } else {
      // 로직
  }

  // 사용하지 않는 스타일 (Allman)
  // if (condition)
  // {
  //     // 로직
  // }
  ```

### 7.9 들여쓰기 일관성
- 중첩 루프/조건문의 들여쓰기 깊이를 정확히 맞춘다.
- 특히 닫는 중괄호(`}`)의 위치를 여는 키워드와 동일 열에 맞춘다.
  ```c
  // 보완 전 (들여쓰기 불일치)
  //     for (int i = 0; i < 1000; i++) {
  //         for (int j = 0; j < 1000; j++) {
  //             if (matrix[i][j] == 1 && report_score[j] >= k) answer[i]++;
  //     }
  // }

  // 보완 후
  for (int i = 0; i < 1000; i++) {
      for (int j = 0; j < 1000; j++) {
          if (matrix[i][j] == 1 && report_score[j] >= k) answer[i]++;
      }
  }
  ```

### 7.10 중복 코드 제거
- 동일한 로직이 두 번 이상 나타나면 헬퍼 함수로 추출한다.
  ```c
  // 보완 전: 오프닝 건너뛰기 로직이 루프 전과 루프 안에 중복
  // 보완 후:
  void skip_opening(int* sec_pos, int sec_op_start, int sec_op_end) {
      if (*sec_pos >= sec_op_start && *sec_pos <= sec_op_end) {
          *sec_pos = sec_op_end;
      }
  }
  ```

---

## 8. SQL 스타일 규칙

### 8.1 기본 포맷
- 키워드는 **대문자** (`SELECT`, `FROM`, `WHERE`, `ORDER BY`, `LIMIT`, `AND`, `OR`)
- 컬럼명은 **대문자** (`ID`, `LENGTH`, `GENOTYPE`)
- 각 절(clause)은 **새 줄**에 작성한다.
- 별칭은 `AS`로 명시적 지정한다.

### 8.2 자주 사용하는 패턴
```sql
-- 기본 정렬 + 제한
SELECT ID, LENGTH
FROM FISH_INFO
ORDER BY LENGTH DESC, ID ASC
LIMIT 10;

-- NULL 처리 + 집계 + 반올림
SELECT ROUND(AVG(IFNULL(LENGTH, 10)), 2) AS AVERAGE_LENGTH
FROM FISH_INFO;

-- 비트 연산 필터링
SELECT COUNT(ID) AS COUNT
FROM ECOLI_DATA
WHERE (GENOTYPE & 2) = 0
AND ((GENOTYPE & 1) > 0 OR (GENOTYPE & 4) > 0);
```

### 8.3 SQL 주요 기능 사용
| 기능 | 사용 방식 |
|------|-----------|
| NULL 처리 | `IFNULL(column, default_value)` |
| 반올림 | `ROUND(value, decimal_places)` |
| 비트 연산 | `(column & bitmask) = 0` 또는 `> 0` |
| 다중 정렬 | `ORDER BY col1 DESC, col2 ASC` |
| 결과 제한 | `LIMIT N` |
| 집계 함수 | `COUNT()`, `AVG()`, `SUM()` |
| 별칭 | `AS ALIAS_NAME` |

---

## 9. 전체 코드 작성 흐름 (체크리스트)

코딩테스트 문제를 풀 때 아래 순서를 따른다:

### 9.1 풀이 시작
1. `answer` 변수를 선언하고 적절한 초기값으로 초기화한다.
2. 필요한 보조 변수/배열을 선언한다.

### 9.2 입력 처리
3. 입력값을 파싱/변환한다.
   - C: `sscanf`로 문자열 분리
   - 도메인 값(시간, 날짜) → 단일 정수로 변환
4. 필요한 자료구조를 세팅한다 (매핑 배열, 인접 행렬 등).

### 9.3 핵심 로직
5. 핵심 알고리즘을 구현한다.
   - 시뮬레이션: 가상 이동 → 검증 → 커밋
   - DP: 점화식 정의 → 테이블 채우기
   - 탐색: 방향 배열 + 범위 체크
   - 최적화: GCD/LCM, 모듈러 연산
6. 각 단계에 한국어 번호 주석을 단다.

### 9.4 결과 반환
7. 결과를 `answer`에 저장하고 반환한다.
8. (보완) 임시 메모리를 해제한다.

---

## 10. 코드 예시: 이 스타일로 작성된 모범 답안

### 10.1 C 예시 (시뮬레이션 + 도메인 변환)
```c
#include <stdio.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>

//시간을 초로 변환하는 함수
int time_to_sec(const char* time_str) {
    int m, s;
    sscanf(time_str, "%d:%d", &m, &s);
    return (m * 60) + s;
}

int* solution(const char* logs[], size_t logs_len, int threshold) {
    int* answer = (int*)malloc(logs_len * sizeof(int));
    if (answer == NULL) return NULL;
    memset(answer, 0, logs_len * sizeof(int));

    int count = 0;

    //1. 로그 파싱
    for (size_t i = 0; i < logs_len; i++) {
        char name[20];
        char time_str[6];
        sscanf(logs[i], "%s %s", name, time_str);

        //2. 시간 변환 및 비교
        int sec = time_to_sec(time_str);
        if (sec >= threshold) {
            answer[count] = i + 1;
            count++;
        }
    }

    return answer;
}
```

### 10.2 C 예시 (관계 모델링 + 인접 행렬)
```c
#include <stdio.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>

int solution(const char* users[], size_t users_len, const char* relations[], size_t relations_len) {
    int answer = 0;

    static int matrix[500][500];
    memset(matrix, 0, sizeof(matrix));
    int score[500] = {0};

    //1. 관계 파싱 및 행렬 구성
    for (size_t i = 0; i < relations_len; i++) {
        char from[20];
        char to[20];
        sscanf(relations[i], "%s %s", from, to);

        int from_idx = -1;
        int to_idx = -1;
        for (size_t j = 0; j < users_len; j++) {
            if (strcmp(users[j], from) == 0) from_idx = j;
            if (strcmp(users[j], to) == 0) to_idx = j;
        }

        if (from_idx != -1 && to_idx != -1) {
            matrix[from_idx][to_idx]++;
            score[from_idx]++;
            score[to_idx]--;
        }
    }

    //2. 결과 집계
    for (int i = 0; i < users_len; i++) {
        if (score[i] > answer) answer = score[i];
    }

    return answer;
}
```

### 10.3 C++ 예시 (STL + 람다 + 필터링)
```cpp
#include <string>
#include <vector>
#include <algorithm>

using namespace std;

int getIndex(const string& s) {
    if (s == "name") return 0;
    if (s == "score") return 1;
    if (s == "grade") return 2;
    return -1;
}

vector<vector<int>> solution(const vector<vector<int>>& data, const string& ext, int val_ext, const string& sort_by) {
    vector<vector<int>> answer;

    int ext_idx = getIndex(ext);
    int sort_idx = getIndex(sort_by);

    //1. 조건에 맞는 데이터 필터링
    for (const auto& row : data) {
        if (row[ext_idx] < val_ext) {
            answer.push_back(row);
        }
    }

    //2. 정렬
    sort(answer.begin(), answer.end(), [sort_idx](const vector<int>& a, const vector<int>& b) {
        return a[sort_idx] < b[sort_idx];
    });

    return answer;
}
```

### 10.4 SQL 예시
```sql
SELECT ROUND(AVG(IFNULL(SCORE, 0)), 2) AS AVERAGE_SCORE
FROM STUDENT_INFO
WHERE (STATUS & 1) > 0
ORDER BY AVERAGE_SCORE DESC
LIMIT 5;
```

---

## 요약

이 개발자의 코드는 **실용적이고 구조적**이다. 핵심 특징:

1. **헬퍼 함수 분리:** 재사용 가능한 로직(시간 변환, GCD, 컬럼 계산 등)을 적극적으로 별도 함수로 분리한다.
2. **도메인 값 평탄화:** 날짜→일수, 시간→초 등 복잡한 값을 단일 정수로 변환하여 비교를 단순화한다.
3. **한국어 번호 주석:** 로직 흐름을 단계별로 번호 매겨 표시하며, 직관적 비유를 사용한다.
4. **C 저수준 능력:** `sscanf`, `struct`, `qsort`/`bsearch`, `malloc` 등을 능숙하게 활용한다.
5. **C++ STL 활용:** `remove_if`, `unique`, `sort`, 람다, `const auto&` 등 모던 C++ 관용구를 자연스럽게 사용한다.
6. **시뮬레이션 패턴:** "가상 이동 → 검증 → 커밋" 방식으로 안전하게 상태를 갱신한다.

보완 규칙(메모리 해제, 불리언 간결화, 오타 방지, const 참조, 들여쓰기 통일 등)을 함께 적용하면 이 개발자의 스타일을 유지하면서도 더 안정적이고 깔끔한 코드를 작성할 수 있다.
