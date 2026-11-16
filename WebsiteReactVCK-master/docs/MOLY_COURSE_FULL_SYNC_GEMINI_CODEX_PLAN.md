# Ke hoach dong bo day du Course <-> Moly - Gemini lam truoc, Codex review sau

Ngay lap: 2026-11-15.
Trang thai: KE HOACH, chua trien khai cac hang muc moi, chua push/deploy.
Thoi luong du kien: 10 ngay lam viec theo milestone; khong ep nghiem thu neu test chua dat.
Ke hoach nay mo rong ke hoach 5 ngay cu, khong thay the cac ban sua SSO/quyen/outbox da co.

## 1. Hai repository bat buoc doc

Moly:
C:\Users\ducan\Documents\Codex\2026-07-13\new-chat\CSCA-MOLI.STUDIO

Course repository:
C:\Users\ducan\Documents\Codex\2026-07-24\anhcill-csca-interview-git-https-github\CSCA-Course

Course application:
C:\Users\ducan\Documents\Codex\2026-07-24\anhcill-csca-interview-git-https-github\CSCA-Course\WebsiteReactVCK-master

Trong moi app: backend/, frontend/, database/, docs/.
Doc truoc:
- docs/MOLY_COURSE_INHERITANCE_AUDIT.md
- docs/MOLY_COURSE_DAY5_CODEX_FIXES.md
- docs/MOLY_COURSE_DAY5_CODEX_REVIEW.md
- Contract integration hien co va AGENTS.md o thu muc lien quan.

Moc tham chieu luc lap plan:
- Moly: 460cc240; Course: c55aa73.
- Kiem tra HEAD va git status thuc te truoc khi lam; khong reset ve cac moc nay.
- Course dang co thay doi frontend ngoai pham vi integration. Khong ghi de, gom
  commit hoac push nhung thay doi do khi chua review rieng.

## 2. Ket qua nguoi dung phai nhan duoc

1. Tao/publish/sua/an khoa hoc tren Course -> Moly tu cap nhat dung offering/profile.
2. Khoa da co quyen o Course hien trong My Learning Moly, khong yeu cau mua lai.
3. Nguoi chua co quyen van mua duoc o Moly khi san pham da cau hinh va duoc mo ban.
4. Hoc truc tiep trong Moly: video, chuong/bai, PDF/slide, quiz, bai tap, ly thuyet,
   tu vung/cong thuc, ghi chu va hoi dap trong pham vi khoa hoc.
5. Hoc o ben nao thi ben kia thay dung tien do, vi tri xem, bai da mo, lan lam quiz,
   bai nop, diem va ghi chu thuoc cung canonical identity.
6. Het han/thu hoi/hoan tien/khoa tai khoan phai co hieu luc o ca hai ben; khong
   xoa nham quyen doc lap tu Management hoac giao dich khac.
7. Loi mang/co backlog khong lam mat bai nop, nhan doi thanh toan hay cap sai quyen.
8. Course van hoat dong doc lap; Moly khong can sao chep password/JWT secret/database.

"Mọi thứ" trong plan nay la du lieu va chuc nang cua khoa hoc video.
Live meeting, chat ngoai khoa, ngan hang de dung chung, doanh thu lich su,
marketing va tinh nang admin khong lien quan khong tu dong duoc nhan ban.
Ngay 1 phai lap inventory tu giao dien/routes thuc te; chuc nang khoa hoc nao
chua nam trong bang duoi phai duoc bo sung va phan cong, khong am tham bo qua.

## 3. Quy tac nguon du lieu va dong bo

