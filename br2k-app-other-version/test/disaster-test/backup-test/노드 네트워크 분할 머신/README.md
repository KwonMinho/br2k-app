<h1> 서비스 복제 기법의 견고성 테스트를 위한 네트워크 장애 모듈 </h1>

<h3>요구조건</h3>
1. virtualbox 기반으로 노드 구축.
2. 각 노드의 ETCD 클러스터링 되어있어함.
3. vagrant 폴더에 공유 폴더 생성 & 이 폴더 안에 down이라는 폴더 넣어주기
4. down/main.js 안에 네트워크 분리 회복 시간을 변경할 수 있음


<h3>첫번째 기능</h3>
*리더 서비스의 노드만 네트워크 분리*

실행: node network-partion-module/leader-killer-test.js <br/>
옵션: cycle을 변경하여 네트워크 분리 주기를 설정할 수 있다.


<h3>두번째 기능</h3>
*랜덤 서비스 네트워크 분리*

실행: node network-partion-module/random-test.js <br/>
옵션: cycle을 변경하여 네트워크 분리 주기를 설정할 수 있다.
