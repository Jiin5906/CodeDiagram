//기본 테스트에서는 셸에 설정된 실제 API 키를 지워서 실수로 유료 API가 호출되지 않게 한다.
delete process.env.ANTHROPIC_API_KEY;
