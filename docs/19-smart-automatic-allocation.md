# Smart Automatic Allocation — EXE101 F-Group Making

Tài liệu kỹ thuật thống nhất cho Smart Automatic Group Allocation. Từ Phase 3 trở đi, chỉ cập nhật
file này; không tạo tài liệu Markdown riêng cho từng phase.

## 1. Tổng quan tính năng và luồng nghiệp vụ đã chốt

Mục tiêu là hỗ trợ giảng viên đánh giá nhóm và phân bổ toàn bộ sinh viên trong đúng lớp/phiên,
ưu tiên giữ nhóm hợp lệ, Leader và hạn chế di chuyển. Group Score không thay thế Business Rules.

Luồng sản phẩm đã chốt (không đồng nghĩa toàn bộ đã triển khai):

```text
Chọn lớp/phiên → xem nhóm, rules và Group Score
→ Auto Allocate → xem range/suggestion, nhập target
→ tự động Preview không ghi dữ liệu → xem Before/After report
→ Auto Again hoặc đổi target nếu cần
→ Apply → xác nhận → kiểm tra lại dữ liệu/quyền/rules
→ lưu nguyên tử, auto-approve draft tham gia phương án
→ history và realtime sau commit
```

Hiện đã triển khai foundation Phase 1–2, Overview/Setup/Preview Phase 3, Backend Apply/History Phase 4
và Frontend Automatic Allocation Phase 5. Chưa triển khai Phase 6.
Chưa có Automatic Allocation Page, Apply, auto-approval hoặc allocation history.
Không tự chạy phân bổ khi mở trang; Preview và Auto Again không được mutation dữ liệu thật.

## 2. Quyết định nghiệp vụ và giới hạn phiên bản đầu

- Chỉ giữ/gộp nhóm hiện có trong phiên bản đầu; không tự tạo nhóm mới.
- Target là tổng nhóm không DISBANDED, gồm cả PENDING/ACCEPTED được bảo vệ.
- OPEN/REVOKED được tái cơ cấu theo quyền hiện có; PENDING/ACCEPTED giữ nguyên.
- Nhóm tái phân bổ phải đạt toàn bộ rules đang bật trước khi auto-approve.
- Không thay đổi rules, Compatibility Score hoặc lifecycle của các luồng hiện tại.

- Không có Undo ở phiên bản đầu; chỉ ghi allocation history khi Apply thành công.
- Không dùng Group Score thấp làm lý do duy nhất để giải tán nhóm; phải có phương án hợp lệ toàn lớp.

## 3. Phase 1 — Group Score Foundation

### 3.1. Công thức đã duyệt

Group Score đo mức hoàn thiện composition; không phải xác suất, điểm recommendation hay quyền approve.
Sử dụng kết quả `GroupRuleValidationService.evaluateGroup(classId, members)` để giữ đúng cách đếm Major/SE,
default và trạng thái bật/tắt. Có thể truyền danh sách thành viên giả lập, không cần lưu membership.

| Tiêu chí | Trọng số | Rules |
| --- | ---: | --- |
| MEMBERS | 40 | MIN/MAX_MEMBERS_PER_GROUP |
| MAJORS | 35 | MIN/MAX_MAJORS_PER_GROUP |
| SE | 25 | MIN_SE_MEMBERS_PER_GROUP |

- MIN: `min(actual / target, 1)`; target 0 có mức đáp ứng 1.
- MAX: mức đáp ứng 1 nếu actual <= target; ngược lại `target / actual`.
- Mức đáp ứng tiêu chí là giá trị thấp nhất của các rule đang bật thuộc tiêu chí đó.
- Trọng số hiệu lực = trọng số gốc / tổng trọng số các tiêu chí có rule đang bật.
- Điểm = 100 × tổng(trọng số hiệu lực × mức đáp ứng). Không cộng bio, status hoặc Compatibility Score.
- Nhóm rỗng có điểm 0 nếu có tiêu chí áp dụng, kể cả khi chỉ bật MAX.
- Không có tiêu chí áp dụng: `applicable=false`, `scorePercent=null` (UI dịch “Không áp dụng”).
- Làm tròn HALF_UP một chữ số thập phân ở đầu ra; tính tổng bằng các giá trị chưa làm tròn.
  Tổng các phần đóng góp hiển thị có thể chênh 0.1 do làm tròn.

Defaults: 2 người/2 ngành/1 SE = 80%; 4 người/2 ngành/1 SE = 100%; 4 người/2 ngành/0 SE = 75%.
Tắt SE: chuẩn hóa trọng số MEMBERS/MAJORS trên tổng 75, không phạt thiếu SE.

`GroupScoreDTO` trả điểm, applicable, `compositionRulesPassed` và breakdown theo tiêu chí/rule
(actual, target, passed, fulfillment, weight, contribution). Dùng enum code để UI dịch bằng i18n về sau;
không trả chuỗi mô tả mới hardcode cho UI.


### 3.2. Ranh giới validation

`compositionRulesPassed` chỉ là kết quả validator composition, không phải eligibility toàn bộ.
Nhóm rỗng hoặc sai Leader có thể đạt các rule MAX nhưng không được submit/approve.
MIN/MAX_GROUPS là điều kiện toàn lớp/phương án, không tính trong Group Score.
Rule gắn nhãn soft hiện vẫn bắt buộc đạt khi submit/approve; không bỏ qua trong allocation.
Điểm không thay thế membership integrity, Leader, authorization, class/session scope hoặc protected status.
Điểm làm tròn cao, thậm chí 100%, không được dùng thay `passed`.


### 3.3. Phạm vi triển khai và kết quả kiểm thử

Phase 1 chỉ thêm service/DTO nội bộ, tài liệu và unit tests. Không thêm endpoint, field vào response dùng chung,
UI, migration, engine hoặc thao tác database. Tests dùng RuleRepository mock và validator thật;
không Spring context, datasource hoặc email. Kiểm tra defaults, custom bounds, thiếu thành viên/ngành/SE,
vượt trần, rule tắt, ngưỡng SE=0, nhóm rỗng, không có rules áp dụng và không ghi/sửa input.

