# TASK-07 WIP 인수인계

> 상태: 설계 및 코드 초안만 준비됨. 실제 프로젝트 미반영, 테스트 미수행, 브라우저 QA 미수행.

## 1. TASK-07 목적

기존 deterministic 사실 보존 구조를 유지하면서 JSON의 상품 정보와 이미지 경로만 교체해 재사용할 수 있는 이미지 기반 매거진형 HTML 자동 생성 엔진을 구축한다.

## 2. 완료된 설계

- `heroImage`, `mainImage`, `secondaryImage` 선택형 schema 초안
- 이미지가 있으면 매거진 레이아웃, 없으면 텍스트 fallback을 사용하는 렌더링 초안
- Hero, Store Story, NEW ARRIVALS 상품 섹션, 하단 Store CTA 구성
- 상품 이미지 링크와 alt text, 680px 이메일 컨테이너, 모바일 재배치 CSS
- 기존 LLM title/intro/CTA와 JSON의 deterministic 상품 사실 분리 유지
- 1/3/5개 상품, 이미지 없음, secondary 이미지 없음, 긴 문구 테스트 초안

## 3. 준비된 변경 파일

- `README-HOS.md`
- `playground/smartstore-input.ts`
- `playground/smartstore-input.test.ts`
- `playground/smartstore-html.ts`
- `playground/smartstore-html.test.ts`
- `playground/render-smartstore-html.ts`
- `playground/data-examples/smartstore.example.json`
- `playground/data-examples/smartstore-template.example.html`
- `playground/data/smartstore.json` (로컬 ignored 초안)
- `playground/data/smartstore-template.html` (로컬 ignored 초안)

이미지 자산은 WIP 브랜치의 `playground/assets/`에 별도로 보존한다.

## 4. 실제 프로젝트에 미반영인 이유

Codex Windows sandbox가 D 드라이브의 기존 파일 덮어쓰기를 거부했고 추가 권한 승인 후 `helper_unknown_error: setup refresh had errors`가 발생했다. 기존 프로젝트 파일은 변경하지 않았다.

## 5. 테스트 미수행 항목

- TypeScript typecheck
- 신규 및 전체 Vitest 테스트
- 사실 보존 회귀 테스트
- 1/3/5개 상품 및 이미지 fallback 실행
- 실제 newsletter.md 기반 HTML 생성

테스트 PASS로 간주하면 안 된다.

## 6. 브라우저 QA 미수행

데스크톱·모바일 레이아웃, 이미지 비율, 한글, 링크, overflow, 텍스트 잘림, CSS inline 결과를 확인하지 않았다.

## 7. 내일 컴1에서 시작할 정확한 순서

1. `git fetch origin`
2. `git switch codex/task-07-magazine-layout`
3. `git pull --ff-only`
4. `git status`와 이 문서를 확인한다.
5. `work/task07-stage/`의 tracked 파일 초안을 대응하는 프로젝트 경로에 적용한다. `playground/data/` 파일은 Git에 추가하지 않는다.
6. diff 검토와 formatter 실행 후 `npm run typecheck:playground` 및 관련 테스트를 실행한다.
7. 전체 테스트와 사실 보존 회귀 테스트를 실행한다.
8. 로컬 입력과 template을 준비한 뒤 LM Studio로 뉴스레터를 한 번 생성하고 HTML을 렌더링한다.
9. 데스크톱·모바일 브라우저 QA 후 필요한 수정만 반영한다.
10. 검증 완료 전에는 완료 commit 또는 안정 브랜치 merge를 하지 않는다.

## 8. 현재 알려진 sandbox 권한 문제

- `node:os.userInfo()`가 `uv_os_get_passwd returned ENOMEM`으로 실패해 `tsx` validation이 실행되지 않았다.
- D 드라이브 기존 파일 덮어쓰기에서 `Access to the path ... is denied`가 발생했다.
- 추가 권한 승인 후 `helper_unknown_error: setup refresh had errors`가 발생했다.
- 컴1의 일반 PowerShell에서 먼저 `node -e "console.log(require('os').userInfo())"`를 확인한다.