| Du lieu | Nguon chuan | Cach Moly su dung |
| --- | --- | --- |
| Khoa, offering/profile, chuong/bai, thu tu, publish/hide | Course | Projection cuc bo qua events + backfill |
| Video asset, transcript, lyric/theory, tu vung/cong thuc | Course | Metadata projection; noi dung co quyen qua API |
| PDF/file, placements, view/download policy | Course | Metadata; mo/xem/tai qua delegated access |
| Quiz, cau hoi, rubric, han nop, dap an, diem | Course | API lam bai/nop/cham; khong export dap an som |
| Watch time, completion, next-unit lock | Course | Lenh tu hai UI ghi ve Course; Moly doc projection |
| Notes/bookmarks/Q&A/submissions | Course cho khoa ke thua | Mutation co version/idempotency + read-back |
| Gia ban/goi/voucher/coins/payment/refund Moly | Moly | Course chi nhan entitlement, khong ghi de gia |
| Quyen goc Course/Management | He thong cap quyen do | Hieu luc tai Course; Moly doc ownership |
| Quyen mua Moly | Moly | Course inbox ap dung tung grant doc lap |
| Identity lien ket | Mapping canonical da xac minh | Khong ghep theo email; conflict can xu ly |
| Password/session/device token | Tung he thong | Khong dong bo bi mat; Course van thuc thi device policy |

Dong bo hai chieu o trai nghiem nguoi dung KHONG co nghia hai DB cung tu do ghi
mot ban ghi. Noi dung co mot nguon chuan. Lenh tu Moly ghi vao Course, Course tra
ket qua va phat event de cap nhat Moly. Quyen thi hop cac grant theo nguon.

Khoa Moly local hien co phai co content_origin ro rang; khong tu dong doi sang
Course hay ghi de tien do local. Backfill/merge lich su can bang doi chieu va
chinh sach rieng. Quan he mot course nhieu profile la bat buoc.

## 4. Kien truc du kien

- Course backend: API integration co version cho catalog export, content workspace,
  delegated learning session, playback, files, quiz/assignment, progress va notes.
- Moly backend: BFF (backend phuc vu giao dien) xac thuc session Moly, tim canonical
  identity, goi Course voi user/profile/scope ro rang; khong tin user_id tu browser.
- Delegated session ngan han, audience/scope/expiry/nonce ro rang; Course tu kiem
  tra quyen hien tai. Khong gui service token hay HMAC secret ra frontend.
- Player/PDF tren Moly dung token/url ngan han theo chinh sach Course. Khong iframe
  nguyen Course de ne SAMEORIGIN, khong mo public bucket hay tat auth/CSP.
- Catalog/content metadata: transactional outbox Course -> durable inbox Moly.
- Progress/attempt/submission: Course canonical transaction -> event Moly.
- Delivery at-least-once + unique event id + consumer idempotent; khong hua exactly-once.
- Per-aggregate revision tang dan; stale events bi bo qua. Delete/hide co tombstone,
  khong hard-delete lich su hoc/diem/payment.
- Snapshot co pagination/cursor va high-water mark/revision de khong mat events khi
  vua backfill vua cap nhat. Khong dung LIMIT roi coi phan thieu la da bi xoa.
- Retry/backoff, DLQ, replay va reconciliation co generation; tai su dung ban sua
  race/idempotency Day 5, khong tao key random moi cho moi retry.
- Mapping tu stable remote offering/profile ID. Khong doan theo title/slug.
- Catalog Course moi duoc tao projection, nhung khong tu mo ban neu chua co gia/goi.
  An/unpublish khong tu xoa quyen da mua; chinh sach access phai tach rieng.
- Ngat ket noi: doc metadata cache co nhan thoi diem; quyen nhay cam/phat token
  khong duoc tin cache cu. Bai nop chi bao thanh cong sau canonical acknowledgement.

## 5. Chia viec 10 ngay

Moi ngay: Gemini commit phan cua minh va gui handoff; Codex lam sau, review,
test, sua bang commit rieng. Khong sua dong thoi cung file.

### Ngay 1 - Inventory, contract va schema

Gemini:
- Liet ke tung chuc nang workspace Course va Moly; tao feature parity checklist.
- Viet contract v2, event schemas, source ownership, error codes, scopes va revision.
- Thiet ke bang mapping/projection/inbox/outbox/checkpoint/delegated session.
- Chot device identity: mot browser/device dung hai web khong duoc tu nhan thanh
  hai device moi; khong tin browser tu khai device ID de vuot gioi han.