Kiểm tra thực tế Phase 1: Gradle 9.7.1
`test --tests com.fmaking.service.GroupScoreServiceTest --tests com.fmaking.service.ClassRuleStatusWarningsTest bootJar`
thành công: 17 tests scoring và 6 tests hồi quy rule status, 0 failure/error/skipped.
Chưa chạy toàn bộ suite hoặc kiểm thử UI/end-to-end.
Gradle Wrapper tải distribution bị chặn kết nối; lần kiểm tra thành công gọi trực tiếp Gradle 9.7.1
đã có trên máy, không sửa wrapper/build configuration.


## 4. Phase 2 — Feasibility & Allocation Engine

### 4.1. Phạm vi và reuse

`SmartAllocationService` là service nội bộ nhận `AllocationSnapshotDTO` (class, deadline, toàn bộ Student
của lớp, nhóm/membership và rules). Không có Repository, transaction ghi, event, email, API hoặc UI.
Snapshot phải do application layer đáng tin cậy cung cấp; đây không phải request body được phép tin từ client.

Các thay đổi chưa commit của Phase 1 được bảo toàn trong Phase 2.
`GroupScoreService` bổ sung `evaluateRules(rules, members)` để tính điểm từ cùng snapshot dùng cho engine,
không đọc Repository trong vòng tìm kiếm; entry point Phase 1 theo classId giữ nguyên.
`GroupRuleValidationService.evaluateGroup(classId, members)` giữ nguyên signature và chuyển tiếp vào
`evaluateRules(rules, members)`. Cả hai dùng chung logic/default/status/cách đếm Major và SE.
Không tạo validator độc lập hoặc sửa Compatibility Score hiện có.


### 4.2. Preliminary Range và target validation

F là số PENDING/ACCEPTED; R là số Student không thuộc nhóm protected; D là số draft OPEN/REVOKED.
Nhóm DISBANDED không là slot, không được giữ membership.

- Lower = max(1, MIN_GROUPS nếu bật, F + ceil(R / MAX_MEMBERS nếu bật)).
- Upper = min(tổng nhóm hiện tại, MAX_GROUPS nếu bật, F + floor(R / minimumRequired)).
- minimumRequired = max(1, MIN_MEMBERS, MIN_MAJORS, MIN_SE đang bật).
- Tiếp tục thu hẹp upper bằng nguồn SE và khả năng phủ ngành: với K nhóm draft,
  tổng min(số Student ngành i, K) phải >= K × MIN_MAJORS.
- Không có trần cấu hình dùng Integer.MAX_VALUE nội bộ, không khôi phục default của rule đã tắt.
- Range rỗng khi lower > upper. Giá trị trong range chỉ đạt các điều kiện cần, chưa được coi là feasible.

Target phải là số nguyên dương (kiểu Java int; API sau này phải từ chối số thập phân), không ít hơn F,
không vượt số nhóm hiện có. Kiểm tra bounds lớp, capacity, số người tối thiểu, nguồn SE và phủ ngành.
Không sử dụng Student trong protected groups để tính nguồn lực cho draft.
Không tự tạo nhóm, đổi phiên hoặc chuyển Student khác lớp.


### 4.3. Thuật toán, optimization và phân loại kết quả

1. Kiểm tra snapshot: ID duy nhất, scope class/deadline, membership không trùng, Student có trong tập lớp,
   dữ liệu Major thống nhất, đúng một Leader khớp group.leaderId. Sai snapshot là IllegalArgumentException,
   không gắn nhãn “bài toán vô nghiệm”.
2. Chọn K = target - F nhóm từ D draft hiện có; các draft không được giữ được đề xuất giải tán.
3. Backtracking gán từng Student trong pool vào K slot. Thứ tự heuristic ưu tiên SE/ngành khan hiếm,
   Leader và vị trí nhóm cũ, sau đó mức đóng góp vào rule còn thiếu. Mọi vị trí hợp lệ vẫn được xét nếu còn ngân sách.
4. Prune bằng trần người/ngành, tổng capacity, số người/SE/ngành còn thiếu và nguồn lực còn lại.
   Chỉ dùng điều kiện cần để không loại nhầm phương án hợp lệ.
5. Leaf phải phân bổ hết pool, không có nhóm rỗng; validator thật phải xác nhận tất cả composition rules đang bật.
   MIN/MAX_GROUPS kiểm tra trên tổng target (cả protected).
6. Đánh giá lexicographic: giữ nguyên membership nhóm vốn hợp lệ → giữ Leader → giảm movements
   (bao gồm Unassigned được đưa vào nhóm) → utility đóng góp quy định → seed phá hòa.
   Leader cũ được giữ nếu còn trong nhóm, nếu không chọn ID thành viên nhỏ nhất làm Leader hợp lệ.
7. Group Score cho từng nhóm kết quả dùng `GroupScoreService.evaluateRules`, cùng rules snapshot.

Utility chỉ là heuristic nội bộ dựa trên các thiếu hụt tương tự recommendation: base 50, +40 bổ sung SE thiếu,
+25 bổ sung ngành mới khi thiếu ngành, +15 bổ sung người khi thiếu MIN_MEMBERS đang bật; cap 100, không dùng bio.
Mục tiêu cuối tính tổng đóng góp của từng Student so với phần còn lại của nhóm.
Không sửa service recommendation, không coi utility là validation hoặc Group Score.

| Status | Ý nghĩa |
| --- | --- |
| FEASIBLE | Có witness đã qua validator, tất cả Student được phân bổ đúng một lần |
| PROVEN_INFEASIBLE | Có điều kiện cần bị vi phạm, hoặc duyệt hết không gian mà không có witness |
| SEARCH_LIMIT_REACHED | Chưa có witness khi hết ngân sách, vượt giới hạn độ sâu, hoặc bị interrupt |

Nếu có witness nhưng hết ngân sách tối ưu hóa: vẫn FEASIBLE, `searchComplete=false`, có cảnh báo;
không tuyên bố tối ưu toàn cục. Defaults: 100000 node, độ sâu bảo vệ 256 cho pool + draft; đây là giới hạn
xử lý, không phải Business Rule. Có overload SearchLimits để kiểm thử/tinh chỉnh. Node limit bao gồm cả
chọn tập nhóm và gán thành viên. Giới hạn xử lý hiện chưa đo tải production, có thể cần tinh chỉnh sau.

