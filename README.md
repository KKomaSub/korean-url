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
- `functions/[slug].js`: `GET /한글문장` 신규 URL 복원 및 HTTP 302 (서버 측)
- `functions/글길/[[path]].js`: `GET /글길/문장...` URL 복원 및 HTTP 302 (서버 측)
- `src/words.js`: 제공 CSV에서 품사 기준으로 검증하여 선정한 고정 사전. 배열 순서 변경 금지
- `src/codec.js`: 과거 경로 호환용 v1 코덱 (배포 뒤 사전 순서를 수정하지 말 것)
- `src/words-v2.js`: 업로드된 CSV의 2음절 명사 4,096개 (고정 프로토콜)
- `src/codec-v2.js`: 한 문장 코덱, 52비트/절, CRC32, 선택적 deflate
- `tests/codec.test.js`: 왕복 복원 및 오류 검사

`npm test`로 Node.js 22+에서 코덱을 검사할 수 있습니다.

## 설계 및 제한

신규 주소는 `[명사]의[명사]이/가[명사]의[명사]을/를[동사]` 절을 연결하고, 마지막 절에서 종결형으로 끝나는 한 문장입니다. 한 절에는 52비트가 담기고 경로에는 하이픈, 공백, 쉼표가 들어가지 않습니다. **기존 `/글길/...` 링크는 종전 규칙으로 유지됩니다.** 과거 v1은 `[관형형 형용사]-[주격 명사]-[관형형 형용사]-[목적격 명사]-[동사]` 형태입니다. 형용사·동사는 CSV에서 품사를 검증했고 활용형은 한국어 문법에 맞게 변환합니다. 이전 v1의 각 문장에는 28비트가 담겨 있었습니다. v2는 절당 52비트를 담아 길이를 줄입니다. 프레임에는 버전, 압축 모드, 본문 길이, URL, 체크섬이 포함되어 있어 **저장소 조회 없이 복원**합니다. URL 길이 제한은 4096 UTF-8 바이트입니다. 원본이 길거나 압축률이 낮으면 생성 주소가 오히려 길어질 수 있습니다. 복원 가능하게 하려면 사전과 문장 규칙을 고정해야 합니다.

외부 링크로 이동하는 공개 리다이렉트 서비스입니다. 스팸·피싱을 막기 위한 도메인 차단이나 위험 URL 판정은 별도 운영 정책이 필요합니다.

한글 도메인/경로를 포함한 URL 및 프로토콜을 생략한 `example.com/path` 입력을 지원합니다. 신형 한글 주소는 오로지 완성형 한글 음절로만 이루어진 단일 경로 조각입니다. 입력의 특성에 따라 줄어드는 비율이 다르며, 임의의 URL을 저장소 없이 고정 길이로 압축할 수는 없습니다.

Cloudflare에는 요청 URI 길이 제한이 있어, 생성된 링크를 URL 인코딩했을 때 14,500자를 넘으면 서버에서 오류를 반환합니다. 긴 입력이라도 압축률이 높으면 지원됩니다. 아주 긴 비압축 URL은 DB 없는 한글 단일 경로 방식으로 모든 것을 지원할 수 없습니다.