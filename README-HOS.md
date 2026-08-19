# H.O.S 스마트스토어 콘텐츠 생성 실행 가이드

이 문서는 개발 경험이 없는 사용자도 H.O.S 뉴스레터와 SNS 콘텐츠를 실행할 수 있도록 설명합니다. 명령어는 프로젝트 최상위 폴더에서 PowerShell로 실행합니다.

## 1. 처음 한 번 준비하기

Node.js 24 이상과 npm이 필요합니다. 프로젝트 폴더에서 다음 명령을 한 번 실행합니다.

```powershell
npm install
```

## 2. LM Studio 준비하기

1. LM Studio를 실행합니다.
2. 모델 검색 화면에서 `google/gemma-4-e4b`를 내려받습니다.
3. Chat 또는 Developer 화면에서 `google/gemma-4-e4b` 모델을 로드합니다.
4. LM Studio의 **Local Server** 또는 **API Server** 화면을 엽니다.
5. 서버 주소가 `http://127.0.0.1:1234`인지 확인하고 서버를 시작합니다.

별도의 OpenAI 유료 API Key는 필요하지 않습니다. LM Studio와 모델은 콘텐츠 생성이 끝날 때까지 실행된 상태여야 합니다.

## 3. 상품 입력 파일 만들기

실제 입력 파일 위치는 다음과 같습니다.

```text
playground/data/smartstore.json
```

파일이 없다면 예제 파일을 복사합니다.

```powershell
New-Item -ItemType Directory -Force playground/data
Copy-Item playground/data-examples/smartstore.example.json playground/data/smartstore.json
```

입력 예제:

```json
{
  "storeName": "House of Sea",
  "heroImage": "playground/assets/brand/host_main3.jpeg",
  "storeUrl": "https://smartstore.naver.com/example",
  "category": "생활·주방용품",
  "targetCustomer": "실용적인 생활용품을 찾는 고객",
  "newsletterTopic": "일상을 편리하게 만드는 추천상품",
  "tone": "친근하고 신뢰감 있게",
  "products": [
    {
      "name": "가상 상품명",
      "price": "19,900원",
      "features": ["접어서 보관 가능", "식기세척기 사용 가능"],
      "recommendationReason": "수납공간이 부족한 경우 활용하기 좋습니다.",
      "mainImage": "playground/assets/product/wool-dryer-main.png",
      "secondaryImage": "playground/assets/product/wool-dryer-sub1.png",
      "url": "https://smartstore.naver.com/example/products/1"
    }
  ]
}
```

상품은 1~5개 입력할 수 있습니다. 상품명, 가격, 특징, 추천 이유, URL은 작성한 값 그대로 결과에 사용되므로 정확하게 입력해야 합니다.

이미지는 선택 입력입니다. `heroImage`는 뉴스레터 상단, `mainImage`와 `secondaryImage`는 상품 영역에 표시됩니다. 로컬 파일은 `playground/assets/` 아래의 상대경로만 사용할 수 있으며 `../` 경로나 `C:\...` 같은 절대경로는 허용되지 않습니다. 보조 이미지는 대표 이미지가 있을 때만 입력할 수 있습니다. 공개 이미지는 `http://` 또는 `https://` URL로 입력할 수 있습니다.

`storeUrl`을 입력하면 하단에 스토어 이동 버튼이 표시됩니다. 입력하지 않으면 프로그램이 임의의 스토어 링크를 만들지 않습니다.

## 4. 입력 확인하기

```powershell
npm run playground:validate-smartstore
```

`[PASS] 스마트스토어 입력 검증 성공`이 표시되면 정상입니다.

## 5. Markdown 뉴스레터 만들기

LM Studio 서버와 모델이 실행 중인지 확인한 뒤 다음 명령을 실행합니다.

```powershell
npm run playground:smartstore-newsletter
```

결과:

```text
playground/output/newsletter.md
```

제목, 인트로, 마지막 안내 문장은 로컬 모델이 생성합니다. 상품명, 가격, 특징, 추천 이유, URL은 프로그램이 입력 원문을 그대로 삽입합니다.