PENDING/ACCEPTED giữ nguyên ID/status/Leader/membership. Nếu protected group vi phạm rules mới,
trả PROTECTED_RULE_WARNING, không âm thầm sửa hoặc duyệt lại. FEASIBLE xác nhận draft được tái phân bổ;
không khẳng định mọi protected group đã đạt cấu hình mới. Dữ liệu cấu trúc sai vẫn bị từ chối.
Nhóm kết quả giữ status OPEN/REVOKED; Phase 2 không submit/approve.


### 4.4. Suggested Count và seed

Nếu toàn bộ draft đã hợp lệ, ưu tiên thử số nhóm hiện tại. Nếu chưa, ưu tiên target gần mức sĩ số trung bình
giữa MIN/MAX đang bật (trừ pool protected), rồi xét target lân cận. Heuristic xếp thứ tự không bảo đảm khả thi.
Chỉ trả suggestedCount khi allocate đã trả FEASIBLE. Reason codes/parameters gồm witness đã kiểm tra,
sĩ số pool/số draft, số nhóm hợp lệ giữ được và số nhóm protected. UI sẽ dịch ở Phase 5.

Tối đa thử 12 target mỗi lần suggest; target chưa được kiểm tra hoặc có search limit làm kết quả không có
suggestion là SEARCH_LIMIT_REACHED, không giả vờ chứng minh vô nghiệm. Chỉ PROVEN_INFEASIBLE nếu
range đã loại hết hoặc toàn bộ target được kiểm tra đều đã chứng minh vô nghiệm.

Seed được trộn bằng SplittableRandom trước khi shuffle để giảm tương quan seed liền nhau.
Cùng snapshot/seed/ngân sách node cho kết quả tái hiện được (trừ trường hợp interrupt).
Seed khác có thể cho phương án khác; không bảo đảm khác nếu phương án tốt chỉ có một.


### 4.5. Kiểm thử và kết quả thực tế

Unit tests dùng validator/scorer thật với Repository mock, không Spring context/datasource/email.
Gồm 9 → 6 nhóm/36 Student, Unassigned, giữ PENDING/ACCEPTED, warning rules protected, giữ và thay Leader,
snapshot scope/membership lỗi, rule tắt/tùy chỉnh, thiếu SE/ngành/người/chỗ, giới hạn target, seed, suggestion,
range có ứng viên nhưng không partition được, budget/depth limit và không sửa input.
Một test đối chiếu 80 bài toán nhỏ với oracle duyệt toàn bộ độc lập để kiểm tra phân loại và pruning.
Test parity so sánh validator snapshot với entry point hiện có qua Repository mock.

Không kiểm thử Apply/concurrency database, authorization HTTP, UI hoặc realtime trong Phase 2 vì chưa triển khai.

Kết quả thực tế: Gradle 9.7.1
`test --tests com.fmaking.service.SmartAllocationServiceTest --tests com.fmaking.service.GroupScoreServiceTest --tests com.fmaking.service.ClassRuleStatusWarningsTest bootJar`
thành công. 28 tests engine + 17 tests scoring + 6 tests hồi quy rule status = 51 tests,
0 failures/errors/skipped. Trong đó một test engine kiểm tra 80 bộ dữ liệu bằng oracle độc lập.
`git diff --check` không báo lỗi whitespace. Chưa chạy toàn bộ Backend suite hoặc test production/end-to-end.


## 5. Phase 3–6 — Bổ sung dần khi triển khai

Backend Phase 3–4 và Frontend Phase 5 đã có như mô tả dưới đây. Phase 6 chưa triển khai.
Khi triển khai phải cập nhật contract, file thực tế, quyết định kỹ thuật, kiểm thử và giới hạn ngay trong tài liệu này.

### 5.1. Phase 3 — Preview, Auto Again & Report APIs

**Đã triển khai Backend.** Phần này ghi nhận Phase 3 ban đầu; phần mở rộng storage/Apply ở mục 5.2.

Prefix: `/api/deadlines/{deadlineId}/classes/{classId}/allocation`.
Response dùng wrapper hiện có, payload nằm trong `data`.

| Method / endpoint | Request | Payload chính |
| --- | --- | --- |
| GET `/overview` | Class/session trong path | scope, snapshotFingerprint, summary, rules, groups, unassignedStudents, warnings |
| GET `/setup` | `seed` optional trong query | scope, snapshotFingerprint, seed, summary, range, suggestion, limits, warnings |
| POST `/preview` | targetGroupCount, seed optional, previousPlanFingerprint optional | scope, snapshotFingerprint, planFingerprint, sameAsPreviousPlan, result, groups, report |

Ví dụ body Preview (không chứa snapshot hoặc assignments do client quyết định):

```json
{
  "targetGroupCount": 2,
  "seed": 42
}
```

- `targetGroupCount`: số nguyên JSON dương, bắt buộc. Từ chối chuỗi, boolean và số thập phân.
- `seed`: số nguyên JSON optional, trong khoảng ±9007199254740991 để React/JavaScript giữ chính xác.
  Không truyền thì Backend sinh seed 53-bit bằng SecureRandom và trả seed thực tế. Engine long/thuật toán không đổi.
- `previousPlanFingerprint`: optional, chuỗi SHA-256 lowercase 64 ký tự; chỉ là hint so sánh phương án cũ,
  không phải bằng chứng quyền, snapshot, token hay input điều khiển assignments.

`Overview`:

- `scope`: classId/name, termId thực tế, lecturerId, rulesVersion, deadlineId/name/status/version,
  startTime và endTime hiệu lực của lớp. Không thay Term thiếu bằng Current Term.
- `summary`: totalStudents, totalGroups (không DISBANDED), unassignedStudents, validGroups,
  invalidGroups và protectedGroups. Validity gồm composition + MIN/MAX_GROUPS đang bật;
  structural membership/Leader đã được kiểm tra riêng trước khi trả dữ liệu.
- Mỗi group có ID/name/status, Leader ID/name, members + Major, protectedGroup,
  Group Score/breakdown, rules và allRulesPassed. RuleView có code/scope GROUP hoặc CLASS,
  actualValue/targetValue/passed/hardRule, không có chuỗi giải thích hardcode VI/EN.
- Score và validation luôn tách biệt; protected group có rule warning vẫn giữ nguyên.

`Setup`: suggestion chỉ có suggestedCount khi engine tìm được witness. Có checkedTargets/reasons,
range và runtime limits; createsNewGroups=false. Lớp rỗng vẫn trả Overview rỗng và Setup không có suggestion.