- Xac dinh chinh sach xung dot notes/resume, quiz attempt, local Moly legacy data.

Codex:
- Review identity/profile scope, cac nguy co cap sai quyen/lo dap an/file.
- Review migration additive, indexes, constraints, backfill va rollback.
- Lap test matrix tracing tung chuc nang -> API -> SQL -> UI -> test.

Gate: contract va ma tran day du, moi truong du lieu co mot owner.
Deliverables: CONTRACT_V2.md, FEATURE_PARITY_CHECKLIST.md, migrations + tests.

### Ngay 2 - Catalog/offering tu dong + backfill

Gemini:
- Course export co cursor va outbox create/update/publish/hide/delete metadata.
- Moly durable inbox/upsert mapping theo external ID, revision, tombstone.
- Backfill resume duoc; khong ghi de san pham/gia/slug local khong thuoc integration.
- Hien khoa hoc moi, anh/mo ta/giang vien metadata/subject theo projection.
  Khong khoi phuc khoi giang vien va thanh loc vua duoc yeu cau bo.

Codex:
- Test nhieu hon 2.000 ban ghi, pagination, chay lai, event trung/dao thu tu.
- Test sua trong luc backfill, nhieu profile/cung course, an khoa, missing mapping.
- Xac minh khoa moi chua cau hinh gia khong the checkout.

Gate: publish Course -> Moly tu hien dung; hide/update khong mat lich su.

### Ngay 3 - Curriculum va workspace Moly

Gemini:
- Export chuong/bai/video parts/theory/transcript/vocab/formulas/capabilities.
- Xay adapter workspace Course trong Moly, phan biet local va external origin.
- Chi tra content user duoc phep xem; bai bi khoa chi tra metadata duoc cho phep.
- Mapping deep link den bai dung profile, giu SSO la fallback co chu dich.

Codex:
- Test MIRROR/INDEPENDENT, multi-part, preview, bai an/xoa, sai profile.
- Test user khong co quyen khong lay duoc noi dung qua goi API truc tiep.
- Kiem tra desktop/mobile/loading/error va regression khoa local.

Gate: curriculum Moly khop Course, khong fake progress hoac nhan ban enrollments.

### Ngay 4 - Video va tien do hai giao dien

Gemini:
- Delegated playback session tu Course, token ngan han, watermark/device control.
- Ghi watch events co session/sequence/idempotency; Course tinh completion.
- Resume va progress projection Moly, next-unit lock cung logic Course.
- Ap dung nguong hien co (50% + quiz); khong viet mot logic mo khoa rieng.
- Pause/offline/retry/device conflict co thong bao va trang thai ro rang.

Codex:
- Test xem tren Moly -> tiep tuc Course va nguoc lai.
- Test multi-tab, event trung/tre, seek khong cong watch time gia, tat mo trinh duyet.
- Test revoke giua playback, het token, device limit, dung grant doc lap.

Gate: tien do/vi tri/mo bai nhat quan; khong vuot device limit bang delegated session.

### Ngay 5 - PDF, slide va file dinh kem

Gemini:
- Export file metadata + placement + revision + view/download capabilities.
- Moly viewer su dung Course authorization; fetch/stream hoac signed token ngan han.
- Phan biet inline view va download; Range/MIME/CORS/cache headers dung.
- Xu ly file thay the/an/xoa, course/profile/class scope; khong luu URL ky het han.
- Giu watermark/view-only policy. Khong hua ngan tuyet doi screenshot/save byte da xem.

Codex:
- Test PDF nhieu trang, file lon/Range, mobile, filename Unicode, token expiry.
- Test doi file, private file, revoked user, locked unit, sai profile, copy URL.
- Test allow_download=false/true, HTTP cache sau revoke, khong lo bucket credentials.
- Thu user mua Moly thuc te mo PDF; khong chi dung fixture Management learner.

Gate: PDF Course xem duoc trong Moly, download chi khi duoc phep, revoke dung.

### Ngay 6 - Quiz, bai tap, bai nop va diem

