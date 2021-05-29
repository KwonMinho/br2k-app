**br2k-app@1.5.6**

<h3>리더 노드만 네트워크 분할</h3>
**테스트 방법**
- 리더 노드 네트워크 분할 주기: 60 ~ 120 sec
- node recovery: 15sec
- 사용자: 5명 2 req/sec, total
- 사용자 당 요청을 10000 보낼 때, stop

**결과**
- 리더 네트워크 분할 회수: 52번/ 6843 sec(약 1시간)
- 리더 변경회수: 49 번
- 총 40495 사용자 요청 로그
- 처리중: 2개(inprocess), 성공: 40480, 미처리된 요청: 13개
- inprocess-> old leader -> state recovery (get backup)