`Preview`:

- `result` gồm status, targetGroupCount, seed, range, warnings, visitedNodes, searchComplete và optimization.
- Chỉ FEASIBLE có groups sau phân bổ, planFingerprint và report. Hai status còn lại trả groups rỗng,
  planFingerprint/report=null, không giả tạo thống kê After thành công.
- `report` có tổng nhóm/sinh viên trước/sau, Unassigned trước/sau, kept/disbanded/protected IDs,
  createdGroupIds luôn rỗng, movements (Student, từ/đến nhóm, previouslyUnassigned), leaderChanges
  và groupChanges (Leader, Group Score, Rule Validation trước/sau, cờ disbanded/protected).
  Với nhóm đề xuất giải tán, Leader/Score sau không có và rulesAfter rỗng; đây chỉ là mô tả phương án,
  không cập nhật hay xóa Group/Leader trong database.
- Đổi seed rồi gọi lại Preview để Auto Again. Cùng snapshot/seed/ngân sách node tái hiện phương án.
  Nếu previousPlanFingerprint trùng phương án tính lại, sameAsPreviousPlan=true và warning
  SAME_AS_PREVIOUS_PLAN. Không hứa seed mới luôn cho phương án khác.

**Quyền, snapshot và số truy vấn:**

- Resource yêu cầu ROLE_ADMIN/ROLE_LECTURE/ROLE_LECTURE_MASTER; Service dùng requireWriteAccess:
  Lecturer/Master phải là giảng viên phụ trách lớp, Admin theo quyền hiện có. Không dùng quyền đọc rộng của Master.
- Xác minh deadline liên kết đúng lớp và lớp chỉ có một phiên. Dữ liệu lịch sử nhiều phiên hoặc
  membership/Leader mâu thuẫn trả 409, không chọn/xóa/sửa bản ghi tùy tiện.
- Overview/Setup read-only REPEATABLE_READ; Preview cũng tải snapshot REPEATABLE_READ.
  Từ Phase 4, Preview FEASIBLE ghi một bản staging riêng, không ghi Group/Member/history hoặc mutation event.
- Loader dùng projection Student hiện có, tải nhóm và membership theo batch, tải rules một lần;
  số truy vấn không tăng theo số nhóm. Map Student theo ID, không query từng thành viên/nhóm.
- Query membership kiểm tra cả scope lớp/phiên, group IDs và Student IDs trong phiên để bắt dữ liệu
  sai scope thay vì bỏ qua. Kiểm tra count Student phát hiện bản ghi không có User trong projection.
- StudentRow chứa activation credentials, nhưng chỉ map các field hiển thị cần thiết sang DTO;
  không trả password/key/token và không dùng credentials làm dữ liệu fingerprint.

**HTTP / lỗi:** 200 cho kết quả tính toán ở cả ba trạng thái; 400 cho request/path/seed không hợp lệ;
401 chưa đăng nhập; 403 sai role/lớp/phiên; 404 thiếu lớp/deadline; 409 source không nhất quán
(`allocationDataConflict`). Business infeasibility không bị biến thành lỗi HTTP hoặc thông báo “đã lưu”.

**Files:** AllocationResource, AllocationPreviewService, AllocationPreviewRequest, AllocationPreviewDTO,
GroupMemberRepository.findAllocationMemberships, reason SAME_AS_PREVIOUS_PLAN trong AllocationResultDTO,
và AllocationResourceTest. Phase 1–2, các API cũ, lifecycle và Compatibility Score giữ nguyên.

**Kiểm thử Phase 3:** MockMvc với security thật, Repository/JPA trên H2 in-memory riêng;
MailService, NotificationAsyncService và GroupEventPublisher được mock để không gửi mail/event thật.
Kiểm tra quyền Lecturer/Master/Admin/Student/anonymous, scope/404/400/409, Overview/Score/rules,
Setup/range/suggestion, Preview khả thi/vô nghiệm, protected, Before/After report, seed/Auto Again,
fingerprint thay đổi theo Student/Major/membership/Leader/status/rules/version/Term/deadline/override.
Ca SEARCH_LIMIT_REACHED dùng engine thật với node budget giảm bằng test spy, không đổi limits production.
Kiểm tra Hibernate statistics insert/update/delete=0 khi Preview, history không đổi, fingerprint/Overview
không đổi, không gọi event/mail; số prepared statements giữ nguyên khi tăng nhóm từ 3 lên 11.
Kết quả thực tế: Gradle 9.7.1 chạy AllocationResourceTest (33), GroupReviewResourceTest (6),
SmartAllocationServiceTest (28), GroupScoreServiceTest (17), ClassRuleStatusWarningsTest (6) và bootJar
thành công: **90 tests, 0 failures/errors/skipped**. `git diff --check` không báo lỗi whitespace.
Chưa chạy toàn bộ Backend suite, MySQL thực, tải/concurrency production, UI hoặc end-to-end qua trình duyệt.
SQL fixtures/create-drop trong kiểm thử chỉ chạy trên H2 in-memory, không có migration hoặc ghi MySQL local.

### 5.2. Phase 4 — Atomic Apply, Auto Approval & History

**Đã triển khai Backend; chưa triển khai Frontend hoặc chạy migration trên database ứng dụng.**

#### Storage đã được duyệt

Migration: `docs/sql/20261020_allocation_storage.sql`, MySQL 8/InnoDB, chỉ thêm ba bảng:

| Bảng | Dữ liệu và ràng buộc |
| --- | --- |
| allocation_previews | UUID v4 ngẫu nhiên; owner/class/deadline, target/seed, snapshot/plan fingerprints, JSON phương án do server tạo, formatVersion, created/expires/appliedAt và version. TTL 15 phút, không gia hạn. FK owner/class/deadline. |
| allocation_apply_requests | Key SHA-256 theo owner/class/deadline; requestHash ràng buộc key với previewId. Unique(owner_id,school_class_id,deadline_id,key_hash), READY/PROCESSING/FAILED/SUCCEEDED, kết quả JSON, failureCode, version; giữ 30 ngày. FK Preview/owner/class/deadline. |
| allocation_runs | Một run thành công/Preview với unique(preview_id), unique(apply_request_id), actor/scope/target/seed/time/fingerprints và JSON kết quả/report. Giữ lâu dài; FK request nullable ON DELETE SET NULL. |