## 6. HTML 뉴스레터 만들기

처음 사용하는 경우 예제 템플릿을 복사합니다.

```powershell
Copy-Item playground/data-examples/smartstore-template.example.html playground/data/smartstore-template.html
```

Markdown 뉴스레터 생성 후 다음 명령을 실행합니다.

```powershell
npm run playground:render-smartstore-html
```

결과:

```text
playground/output/newsletter.html
```

`newsletter.html` 파일을 더블클릭하면 브라우저에서 확인할 수 있습니다.

로컬 이미지 경로는 현재 PC에서 브라우저로 미리보기 할 때만 사용할 수 있습니다. 실제 이메일 수신자는 로컬 파일을 볼 수 없으므로 이메일 발송 전에는 이미지 호스팅 또는 CDN의 공개 `https://` URL로 교체해야 합니다. 이번 MVP에는 이미지 업로드나 CDN 연동이 포함되지 않습니다.

## 7. Threads, X, 상품별 Hook 만들기

```powershell
npm run playground:smartstore-social
```

결과:

```text
playground/output/threads.md
playground/output/x.md
playground/output/hooks.md
```

## 8. 결과 파일 모음

모든 결과는 다음 폴더에 저장됩니다.

```text
playground/output/
```

이 폴더와 `playground/data/`는 실제 사용자 데이터 보호를 위해 Git에 등록되지 않습니다.

## 9. 대표적인 오류와 해결방법

### `스마트스토어 입력 파일을 찾을 수 없습니다`

`playground/data-examples/smartstore.example.json`을 `playground/data/smartstore.json`으로 복사했는지 확인합니다.

### `smartstore.json 검증에 실패했습니다`

오류 메시지에 표시된 필드를 확인합니다. 모든 필수값을 입력하고, 상품은 1~5개로 유지하며, URL은 `http://` 또는 `https://`로 시작해야 합니다.

이미지 오류라면 경로가 `playground/assets/`로 시작하는지, `../` 또는 로컬 절대경로가 포함되지 않았는지 확인합니다. `secondaryImage`를 사용하려면 같은 상품에 `mainImage`도 입력해야 합니다.

### `LM Studio /models 요청 실패` 또는 연결 오류

LM Studio가 실행 중인지, API Server가 시작되었는지, 포트가 `1234`인지 확인합니다.

### `google/gemma-4-e4b 모델을 찾을 수 없습니다`

LM Studio에서 `google/gemma-4-e4b`를 로드한 다음 다시 실행합니다. 모델을 내려받기만 하고 로드하지 않은 경우에도 이 오류가 발생합니다.

### 구조화 출력 또는 사실 보존 검증 실패

명령을 반복 실행하기 전에 오류 내용을 확인합니다. 모델이 올바르게 로드되었는지 확인하고, `smartstore.json`의 문장이 지나치게 길거나 지시문 형태로 작성되지 않았는지 점검합니다. 상품 사실은 임의로 수정하지 마십시오.

### `newsletter.md를 찾을 수 없습니다`

먼저 다음 명령으로 Markdown 뉴스레터를 생성합니다.

```powershell
npm run playground:smartstore-newsletter
```

### HTML 템플릿을 찾을 수 없습니다

예제 템플릿을 실제 데이터 폴더에 복사합니다.

```powershell
Copy-Item playground/data-examples/smartstore-template.example.html playground/data/smartstore-template.html
```

### `newsletter.md와 smartstore.json의 사실 데이터가 일치하지 않습니다`

현재 `smartstore.json`이 Markdown 뉴스레터를 만들 때 사용한 입력과 달라졌다는 뜻입니다. LM Studio를 실행한 뒤 `npm run playground:smartstore-newsletter`로 Markdown을 다시 생성하고 HTML 렌더링을 재시도합니다. 프로그램은 불일치를 기존 텍스트 HTML로 조용히 대체하지 않습니다.
