# 글길

한국어 문장으로 URL을 표현하는 무상태(Stateless) 주소 변환기. **Cloudflare Pages Functions**를 사용하며 데이터베이스, KV, Durable Objects 없이 작동합니다.

## 배포

Cloudflare Dashboard → Workers & Pages → Create Pages → Connect to Git → `KKomaSub/korean-url`의 `main` 선택.

- Framework preset: None
- Build command: 비워 둠
- Build output directory: `/` (repository root)
- Functions: `functions/` 자동 인식

## 구조

- `index.html`: 원고지와 한지 질감의 웹 화면
- `functions/api.js`: `POST /api` URL 변환 (서버 측)
- `functions/글길/[[path]].js`: `GET /글길/문장...` URL 복원 및 HTTP 302 (서버 측)
- `src/words.js`: 제공 CSV에서 품사 기준으로 검증하여 선정한 고정 사전. 배열 순서 변경 금지
- `src/codec.js`: 버전 식별, deflate 압축, 7니블→문장, CRC32 복원
- `tests/codec.test.js`: 왕복 복원 및 오류 검사

`npm test`로 Node.js 22+에서 코덱을 검사할 수 있습니다.

## 설계 및 제한

각 문장은 `[관형형 형용사]-[주격 명사]-[관형형 형용사]-[목적격 명사]-[동사]` 형태입니다. 형용사·동사는 CSV에서 품사를 검증했고 활용형은 한국어 문법에 맞게 변환합니다. 각 문장에는 정확히 28비트(7개 16진 자릿수)의 값이 담깁니다. 프레임에는 버전, 압축 모드, 본문 길이, URL, 체크섬이 포함되어 있어 **저장소 조회 없이 복원**합니다. URL 길이 제한은 4096 UTF-8 바이트입니다. 원본이 길거나 압축률이 낮으면 생성 주소가 오히려 길어질 수 있습니다. 복원 가능하게 하려면 사전과 문장 규칙을 고정해야 합니다.

외부 링크로 이동하는 공개 리다이렉트 서비스입니다. 스팸·피싱을 막기 위한 도메인 차단이나 위험 URL 판정은 별도 운영 정책이 필요합니다.