- Dùng VARCHAR(36) ASCII binary cho UUID, LONGTEXT cho JSON, DATETIME(6) cho thời gian.
  Có 12 foreign keys; không sửa các bảng nghiệp vụ cũ, không tắt FK checks.
- Preview FEASIBLE mới có `previewId`, `createdAt`, `expiresAt`; kết quả infeasible/search-limit không lưu staging.
  Đây là phần bổ sung response Phase 3, request/seed/engine không đổi. Auto Again tạo staging độc lập.
- Preview owner là người đang đăng nhập. Admin cũng không được dùng Preview do người khác tạo.
- Job `AllocationRetentionService.clean` chạy 03:20 theo timezone JVM: bỏ requests hết retention,
  ngắt liên kết run→request, xóa staging chưa dùng đã hết hạn trên 24 giờ nếu không còn reference.
  Payload Preview đã Apply được dọn sau 30 ngày, nhưng metadata/tombstone và unique run→preview giữ lâu dài.
  Vì thế dọn idempotency KHÔNG làm Preview cũ có thể Apply lại.
- Script không tự chọn database/không IF NOT EXISTS để tránh che schema không tương thích.
  Phải duyệt riêng việc chạy trên local/production, backup và kiểm tra schema cha/FK trước deployment.
  Không khởi động Backend với schema update tự động để thay thế migration đã duyệt.

#### API contracts

Prefix không đổi: `/api/deadlines/{deadlineId}/classes/{classId}/allocation`.
Response tiếp tục dùng wrapper `data` của dự án.

| API | Request | Response |
| --- | --- | --- |
| POST `/apply` | Header `Idempotency-Key`: 1–128 ASCII printable không khoảng trắng; JSON `{ "previewId": "UUID" }` | 200 cả lần đầu/retry thành công: runId, previewId, actorId, classId/deadlineId, targetGroupCount/seed/appliedAt, fingerprints, approvedGroupIds, cancelledInvitationIds, report. |
| GET `/history` | Pageable theo convention 1-based của dự án; page size tối đa 100 | meta page/pageSize/pages/total; result gồm runId, previewId, actorId, targetGroupCount, seed, appliedAt. |
| GET `/history/{runId}` | Run ID trong cùng lớp/phiên | Kết quả Apply đã lưu gồm before/after report, movements, leaders, scores/rules và approval/cancellation IDs. |

- Không nhận assignments, Leader hay fingerprint do client quyết định. Chỉ đọc phương án đã lưu phía server.
- Resource yêu cầu Admin/Lecturer/Master; service yêu cầu quyền ghi lớp hiện có, Master không được vượt phân công.
  History theo quyền lớp/phiên, không giới hạn chỉ owner run; Apply bắt buộc owner Preview.
- 400: request/header/UUID thiếu hoặc sai; 401 anonymous; 403 sai role/quyền lớp; 404 Preview thiếu/sai owner/scope,
  run không thuộc scope hoặc resource không tồn tại.
- 409 có error key riêng: `allocationPreviewExpired`, `allocationPreviewUsed`, `allocationPreviewStale`,
  `allocationPreviewInvalid`, `allocationIdempotencyMismatch`, `allocationIdempotencyExpired`,
  `allocationBusy`, `allocationIntegrityConflict`, `allocationPlanConflict` (và lỗi domain hiện có).
  Client phải tạo Preview mới khi stale/expired/used; lỗi hệ thống không được báo Apply thành công.

#### Transaction, locking và idempotency

1. Coordinator không mở transaction ngoài. Xác minh quyền/owner, hash key và request identity.
2. `AllocationApplyRequests.reserve` REQUIRES_NEW ghi key binding READY. Unique conflict được xử lý ngoài
   transaction đã rollback, đọc lại request. Cùng key khác preview bị từ chối, không ghi đè binding.
3. Worker `AllocationApplyService.apply` READ_COMMITTED, clear persistence context đầu transaction
   để không dùng entity cũ từ OSIV/coordinator. Khóa class FOR UPDATE → deadline shared → request FOR UPDATE → Preview FOR UPDATE.
4. Kiểm tra lại quyền, owner/scope/hash và retention. SUCCEEDED trả kết quả đã lưu, không Apply lại,
   kể cả Preview đã hết 15 phút. Request đang chạy được chờ bằng khóa DB; timeout trả conflict, không tự retry.
5. Với request mới/FAILED: kiểm tra Preview chưa dùng, chưa hết hạn, format/version; đặt PROCESSING trong transaction.
6. Khóa Student theo ID, User/Major liên quan shared, Group/Member/Invitation theo ID rồi tải lại snapshot.
   Đối chiếu snapshotFingerprint và planFingerprint/target/scope với phương án stored; không gọi Preview API để Apply.
7. Domain kiểm tra tập Student chính xác, không trùng/thiếu, đúng lớp/phiên, một Leader hợp lệ,
   protected giữ nguyên membership/Leader/status, draft đạt toàn bộ rules bật và target/class rules chính xác.
8. Hủy invitation PENDING của draft bị ảnh hưởng, chuyển membership, giải tán draft không giữ;
   hoàn thiện/duyệt draft qua domain service, ghi histories/run, đánh dấu Preview consumed và request SUCCEEDED.
9. Commit một lần. Mọi exception rollback memberships, status, invitations, Group/Member histories,
   run và trạng thái thành công. Coordinator chỉ ghi FAILED riêng sau rollback; không được ghi đè SUCCEEDED.
   Cùng key có thể retry lỗi transient trong retention nếu Preview vẫn còn hợp lệ, không tự retry phía server.

`GroupService` mutations membership/Leader/Review và `ClassRuleService.saveRules` đã serialize trên class row.
Phase 4 bổ sung cùng khóa class→deadline cho send/accept/reject/cancel invitation; kiểm tra invitation/group
đúng scope trước mutation. Apply dùng cùng scope lock nên không chỉ khóa riêng trong engine.
Các lock Student/User/Major bảo vệ dữ liệu projection bị sửa ngoài GroupService; Deadline shared lock
serialize với cập nhật lịch. Fingerprint v2 gồm pending invitations để lời mời đổi sau Preview cũng gây stale.
Không chỉ dựa Group.version. Nếu một writer mới bỏ qua domain/class lock thì phải tích hợp lại protocol này.

