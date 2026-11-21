# S’NAIL BOOK v0.2.0 — Extra v115 원본 검사

검사 원본: `Extra_v115_Edit_Recalculate_AutoScroll.zip` (42개 파일).

## 확인한 원본 구조
- `index.html`: 계산 / 정산 / 달력 / 설정 4개 하단 탭, 기존 SVG 탭 아이콘.
- `style.css`: 흰색 카드·파란 버튼·어두운 달력일 때 하단 탭 다크 스타일.
- `app.js`: 촬영 시간·수당 계산과 정산 기록·백업·설정.
- `calendar.html`: 독립 iframe 달력. 기존 Extra 관련 데이터·저장키가 포함된 별도 모듈.
- `manifest.webmanifest`, `sw.js`: Extra 설치/캐시.

## 재사용한 항목
- 원본 4개 하단 탭 SVG 아이콘 그대로 사용.
- 설정 아이콘 `google.png`, `backup.png`, `reset.png` 그대로 복사.
- 원본 스크린샷의 어두운 달력과 밝은 입력·설정 화면 구성, 고정 하단 탭·카드·버튼 디자인 규칙 참조.

## 독립적으로 재구현한 항목
- 기존 촬영 급여 계산이 남지 않도록 네일샵 예약, 서비스 가격·소요시간, 고객별 매출 데이터 로직은 별도 제작.
- 기존 `calendar.html` iframe은 Extra 일정 저장 체계와 결합돼 있기 때문에 재사용하지 않고 월/주/일 달력을 새 구현.
- 원본 Extra 앱과 저장 키·서비스워커·배포 경로를 공유하지 않음.

## 확인 필요
- iPhone Safari/PWA 실기기 검사와 배포 미진행.
- Google 캘린더 OAuth 연결은 실제 사용자에게 앱 설치 후 후속 작업.
- 사용자 제공 원본 그림을 아이콘으로 적용해 텍스트 없이 사용.