Gemini:
- Course cung cap start/resume/save/submit attempt va assignment APIs.
- Moly UI hien cau hoi/han nop/attempt policy, nop file va hien diem.
- Course canonical grading; event cap nhat attempt/diem hai UI.
- Outbox cho ket qua cham cham; upload co size/type validation.
- Khong dong bo dap an/solution truoc thoi diem review cho phep.

Codex:
- Test timeout/retry nop bai khong tao hai attempt; hai UI nop cung attempt.
- Test autosubmit/deadline/attempt limit, rubric, solution embargo va wrong owner.
- Test thay quiz/version giua attempt theo contract va mo bai sau khi dat quiz.

Gate: cung attempt/submission/diem tren hai ben; khong lo dap an hay mat bai nop.

### Ngay 7 - Notes/bookmarks/Q&A va My Learning

Gemini:
- Ghi chu theo timestamp, bookmark, Q&A cua khoa hoc ve canonical Course IDs.
- Dung optimistic version/ETag; xung dot khong am tham ghi de bai viet moi hon.
- Dong bo unread/status can thiet trong workspace; khong nhan doi notification.
- My Learning Moly hien dung tien do, last lesson, resume va hoan thanh tu Course.

Codex:
- Test tao/sua/xoa tren hai UI, retry offline, private notes dung owner.
- Test completion va recent activity khong lay progress local cua khoa khac.
- So checklist ngay 1, bo sung moi chuc nang hoc chua duoc cover.

Gate: khong con progress=null cho external course da co du lieu canonical.

### Ngay 8 - Quyen, ban hang, refund va xu ly loi

Gemini:
- Ket noi projection moi voi ownership/checkout hien co.
- Reconciliation phan biet content drift, progress drift va entitlement drift.
- Ops dashboard backlog/DLQ/conflicts/checkpoint/last sync/per-subject retry.
- Fault injection: peer down, out-of-order events, stale snapshot, restore DB.
- Kill switches tach content sync, delegated learning va mutations/repair.

Codex:
- Chay lai 73 regression truoc, bo sung integration moi.
- Native PostgreSQL 2 connections: refund vs reconcile, concurrent retry,
  repeat drift, ownership check vs checkout va grant/revoke dao thu tu.
- Xac minh hoan tien khong xoa Management/sibling grants; content sync khong mo ban.

Gate: khong mat/nhan doi quyen, payment hay submission; retry/recovery co bang chung.

### Ngay 9 - Staging, browser E2E va hieu nang

Gemini:
- Dung staging rieng voi 2 DB, migrations, fixtures va storage test.
- Trien khai Course truoc -> kiem tra health/contract -> Moly sau.
- Browser E2E hai origin cho learner/paid/unowned/revoked/expired/conflict/staff.
- Do lag, traffic, backlog, payload, PDF/video egress va latency.
- Viet runbook backup/restore/rollback/replay, compatibility versions.

Codex:
- Review bang chung browser va SQL; tu chay lai critical paths.
- Test copied SSO callback, cookie/domain/HTTPS, CSRF/CORS, expired delegated token.
- Test mobile, 2 device, accessibility co ban, no secret in browser/logs.
- Kiem tra migration rerun/rollback tren ban sao DB, khong dung DB production.

Gate: full checklist co evidence; khong con P1/P2 chua xu ly.

### Ngay 10 - Chuan bi rollout va nghiem thu

Gemini:
- Hoan tat checklist parity, docs env/migration, known limitations va dashboards.
- Chuan bi release Course backward-compatible, Moly consumer tat flags mac dinh.
- Dinh nghia cohort test, ngat khan cap va data recovery cu the.
- Khong push all gom file ngoai pham vi chua review.

Codex:
- Review final diff hai repo, commit rieng, xac minh backup/rollback readiness.
- Doi chieu live/staging SQL khi duoc trien khai; khong lay test mock lam bang chung.
- Bao cao go/no-go tung feature, migration order, flags va test results.