#### Auto-approval, invitations, history và realtime

- Không tạo nhóm mới; tái sử dụng Group ID và membership ID hiện có, bổ sung membership cho Unassigned.
  Không cập nhật legacy Student.groupId. Thành viên được chuyển có history ở nhóm nguồn/đích;
  thay Leader có TRANSFERRED_LEADER history, nhóm bỏ đi dùng lecturerDisbandGroup.
- OPEN/REVOKED được giữ phải đạt rules; gọi lecturerSubmitGroup → acceptGroup trong cùng transaction,
  tận dụng requireCompleteGroup, rules version, status/member history, events và accepted notification hiện có.
  Không gán ACCEPTED trực tiếp. PENDING/ACCEPTED không bị submit/approve lại, kể cả có rule warning cũ.
- Mọi draft trong phương án hoặc bị giải tán đều đổi sang trạng thái không nhận lời mời, vì vậy
  PENDING invitations thuộc các draft đó thực sự bị ảnh hưởng. Hủy bằng helper domain cùng manual cancel,
  lưu status/respondedAt và event; IDs được giữ trong run JSON để truy vết.
  Không hủy invitations ở nhóm protected hoặc ngoài class/session, không sửa lời mời đã phản hồi.
- `GroupEventPublisher` tiếp tục AFTER_COMMIT. Không phát broadcast khi rollback; notification
  theo cơ chế after-commit hiện có. Không triển khai Undo hay ghi Preview/Auto Again như run thành công.

**Files Phase 4:** AllocationPreview/AllocationApplyRequest/AllocationRun và repositories;
AllocationPreviewStore, AllocationApplyCoordinator, AllocationApplyRequests, AllocationApplyService,
AllocationLocks, AllocationHistoryService, AllocationRetentionService, AllocationApplyDTO;
mở rộng AllocationPreviewService/DTO, AllocationResource, GroupService, GroupInvitationService/Repository;
AllocationApplyServiceTest, cập nhật assertion staging trong AllocationResourceTest; migration trên và tài liệu này.

**Kiểm thử:** AllocationApplyServiceTest chạy không có transaction bao ngoài test, kiểm tra commit/rollback thật.
Mail/notification và transport SimpMessagingTemplate được mock; GroupEventPublisher thật để kiểm tra AFTER_COMMIT.
Hỗ trợ opt-in `ALLOCATION_ISOLATED_MYSQL_TEST=true`, endpoint cố định duy nhất
`127.0.0.1:33318/fmaking_allocation_test` trong container disposable, không nhận URL database tùy ý.
Trên MySQL test, thay ba bảng staging rỗng do Hibernate tạo bằng migration thực rồi chạy Apply với 12 FK/unique constraints.
Không chạy script lên MySQL ứng dụng cổng 3307.

**Kết quả thực tế ngày 20/10/2026:**

- Gradle 9.7.1/Java 21: `compileJava` và `bootJar` thành công.
- MySQL 8.4 container test riêng, migration SQL thực với 12 FK và các unique constraints:
  AllocationApplyServiceTest **22 tests, 0 failures/errors/skipped**.
- Hồi quy H2: **213 tests, 17 suites, 0 failures/errors/skipped** gồm Allocation API/Apply,
  engine/score Phase 1–3, Group Session/Concurrency/Invitation/Review/notifications,
  Deadline boundary/lifecycle/class schedule và Class Rules.
- Kiểm tra Apply commit, approved histories, membership/Leader, PENDING/ACCEPTED protected,
  rules disabled, stale membership/Major/rules/status/deadline/invitations, TTL 15 phút,
  owner/Master denial, HTTP validation/security/retry, cùng key/khác payload, hai key cùng Preview,
  retry sau rollback, cleanup sau 31 ngày và Preview đã dùng không replay được.
- Test concurrent dùng hai thread và latch, giữ Apply đang chạy, kiểm tra request thứ hai phải chờ:
  cùng key chỉ trả một run, khác key chỉ một lần thành công; invitation reject và thay Leader
  được serialize rồi bị domain từ chối vì invitation đã hủy/nhóm đã ACCEPTED.
- Inject lỗi approval và ghi history sau khi membership đã được chuyển: toàn bộ status/membership,
  invitations và Group/Member histories rollback, không có run hay realtime thành công.
- Fixture GroupInvitationServiceTest được sửa để dùng ROLE_STUDENT thật thay cho ROLE_USER mặc định
  hoặc authentication không có authority; không hạ kiểm tra quyền production để test pass.
- `git diff --check` không báo lỗi whitespace. Không gửi email hoặc realtime ra người dùng thật,
  không commit/push, không chạy migration hay ghi dữ liệu trên MySQL ứng dụng.

**Giới hạn:** chưa test tải production/multi-node/crash recovery hoặc mọi interleaving mutation;
chưa test trên đúng bản schema dữ liệu MySQL ứng dụng vì không được phép migration ở đó.
MySQL test dùng domain tables do Hibernate dựng và ba bảng allocation từ script đã duyệt.
Realtime/notification dùng cơ chế after-commit hiện có, chưa có transactional outbox bảo đảm phát lại
nếu tiến trình chết sau commit. Tại thời điểm Phase 4 chưa có UI; UI bổ sung ở Phase 5 bên dưới.
Không có Undo; phải duyệt deployment migration trước khi dùng API trên ứng dụng.

### 5.3. Phase 5 — Complete Frontend UI/UX

**Đã triển khai Frontend. Không sửa Backend, schema hoặc chạy migration.**

#### Navigation, quyền và scope

- Route `/lecturer/automatic-allocation` dưới ProtectedRoute/RoleRoute Lecturer hiện có;
  dùng LecturerLayout, Sidebar, Header và TermContext như Group Review/Group Management.
- Thêm menu Automatic Allocation / Phân bổ tự động. Lecturer Master dùng cùng route;
  danh mục lớp chỉ giữ lớp có lecturerId=user.id (Admin theo quyền hiện có).
  Không lấy quyền xem toàn hệ thống của Master làm quyền Apply.
- Chọn lớp trong Term đang chọn; danh sách lớp có phân trang được lấy đầy đủ qua classApi.
  Class ID trong URL chỉ được dùng nếu nằm trong danh sách được phép và đúng Term.
  Khi đổi Term/Class, remount workflow, không tái sử dụng Preview cũ dưới scope mới.
