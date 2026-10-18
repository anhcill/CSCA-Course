# Ke hoach 4 ngay: dua UI dang de va lam de MOLI vao LMS

## 1. Muc tieu

Chuyen trai nghiem **tao/chinh sua de** va **hoc sinh lam de** tu du an `CSCA-MOLI.STUDIO` sang he thong quiz hien tai cua `WebsiteReactVCK-master`.

He thong sau khi hoan thanh van su dung:

- Khoa hoc, lop hoc va buoi hoc hien tai.
- Hai che do `Bai tren lop` va `Bai tap ve nha`.
- Thoi gian mo/dong, han nop va so luot lam hien tai.
- Tai khoan, phan quyen, autosave, cham diem va gradebook hien tai.

Phan lay tu MOLI:

- UI tao va chinh sua de.
- UI hoc sinh lam de va xem ket qua.
- OCR anh mot cau hoi.
- Tach noi dung OCR thanh cau hoi, lua chon, dap an va loi giai.
- Nhap, chuan hoa, preview va render LaTeX/KaTeX.
- Cau hoi thuong, dung/sai, nhieu dap an, doc hieu, dien khuyet, tu luan va dich.
- Import PDF/DOCX va man hinh review truoc khi luu, neu pipeline nguon dat kiem thu trong ngay 3.

Khong dua sang:

- Phong thi, dang ky thi, xep phong va giam thi.
- Ve du thi, vi pham phong thi va chung chi.
- Bang xep hang ky thi, Risk Center va cac luong VIP/premium cua de thi.
- Khu de thi cong khai tach roi khoi lop hoc.

## 2. Phan cong bat buoc

### Codex - Backend va database

Codex chi so huu cac phan sau:

- `WebsiteReactVCK-master/database/migrations/**`
- `WebsiteReactVCK-master/backend/**`
- `WebsiteReactVCK-master/package.json`
- `WebsiteReactVCK-master/package-lock.json`
- Test backend va migration.
- Tai lieu API contract trong file ke hoach nay.

Nhiem vu:

- Thiet ke va migrate du lieu cau hoi moi.
- API tao, sua, luu nhap, xuat ban va lay de de chinh sua.
- API OCR anh, validate file, rate limit va goi AI Vision phia server.
- API import PDF/DOCX.
- Snapshot de thi, autosave, nop bai, cham diem va ket qua.
- Bao ve dap an dung va giu tuong thich quiz cu.
- Backend tests va database migration tests.

### Gemini - Chi lam Frontend/UI

Gemini chi so huu cac phan sau:

- `WebsiteReactVCK-master/frontend/src/features/quizzes/**`
- `WebsiteReactVCK-master/frontend/src/components/common/RichMathText.jsx`
- `WebsiteReactVCK-master/frontend/src/features/api/lmsClient.js`
- `WebsiteReactVCK-master/frontend/src/App.jsx`
- `WebsiteReactVCK-master/frontend/package.json`
- `WebsiteReactVCK-master/frontend/package-lock.json`
- CSS/frontend tests lien quan den quiz.

Gemini khong duoc sua:

- `backend/**`
- `database/**`
- SQL, cham diem server, auth middleware hoac API response logic.

Nhiem vu:

- Port UI MOLI tu Next.js/TSX sang Vite/React JSX.
- Port `RichMathText`, `MathInput` va cac bo chuan hoa LaTeX.
- Port UI OCR: dan anh, chon anh, preview va sua ket qua OCR.
- Port `QuestionEditor`, `ReadingPassageGroup`, `FillBlankGroup`.
- Lam trang tao/sua de va trang hoc sinh lam bai.
- Ket noi API dung theo contract; khong tu thay doi contract backend.
- Responsive desktop/mobile va frontend tests.

## 3. Nguyen tac khong de hai ben xung dot

1. Codex khong sua file UI do Gemini so huu.
2. Gemini khong sua backend, migration hoac schema.
3. API contract duoc Codex chot truoc khi Gemini noi du lieu that.
4. Moi payload dung `camelCase` tren HTTP; backend tu map sang `snake_case` trong PostgreSQL.
5. Moi API tra ve dang chung:

```json
{
  "success": true,
  "data": {},
  "message": ""
}
```

6. Loi validation tra HTTP `400`; chua dang nhap `401`; khong du quyen `403`; khong tim thay `404`; xung dot trang thai `409`; loi OCR timeout `504`.
7. Khong dua API key AI vao `VITE_*` hoac frontend bundle.
8. Dap an dung khong duoc gui cho hoc sinh khi bai dang lam hoac review policy chua cho phep.

## 4. Mo hinh du lieu du kien

Migration moi bat dau sau migration `054_welcome_screen_settings.sql`.

### 4.1. Bang `quiz_question_groups`

```sql
id                  BIGSERIAL PRIMARY KEY
quiz_id             BIGINT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE
group_type          VARCHAR(30) NOT NULL
passage_text        TEXT
passage_text_cn     TEXT
passage_text_en     TEXT
passage_image_url   TEXT
linked_options      JSONB NOT NULL DEFAULT '[]'
cloze_mode          VARCHAR(20)
sort_order          INTEGER NOT NULL
created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

`group_type` chi chap nhan:

- `reading_passage`
- `fill_blank_pool`

### 4.2. Mo rong `quiz_questions`

Them cac cot:

```text
group_id
item_order
question_text_cn
question_text_en
explanation_cn
explanation_en
image_url
explanation_image_url
sub_question_number
ocr_metadata JSONB
```

Loai cau hoi can ho tro:

- `single_choice`
- `multiple_choice`
- `true_false`
- `reading_item`
- `fill_blank_item`
- `essay`
- `translation`

`options_json` su dung dang:

```json
[
  {
    "key": "A",
    "text": "Noi dung",
    "textCn": "",
    "textEn": "",
    "imageUrl": ""
  }
]
```

### 4.3. Tuong thich nguoc

- Quiz cu khong co `group_id` van hoat dong nhu hien tai.
- Khong drop bang/cot cu.
- `question_snapshot` cua moi luot lam phai chua ca question va group data.
- De da co luot lam chi duoc sua neu khong lam thay doi snapshot dang hoat dong; neu co xung dot tra `409`.

## 5. API contract toi thieu

### Quan ly de

```text
GET    /api/assignments/teacher/quizzes
GET    /api/assignments/teacher/quizzes/:quizId/editor
POST   /api/assignments/teacher/quizzes
PUT    /api/assignments/teacher/quizzes/:quizId
PUT    /api/assignments/teacher/quizzes/:quizId/items
POST   /api/assignments/teacher/quizzes/:quizId/publish
POST   /api/assignments/teacher/quizzes/:quizId/archive
DELETE /api/assignments/teacher/quizzes/:quizId
```

Payload tao/cap nhat de:

```json
{
  "title": "De CSCA so 01",
  "description": "",
  "courseId": 1,
  "liveClassId": 2,
  "classSessionId": 3,
  "activityScope": "session",
  "durationMinutes": 60,
  "passingScore": 60,
  "attemptLimit": 1,
  "availableFrom": "2026-10-20T01:00:00.000Z",
  "availableUntil": "2026-10-20T02:00:00.000Z",
  "dueDate": null,
  "reviewPolicy": "after_submit",
  "shuffleQuestions": false,
  "status": "DRAFT",
  "items": []
}
```

Moi item co mot trong ba dang:

```json
{
  "kind": "question",
  "questionType": "single_choice",
  "questionText": "...",
  "options": [],
  "correctAnswer": "A",
  "explanation": "...",
  "points": 1
}
```

```json
{
  "kind": "reading_group",
  "passageText": "...",
  "questions": []
}
```

```json
{
  "kind": "fill_blank_group",
  "clozeMode": "passage",
  "passageText": "...",
  "linkedOptions": [],
  "questions": []
}
```

### OCR va import

```text
POST /api/assignments/teacher/quiz-ocr/image
POST /api/assignments/teacher/quiz-import/preview
```

OCR image dung `multipart/form-data`, field `image`.

Response OCR:

```json
{
  "success": true,
  "data": {
    "text": "25. ...\nA. ...\nB. ...",
    "source": {
      "fileName": "question.png",
      "mimeType": "image/png",
      "size": 123456
    }
  }
}
```

### Hoc sinh lam bai

Giu cac endpoint hien tai, mo rong payload:

```text
GET  /api/assignments/quizzes/:quizId
PUT  /api/assignments/quizzes/:quizId/answers
POST /api/assignments/quizzes/:quizId/submit
```

`GET` tra ve:

- Metadata quiz.
- Thoi gian con lai theo server.
- `items` da duoc reconstruct theo question/group.
- Dap an da luu cua hoc sinh.
- Trang thai review.
- Khong co dap an dung neu chua duoc phep review.

## 6. Ke hoach theo ngay

## Ngay 1 - Nen tang du lieu, API contract va LaTeX

### Codex

- [x] Kiem tra baseline backend tests va migration hien tai.
- [x] Tao migration `055_moly_quiz_authoring.sql`.
- [x] Tao bang group va mo rong `quiz_questions`.
- [x] Them index, constraint va trigger `updated_at`.
- [x] Viet mapper nested items <-> database rows.
- [x] Viet validation chung cho tung loai cau hoi.
- [x] Chot API contract va response examples.
- [x] Viet test migration va mapper.

### Gemini

- [x] Tao `frontend/src/features/quizzes/` theo cau truc moi.
- [x] Port `RichMathText` va bo normalize LaTeX tu MOLI.
- [x] Port `MathInput` sang JSX.
- [x] Them KaTeX/remark/rehype dependencies.
- [x] Tao gallery test thu cong gom phan so, can, mu, tich phan, he phuong trinh va tieng Trung.
- [x] Tao skeleton route `new`, `edit` va `player` bang mock data theo API contract.

### Ket qua cuoi ngay 1

- Migration chay duoc tren database test.
- LaTeX render dung trong frontend mock.
- Hai ben dung cung mot cau truc `items`.

Trang thai kiem tra:

- Backend quiz/migration: 11/11 test pass.
- Frontend math normalizer: 8/8 test pass.
- Frontend ESLint: con 32 error va 3 warning trong cac file ngay 1; Gemini can xu ly truoc khi dong checkpoint frontend.

## Ngay 2 - Backend authoring, OCR va UI tao de

### Codex

- [x] Tach logic quiz authoring khoi `assignment.router.js` neu can de file khong tiep tuc phinh to.
- [x] Implement `GET /teacher/quizzes/:quizId/editor`.
- [x] Implement create/update metadata va `PUT /items` theo transaction.
- [x] Implement draft, publish, archive va delete policy.
- [x] Port prompt OCR mot anh tu MOLI.
- [x] Tao OCR service ESM rieng, khong port toan bo `aiService.js` cua MOLI.
- [x] Them upload memory, MIME validation, 8 MB limit, timeout va rate limit.
- [x] Them env mau cho OCR provider/model/fallback.
- [x] Viet test auth, validation va OCR error mapping.

### Gemini

- [x] Port `QuestionEditor`.
- [x] Port `SingleQuestionImageOcrInput`, hook OCR va `SingleQuestionOcrPaste`.
- [x] Port parser `parseSingleQuestionOcr` va `normalizeOcrMath`.
- [x] Port `ReadingPassageGroup` va `FillBlankGroup`.
- [x] Hoan thanh UI metadata: lop, buoi, tren lop/ve nha, thoi gian va luot lam.
- [x] Noi OCR API that va cho phep sua preview truoc khi apply.
- [x] Implement save draft va thong bao validation.

### Ket qua cuoi ngay 2

- Giao vien tao duoc draft bang UI MOLI.
- Dan/chon anh tao ra cau hoi co LaTeX va cho phep sua truoc khi luu.
- De duoc luu dung vao quiz/group/question tables.

Trang thai kiem tra:

- Backend authoring/OCR: 23/23 test quiz pass.
- OCR mac dinh tat; can bat `MOLI_QUIZ_AUTHORING_ENABLED=true`, `QUIZ_OCR_ENABLED=true` va cau hinh provider phia server.
- Frontend ngay 2 da co du cac thanh phan va API wiring, nhung ESLint toan frontend con 83 error va 3 warning; Gemini can don sach truoc checkpoint ngay 4.

## Ngay 3 - Player, snapshot, cham diem va import tai lieu

### Codex

- [x] Mo rong `publicQuizQuestion` va response player theo nested items.
- [x] Mo rong `question_snapshot` de dong bang ca group data.
- [x] Mo rong `normalizeQuizAnswers` cho cac loai cau hoi moi.
- [x] Cham tu dong single/multiple/true-false/reading/fill-blank.
- [x] Giu cham tay essay/translation va gradebook hien tai.
- [x] Dam bao autosave va submit idempotent.
- [x] Port pipeline preview PDF/DOCX toi thieu tu MOLI.
- [x] Tach phan import can thiet; khong mang room/official/risk dependencies.
- [x] Viet tests snapshot, cham diem va bao mat dap an.

### Gemini

- [x] Port bo cuc trang lam de MOLI vao `QuizPlayerPage` moi.
- [x] Render cau thuong, doc hieu va dien khuyet theo group.
- [x] Them palette so cau, trang thai da lam/chua lam va dieu huong cau.
- [x] Noi autosave, reload/resume, countdown va submit.
- [x] Dung `RichMathText` cho de, dap an va loi giai.
- [x] Port `PdfImportPanel` va `PdfImportReview`.
- [x] Noi preview import vao authoring editor.

### Ket qua cuoi ngay 3

- Hoc sinh lam duoc de moi tren desktop va mobile.
- Reload khong mat bai; het gio server co the tu nop.
- Cac loai cau hoi khach quan duoc cham dung.
- PDF/DOCX co man hinh preview; neu parser nguon gap blocker thi giu sau feature flag, khong lam anh huong OCR anh.

Trang thai kiem tra:

- Backend quiz/player/import: 31/31 test pass.
- Backend security regression: 10/10 test pass.
- Frontend production build: pass; con canh bao chunk lon va `eval` trong dependency `lottie-web`.
- PDF/DOCX smoke test bang file that: pass; PDF 5 trang trich xuat 6036 ky tu, DOCX trich xuat 14826 ky tu va co 1 parser warning de giao vien review.
- Frontend quiz lint: con 93 error, 0 warning; chu yeu la thieu PropTypes, regex escape khong can thiet va import chua dung. Gemini can don sach trong ngay 4.
- Cac feature flag `MOLI_QUIZ_AUTHORING_ENABLED`, `QUIZ_OCR_ENABLED` va `QUIZ_DOCUMENT_IMPORT_ENABLED` van mac dinh `false`; chua bat tren cau hinh production.
- Chua chay migration tren database production va chua deploy.

## Ngay 4 - Ket qua, regression, bao mat va ban giao

### Codex

- [x] Hoan thien response ket qua theo `reviewPolicy`.
- [x] Kiem tra diem vao gradebook va bao cao giao vien.
- [x] Kiem tra quiz cu khong bi regression.
- [x] Test hai tab, retry submit, timeout, het han va attempt limit.
- [x] Test quyen admin/creator/user va active LMS access.
- [x] Test file gia mao, file qua lon, OCR timeout va rate limit.
- [x] Chay migration tren database test tu schema sach va database co du lieu cu.
- [x] Viet rollback notes khong mat du lieu.

### Gemini

- [x] Hoan thien UI ket qua va giao vien cham tu luan.
- [x] Kiem tra responsive 360 px, tablet va desktop.
- [x] Kiem tra overflow cua cong thuc dai.
- [x] Them loading, empty, error, expired va permission states.
- [x] Chay frontend build/lint/test.
- [x] Sua tat ca loi noi API va visual regression.

### Tich hop chung

- [ ] Giao vien tao bai tren lop bang OCR anh.
- [ ] Hoc sinh vao dung lop va lam bai.
- [ ] Autosave, reload, nop bai va xem ket qua.
- [ ] Giao vien xem bao cao/cham tu luan.
- [ ] Diem xuat hien trong gradebook.
- [ ] Xac nhan khong co route/phong thi/chung chi nao tu MOLI duoc dua sang.

Trang thai kiem tra cuoi ngay 4:

- Backend quiz: 35/35 test pass.
- Backend security: 10/10 test pass.
- Assessment policy: 4/4 test pass.
- LMS workflow va gradebook: 10/10 test pass.
- Da test resume cung mot attempt tu hai tab, retry submit khong cong XP hai lan, attempt limit, auto-submit khi het han va giu dap an autosave.
- Da sua deadline de thoi gian dong de va accommodation hien tai cua server luon la nguon quyet dinh.
- Da test `after_close` khong lo dap an som, sau khi dong de moi tra dap an/loi giai.
- Da test diem quiz da nop xuat hien dung trong gradebook.
- Da test migration `055` tren schema sach, schema co quiz cu, chay lap lai va xac nhan du lieu cu khong thay doi.
- Frontend production build: pass khi build vao output rieng; `dist` mac dinh dang bi dev server giu file tren Windows.
- Frontend lint trong pham vi quiz chinh: pass. Pham vi mo rong ngay 4 con 9 error tai `frontend/src/features/teacher/utils/quizAnswerKey.js`.
- Frontend lint toan repository van con 174 error va 81 warning o cac module cu/ngoai pham vi quiz.
- Frontend hien khong co script test tu dong trong `frontend/package.json`.
- Chua bat feature flag, chua chay migration production va chua deploy.

Rollback an toan:

1. Tat `MOLI_QUIZ_AUTHORING_ENABLED`, `QUIZ_OCR_ENABLED`, `QUIZ_DOCUMENT_IMPORT_ENABLED` va `VITE_MOLI_QUIZ_UI` de quay lai luong quiz cu.
2. Rollback ung dung ve ban truoc van doc duoc database vi migration `055` chi them bang/cot/index, khong drop hoac doi ten du lieu cu.
3. Khong drop `quiz_question_groups` hoac cac cot moi trong su co thong thuong; giu lai de khong mat de da tao bang UI moi.
4. Truoc khi cleanup vinh vien, backup `quizzes`, `quiz_question_groups`, `quiz_questions` va `quiz_attempts`, sau do chi drop schema moi khi da xac nhan khong con du lieu can giu.

## 7. Feature flags va rollout

Backend:

```text
MOLI_QUIZ_AUTHORING_ENABLED=true|false
QUIZ_OCR_ENABLED=true|false
QUIZ_DOCUMENT_IMPORT_ENABLED=true|false
```

Frontend:

```text
VITE_MOLI_QUIZ_UI=true|false
```

Thu tu bat:

1. Local/test database.
2. Tai khoan admin.
3. Mot giao vien va mot lop thu nghiem.
4. Tat ca giao vien.
5. Tat ca hoc sinh.

## 8. Tieu chi hoan thanh

- [ ] UI tao de va lam de co day du luong chinh cua MOLI.
- [ ] OCR anh tach duoc cau hoi, lua chon, dap an va loi giai.
- [ ] LaTeX render giong nhau trong editor, player va result.
- [ ] Ho tro cau thuong, doc hieu, dien khuyet, dung/sai, nhieu dap an va tu luan.
- [ ] Quiz gan dung khoa hoc, lop va buoi hoc.
- [ ] Bai tren lop va bai ve nha dung window/han nop cua server.
- [ ] Autosave va resume khong mat dap an.
- [ ] Het gio tu nop va submit khong bi trung.
- [ ] Dap an dung khong bi lo som.
- [ ] Quiz cu van hoat dong.
- [ ] Gradebook hien tai nhan diem dung.
- [ ] Khong co phong thi, ve thi, giam thi, chung chi hoac Risk Center.

## 9. Thu tu uu tien khi 4 ngay khong du

Khong cat cac phan sau:

1. LaTeX renderer.
2. OCR anh mot cau.
3. UI tao/sua de.
4. UI hoc sinh lam bai.
5. Autosave, submit, snapshot va cham diem.
6. Tuong thich quiz cu va bao mat dap an.

Phan co the dat sau feature flag neu can them thoi gian:

1. Import PDF/DOCX hang loat.
2. AI review/sua hang loat sau import.
3. Ngan hang group doc hieu/dien khuyet dung chung giua nhieu de.
4. Cac animation va visual polish khong anh huong nghiep vu.