Gate: user nhan bao cao cu the truoc push/deploy.
Lenh "chua push" hien tai van co hieu luc. Plan nay khong phai lenh deploy.
Khi user cho trien khai: Course truoc, doi healthy va contract probes dat,
sau do Moly; bat cohort nho, test, roi moi mo rong.

## 6. SLA muc tieu de nghiem thu (de xuat, can do tren staging)

- Catalog/content metadata: p95 cap nhat Moly <= 60 giay khi he thong khoe.
- Progress/notes: mutation canonical duoc ack truoc khi UI bao da luu;
  projection ben kia p95 <= 10 giay, read-through khi resume can du lieu moi.
- Grant/revoke: API truy cap/token moi kiem tra authoritative state;
  cache ownership khong duoc cho phep truy cap sau khi authoritative da tu choi.
- Token playback/file TTL ngan, de xuat <= 60 giay; tai lieu/byte da tai ve khong
  the thu hoi. Do revoke latency thuc te, khong tuyen bo "ngay lap tuc" vo dieu kien.
- Khi outage: durable event khong mat, DLQ quan sat duoc, replay khong nhan doi;
  recovery duoc do voi backlog mau, khong hua thoi gian neu chua benchmark.
- Canh bao backlog age vuot SLA, failed mutations, conflict growth va auth errors.

## 7. Test matrix bat buoc

| Tinh huong | Ky vong |
| --- | --- |
| Course publish moi, Moly chua co row | Tu tao projection/mapping; chua mo ban neu chua co gia |
| Doi ten/anh/thu tu, an/xoa bai | Moly cap nhat; lich su van tham chieu stable ID |
| Hoc Moly -> Course va nguoc lai | Resume, diem, note va next-unit lock nhat quan |
| Course user da co quyen | Khong bi ban lai cung offering khi ownership da xac minh |
| Moly user mua moi | Thanh toan -> grant -> video/PDF/quiz truy cap dung |
| PDF view-only va file private | Khong download trai policy; khong leak qua endpoint khac |
| Refund/revoke dong thoi repair | Final effective access dung; grant doc lap con nguyen |
| Events trung/dao thu tu/peer restart | Khong rollback revision hay tao ban ghi trung |
| Snapshot nhieu trang + event dang toi | Khong mat thay doi, checkpoint resume dung |
| Quiz submit 2 tab/2 UI | Attempt policy/score/idempotency dung |
| Email trung, identity sai/profile sai | Khong auto-merge, khong truy cap cheo |
| Course outage | UI bao loi dung, khong bao da nop/da luu gia |
| Native Moly course | Khong bi anh huong boi adapter khoa ke thua |

## 8. Handoff moi ngay

Gemini ghi:
- Branch/HEAD va commit o CA HAI repo; file thay doi va migrations.
- Endpoint/event/feature da hoan thanh; checklist con thieu.
- Lenh test + ket qua, screenshots/browser recordings neu co.
- Loi biet truoc, cach tai hien, env moi (chi ten, khong secret).
- Migration va compatibility/order notes.

Codex ghi:
- Findings P1/P2/P3 co file/line va cach tai hien.
- Fix commits, tests tu chay, gioi han bang chung.
- PASS/FAIL milestone; khong dong dau hoan thanh vi Gemini noi da xong.
- Khong sua cong viec dang duoc agent khac sua cung luc.

## 9. Definition of Done

Chi ket luan "dong bo day du" khi:
- Moi dong feature parity checklist co implementation, owner, test va evidence.
- New catalog + video + PDF + quiz + submission + notes + progress dung tren Moly.
- Thay doi tu hai giao dien hoi tu ve canonical state theo SLA.
- Quyen/revoke/device/download policy khong bi giam de lam cho integration chay.
- Khong can nhap tay tung khoa moi; exception/mapping conflict duoc bao ro.
- Migration/backfill/replay co the chay lai; rollback bao toan du lieu.
- Native PostgreSQL concurrency va real two-origin browser E2E da pass.
- Production chi duoc danh dau ready sau rollout gates, khong dong nhat voi
  "code da commit" hoac "unit test pass".