- Tìm phiên qua deadlineApi hiện có, lọc đúng classId; 0 phiên trả empty state, nhiều phiên chặn phân bổ.
  Không tự chọn một phiên lịch sử. Không thêm termId vào Allocation API vì scope đã nằm trong path.

#### Trang và dữ liệu

- Bốn step cards giới thiệu; không tự tính Preview hoặc Apply khi mới mở trang.
- Overview hiện toàn bộ nhóm, metrics, rules đang bật, protected badge, Leader, members/Major,
  Group Score và breakdown; score và validation hiển thị riêng. Members/rules/score dùng Collapse
  để không dồn quá nhiều thông tin. Không có nút sửa nhóm protected.
- Auto Allocate mở Setup: preliminary range, suggestion chỉ coi verified khi status FEASIBLE,
  reasons/parameters dịch VI/EN, protected count và search limits. Không hứa mọi target trong range khả thi.
- Target chỉ nhận chữ số, kiểm tra số nguyên an toàn/dương và bounds Backend; không dùng min/max hardcode.
  Gợi ý FEASIBLE có thể điền mặc định; không có suggestion đã xác nhận thì yêu cầu tự nhập.
- Tự gọi Preview sau debounce 450ms. AbortController và generation guard loại bỏ response cũ
  khi thay target/unmount. Preview không gọi mutation APIs để giả lập phương án.
- Hiển thị riêng current saved data và proposed data, ba trạng thái FEASIBLE/PROVEN_INFEASIBLE/
  SEARCH_LIMIT_REACHED, warnings, countdown từ expiresAt Backend. Chỉ FEASIBLE còn hạn, đúng target,
  chưa stale và dữ liệu đọc không đang lỗi/refetch mới mở Apply.
- Auto Again giữ target, sinh seed mới 53-bit qua Web Crypto và gửi previousPlanFingerprint;
  cùng phương án có cảnh báo, không bảo đảm luôn có phương án khác. Preview mới dùng expiration mới.
- Before/After report có groups/students/Unassigned, kept/disbanded/protected, movements, Leader changes,
  Group Score và Rule Validation trước/sau; các bảng dài có pagination nội bộ/horizontal scroll.

#### Apply và phục hồi kết quả không rõ

- Confirmation Modal tóm tắt target, kept/disbanded, movements, Leader changes và số nhóm auto-approve;
  cảnh báo không Undo. Chỉ bấm Confirm mới gọi Apply.
- Tạo UUID Idempotency-Key một lần khi bắt đầu xác nhận. Gửi đúng `{previewId}` và header,
  không gửi assignments hoặc Leader. Ref guard chặn double-click đồng bộ; không cấu hình retry tự động.
- Trong lúc Apply, khóa Term selection và Class control, disable thao tác tạo phương án mới.
- Lưu previewId/key/target của request đang xử lý vào sessionStorage theo user/class/deadline;
  không lưu assignments/token. Unknown outcome hoặc allocationBusy giữ nguyên request và key để retry,
  kể cả sau refresh. Nếu storage bị chặn thì vẫn giữ trong bộ nhớ trong phiên trang hiện tại.
- Có recovery warning và nút Retry same request; không tự báo thất bại hay tự tạo key mới khi chưa rõ kết quả.
  Có thể xem History để đối chiếu. Retry dùng đúng key cho cả Preview đã hết hạn nếu request trước đã thành công,
  theo contract Backend. Không lấy countdown làm lý do bỏ khả năng retry request chưa xác minh.
- Stale/expired/used và các lỗi xác định hiển thị error-code đã dịch; bỏ khả năng Apply phương án cũ.
  API 200 nhưng body thiếu/sai runId/previewId/scope/approval/report cũng được coi unknown outcome,
  không phát toast thành công giả.
- Apply thành công: hiện runId/approval count, clear recovery reference, invalidate Allocation queries và
  syncDeadlineQueries để Group Board/Review/Student Profile đọc lại dữ liệu thật. Refresh lỗi không biến
  một lần Apply đã commit thành báo lỗi thất bại.
- Subscribe topics nhóm và deadline bằng RealtimeProvider sẵn có; refetch Allocation data khi nhận sự kiện.
  Fingerprint Overview đổi làm Preview stale. Backend vẫn là nguồn kiểm tra cuối cùng trước ghi.

#### History và giới hạn contract hiện có

- GET history dùng pagination 1-based Backend; mở Drawer gọi GET history/{runId} theo nhu cầu,
  hiện report và số nhóm được auto-approve. Không tải detail từng row để tạo N+1 requests.
- List API chỉ có actorId/target/time, không có actorName/approval counts/report summary.
  Tài khoản đang đăng nhập hiển thị tên/email đã biết; actor khác hiển thị tham chiếu tài khoản thật,
  không giả tên hoặc gọi API Admin ngoài quyền. Số nhóm duyệt/thống kê thay đổi nằm trong Drawer detail.
  Nếu cần thêm các cột đó ngay ở list, cần duyệt mở rộng Backend contract ở giai đoạn sau.

#### UI, i18n và files

- Ant Design Select/Input/Modal/Drawer/Tabs/Table/Collapse/Progress/Alert; components PageHeader,
  TermScope và providers có sẵn. CSS chỉ giới hạn trong allocation; dùng tokens xanh/trắng/trung tính hiện tại.
- ConfigProvider locale chỉ bọc trang mới, đổi VI/EN cả labels, warnings, errors và điều khiển Ant Design.
- Responsive: steps 4→2→1, metrics 6→3→2, group cards tự chia cột, form 3→2→1;
  bảng cuộn ngang bên trong, các tên dài wrap. Form có labels/aria và các controls dùng keyboard hỗ trợ bởi AntD.
- Files mới: `Client/src/pages/lecturer/LecturerAllocationPage.tsx/.css`;
  `Client/src/features/allocation/types.ts`, `utils.ts`, `api/allocationApi.ts`, `hooks/useAllocationFlow.ts`,
  `components/AllocationGroups.tsx`, `AllocationReport.tsx`, `AllocationHistory.tsx`.
- Files tích hợp: `app/router/routes.tsx`, `components/layout/Sidebar.tsx`, `locales/en.json`, `locales/vi.json`.
  Tests dùng fixtures riêng trong src/test, không có mock/fallback dữ liệu trong production source.

#### Kiểm thử và giới hạn Phase 5

- Unit/component tests theo Vitest/Testing Library hiện có: DTO fixtures chỉ dành cho tests;
  kiểm tra no-auto-mutation-on-mount, Preview/Auto Again/debounce/cancellation, target bounds,
  infeasible/search limit, TTL, double-click, stable key/refresh recovery, stale/busy, scope/quyền Master,
  Sidebar active, realtime invalidation, confirmation, History detail và chuyển VI/EN.
- allocationApi.test chạy qua Axios instance/interceptors thật bằng adapter in-memory:
  xác minh wrapper, tất cả sáu endpoints, params pagination, signal, Idempotency-Key và body Apply tối thiểu;
  response 200 sai contract không được báo thành công.
- Không khởi động Backend, không chạy migration hay Apply vào MySQL ứng dụng. Chưa kiểm thử end-to-end
  với Backend chạy thật, chưa kiểm tra trực quan trên browser/mobile; responsive được triển khai bằng CSS,
  component tests chạy jsdom không thay thế kiểm tra kích thước/layout thực.
- TypeScript/Vite build thành công (`npm run build`, gồm `tsc -b`); lint theo script dự án là Oxlint,
  exit 0, không có lỗi. Còn 13 warnings ở code có sẵn, không có warning trong module allocation mới.
  Vite cảnh báo main bundle khoảng 2.40 MB minified (729 KB gzip), chưa tối ưu bundle ngoài phạm vi.
- `npm test -- --maxWorkers=2`: toàn bộ **347 tests/37 files passed**, gồm regression Group Review,
  Group Management drag/drop/create, role routing, profile, imports và i18n.
  Bổ sung test fallback UUID cho môi trường LAN, chạy lại bộ Allocation/API/i18n cuối: **30 tests/3 files passed**.
  Không cộng các lượt test trùng nhau thành số test riêng biệt.
- Full suite với số workers mặc định từng timeout 5 giây ở test UI mới hoặc test LecturerGroupCreation
  có sẵn khi chạy song song nhiều jsdom/AntD instances. Chạy 2 workers đã qua; không sửa/bỏ assertion
  hay chỉnh business logic của Group Management để làm test pass. Test UI tích hợp mới có budget 15 giây.
  jsdom còn warning getComputedStyle pseudo-elements; code AntD cũ có deprecation warnings.
- `git diff --check` không có lỗi whitespace. Không thêm dependency, không commit/push, dừng trước Phase 6.

### 5.4. Phase 6 — Integration, Testing & Polish

- Kiểm thử end-to-end, nhiều lớp/phiên, quyền, rules bật/tắt, protected groups và ACTIVE/EXPIRED.
- Kiểm tra Auto Again, auto-approval, conflict/rollback, history và realtime.
- Build/tests, UI/UX và báo cáo giới hạn thực tế trước demo/nghiệm thu.

## 6. API Contracts, Database, Concurrency và lưu ý kỹ thuật

### 6.1. Thành phần hiện có được tái sử dụng

- `GroupService`: draft OPEN/REVOKED, review PENDING, khóa ACCEPTED; Lecturer được quản lý sau EXPIRED.
- `SchoolClassAccessService`: Admin hoặc giảng viên được phân công có quyền ghi, không mở rộng Master.
- `GroupMember`: nguồn membership chuẩn, unique(student_id, deadline_id).
- `GroupService.lecturerMoveMember`: transaction và khóa hiện có; không dùng nhiều HTTP calls để Apply.
- `GroupEventPublisher`: realtime AFTER_COMMIT; history nhóm/thành viên hiện có được giữ.
- `GroupRecommendationService`: scoring ứng viên riêng, không sửa hoặc dùng làm Group Score.
- FE: `groupApi`, `useGroupBoard`, Review, Sidebar, TermContext và i18n giữ nguyên trong Phase 1–3.


### 6.2. API contracts và fingerprint

Overview/Setup/Preview đã có trong Phase 3, contract chi tiết ở mục 5.1.
Apply/History đã triển khai trong Phase 4, contract và transaction chi tiết ở mục 5.2.

Fingerprint phải gồm class/session, tập Student và Major, membership, Leader, status, rules/version,
deadline/version và thời hạn theo lớp; chỉ Group.version không đủ vì membership có thể đổi độc lập.
Phase 3 dùng v1; Phase 4 dùng SHA-256 payload `allocation-snapshot-v2` thêm pending invitations.
Payload chuẩn hóa: nhóm sort ID, membership sort Student ID,
Student sort ID, rules theo enum; scope chứa lecturerId/termId/rulesVersion và lịch hiệu lực theo lớp,
payload thêm stored deadline status/base endTime, dữ liệu Student/Major và Group version/membership metadata.
planFingerprint là SHA-256 của snapshotFingerprint + assignments chuẩn hóa (group/status/Leader/member IDs),
không gồm seed hoặc thứ tự tìm kiếm để nhận biết cùng phương án.

Hash không phải chữ ký/Apply token. Phase 4 dùng UUID Preview tham chiếu server-side storage,
kiểm tra owner/scope/TTL, đối chiếu dữ liệu thật và domain validation trong transaction.
Invitation mutations đã dùng cùng class/session locking với Apply; domain auto-approval giữ history/events.


### 6.3. Database và bảo mật tích hợp

- Phase 1–3 không thêm bảng/cột, migration hoặc ghi dữ liệu thật; snapshot engine không phải HTTP contract.
- Phase 3 tải dữ liệu bằng application layer theo quyền `SchoolClassAccessService`, scope lớp/phiên
  và nguồn membership chuẩn như `GroupService`; không tin snapshot hoặc userId do client tùy ý cung cấp.
- Schema ba bảng allocation đã được duyệt, có script và đã kiểm tra trên MySQL test riêng.
  Chưa được phép áp dụng lên MySQL local/production; cần phê duyệt riêng trước khi deployment.
- Phase 4 kiểm tra lại toàn bộ snapshot và quyền trước ghi; không Apply bằng nhiều mutation HTTP riêng lẻ.
- Các kết quả test ghi ở Phase 1–3 là bằng chứng ở thời điểm triển khai các phase đó, không phải xác nhận
  lại production/runtime hoặc các phase chưa triển khai. Không gửi email thật trong kiểm thử.
