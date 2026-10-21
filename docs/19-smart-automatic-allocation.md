# Smart Automatic Allocation — EXE101 F-Group Making

Tài liệu kỹ thuật thống nhất cho Smart Automatic Group Allocation. Từ Phase 3 trở đi, chỉ cập nhật
file này; không tạo tài liệu Markdown riêng cho từng phase.

## 1. Tổng quan tính năng và luồng nghiệp vụ đã chốt

Mục tiêu là hỗ trợ giảng viên đánh giá nhóm và phân bổ toàn bộ sinh viên trong đúng lớp/phiên,
ưu tiên giữ nhóm hợp lệ, Leader và hạn chế di chuyển. Group Score không thay thế Business Rules.

Luồng sản phẩm đã chốt (không đồng nghĩa toàn bộ đã triển khai):

**Cập nhật nghiệp vụ mới sau Phase 6A:** mục 8 thay thế cơ chế tự Preview khi nhập target,
TTL Preview 15 phút và retention payload ở các mục Phase 1–5 bên dưới. Các kết quả test cũ được giữ
như bằng chứng lịch sử, không phải mô tả chính sách hiện hành.

```text
Danh sách lớp theo Selected Term (mặc định Current Term) → chọn lớp/phiên → xem nhóm, rules và Group Score
→ Auto Allocate → xem range/suggestion, nhập target → Xác nhận
→ Random lưu phương án vào history, không sửa nhóm thực tế → xem Before/After report
→ Random Again lưu phương án mới, hoặc đổi target và xác nhận lại
→ có thể mở phương án đã lưu trong History mà không Random lại
→ Apply → xác nhận → kiểm tra lại dữ liệu/quyền/rules
→ lưu nguyên tử, auto-approve draft tham gia phương án
→ history và realtime sau commit
```

Hiện đã triển khai foundation Phase 1–2, Overview/Setup/Preview Phase 3, Backend Apply/History Phase 4
và Frontend Automatic Allocation Phase 5. Phase 6A đã audit read-only môi trường local ngày 20/10/2026;
chưa chạy E2E Apply trên ứng dụng thật. Kết quả readiness được ghi ở mục 7.
Không tự chạy phân bổ khi mở trang hoặc nhập target; Random/Random Again chỉ lưu phương án, không sửa dữ liệu nhóm thực tế.

## 2. Quyết định nghiệp vụ và giới hạn phiên bản đầu

- Chỉ giữ/gộp nhóm hiện có trong phiên bản đầu; không tự tạo nhóm mới.
- Target là tổng nhóm không DISBANDED, gồm cả PENDING/ACCEPTED được bảo vệ.
- OPEN/REVOKED được tái cơ cấu theo quyền hiện có; PENDING/ACCEPTED giữ nguyên.
- Nhóm tái phân bổ phải đạt toàn bộ rules đang bật trước khi auto-approve.
- Không thay đổi rules, Compatibility Score hoặc lifecycle của các luồng hiện tại.

- Không có Undo ở phiên bản đầu. Random History lưu mỗi FEASIBLE; audit Apply chỉ ghi khi Apply thành công.
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

## 7. Phase 6A — Integration Readiness Audit (20/10/2026)

### 7.1. Phạm vi và bằng chứng môi trường

- Đối chiếu source hiện tại tại HEAD `c4f11fe`; working tree sạch tại lần kiểm tra cuối trước cập nhật tài liệu này.
  Không sửa Backend/Frontend/configuration/SQL, không khởi động lại Backend, không chạy Preview/Apply/migration.
- Java runtime Temurin 21.0.6, source Spring Boot 3.5.14/toolchain 21; Java process đang nghe cổng 8080.
  Frontend Vite đang nghe 3000, Node 24.12.0; source React 19.2.8, TypeScript ~6.0.2, Ant Design 6.6.6.
- Docker `mysql-fgroup-making-local`, MySQL **8.0.46**, host 3307, database `fgroup-making`;
  Redis `redis-fgroup-making-local` cổng 6379 trả `PONG`. FE GET `/` trả 200; SockJS `/ws/info` trả 200.
  Đây là bằng chứng reachability, không chứng minh authenticated subscription hay nghiệp vụ hoạt động end-to-end.
- GET allocation Overview không đăng nhập trả 401 đúng kỳ vọng; không đăng nhập lấy JWT trong audit này.
  Chưa xác minh response JSON có quyền trên runtime hoặc active profile/environment của Java process.
- Source `application.properties` vẫn có `ddl-auto=update`, `createDatabaseIfNotExist=true`,
  `hibernate.schema_management_tool.halt_on_error=false`. Command line Java không có override DDL/profile tường minh;
  không suy ra toàn bộ cấu hình hiệu lực từ source hoặc command line. Không restart ứng dụng mặc định để audit.
- MySQL InnoDB, schema/server utf8mb4 / utf8mb4_0900_ai_ci, thời gian DB hiện là UTC;
  isolation mặc định REPEATABLE-READ, lock wait timeout 50 giây. Apply khai báo READ_COMMITTED riêng.
- `mysqldump` 8.0.46 có sẵn; ổ F còn khoảng 153 GiB. Chưa tạo backup, checksum hoặc restore-test ở Phase 6A.
  Dữ liệu MySQL là bind mount `server/mysql_data`; copy thư mục đang chạy không thay thế logical backup nhất quán.

### 7.2. Migration readiness: chưa được chạy script nguyên bản

Ba bảng đã tồn tại, mỗi bảng có **0 bản ghi** tại thời điểm SELECT. Không khẳng định ai/cơ chế nào đã tạo bảng.

| Hạng mục | MySQL local thực tế | Script `20261020_allocation_storage.sql` |
| --- | --- | --- |
| Bảng/index | Đủ 3 bảng, PK, các index/unique chính đã có | Ba CREATE TABLE, không IF NOT EXISTS |
| Foreign key | Không có FK trên cả 3 bảng | 12 FK; run → request có ON DELETE SET NULL |
| CHECK | Không có CHECK trên cả 3 bảng | 4 CHECK: target Preview/Run, expiry, request status |
| UUID/hash | VARCHAR utf8mb4_0900_ai_ci | ASCII/ascii_bin |
| Request status | Native ENUM | VARCHAR(20) + CHECK |
| Defaults | version và format_version không có DEFAULT tương ứng | version=0, format_version=1 |

Khóa cha tương thích: `users.id` BIGINT signed, `school_classes.id` và `deadlines.id` INT signed,
đều có PK và dùng InnoDB. MySQL 8.0.46 hỗ trợ CHECK thực thi. Unique idempotency theo
owner/class/deadline/key_hash và unique run theo preview/request hiện có; không thay thế các FK còn thiếu.

**NO-GO chạy nguyên bản:** CREATE TABLE sẽ gặp bảng đã tồn tại. Cần phê duyệt phương án reconciliation riêng,
ưu tiên ALTER giữ dữ liệu; không tự DROP/tạo lại dù hiện bảng trống. Kiểm tra lại dữ liệu/orphans/index/collation
ngay trước thay đổi vì runtime vẫn có thể ghi staging/retention. Chuyển collation khóa tham chiếu phải đồng bộ
cả cột cha/con trước khi thêm FK. Native ENUM cũng cần được đối chiếu khi chọn DDL override cho Hibernate.

MySQL DDL implicit commit: không hứa ROLLBACK transaction sẽ hoàn tác toàn bộ migration nhiều bảng.
Cần backup nhất quán, checksum, rehearsal trên bản restore riêng, kế hoạch khôi phục và xác minh từng constraint.
Trước restart/deployment phải duyệt cấu hình ngăn Hibernate tự sửa schema (ví dụ override ddl-auto=none;
không tự dùng validate khi chưa kiểm tra mapping ENUM/VARCHAR). Không thay đổi các cấu hình này trong audit.

### 7.3. API integration contracts và các điểm cần xử lý

Prefix chung: `/api/deadlines/{deadlineId}/classes/{classId}/allocation`.

| API | Contract BE ↔ FE đã đối chiếu source | Runtime xác minh trong Phase 6A |
| --- | --- | --- |
| GET /overview | Scope, fingerprint, summary, rules, groups, Unassigned khớp types FE | Anonymous 401; chưa đọc có quyền |
| GET /setup | seed optional; range/suggestion/limits/reasons khớp | Chưa gọi |
| POST /preview | targetGroupCount, seed?, previousPlanFingerprint?; result/groups/report/previewId/timestamps khớp | Không gọi vì FEASIBLE ghi staging |
| POST /apply | Chỉ previewId + Idempotency-Key; ApplyDTO khớp; retry trả 200 | Chỉ OPTIONS, không POST |
| GET /history | page 1-based, size 10; wrapper meta/result khớp | Chưa gọi có quyền |
| GET /history/{runId} | ApplyDTO chứa report chi tiết khớp | Chưa gọi có quyền |

- Wrapper thành công `statusCode/message/data` được Axios unwrap; lỗi >=400 xử lý riêng. Resource gate
  ADMIN/LECTURE/LECTURE_MASTER không thay thế `SchoolClassAccessService.requireWriteAccess`: chỉ Admin hoặc
  giảng viên thực sự được phân công có quyền; Master không mặc nhiên có quyền lớp. Preview còn ràng buộc owner.
- TTL 15 phút do Backend tạo; FE đọc expiresAt, giữ cùng key khi outcome unknown/busy, không gửi assignments.
  Date/time DTO dùng Instant; cần E2E kiểm tra serialization ISO và UTC → giờ địa phương thực tế.
  Countdown FE dùng Date.now nên lệch đồng hồ client có thể lệch UI; Backend vẫn kiểm tra expiry độc lập.
- **CORS mismatch đã xác minh runtime:** preflight từ localhost:3000 yêu cầu
  authorization/content-type/idempotency-key trả 200 nhưng Allow-Headers chỉ authorization/content-type.
  `CorsConfig` chưa cho phép Idempotency-Key. Browser gọi trực tiếp khác origin sẽ chặn Apply;
  Vite proxy cùng origin hiện tại tránh preflight này. Cần sửa tối thiểu sau phê duyệt, không sửa trong audit.
- **Reconnect recovery gap:** hook allocation có invalidate khi nhận group/deadline events, nhưng
  `features/deadline/realtime.ts` chưa đưa `allocation`/`allocation-sessions` vào danh sách resync dùng bởi
  RealtimeProvider khi reconnect/focus/online; QueryProvider tắt refetchOnWindowFocus. Có thể giữ Overview cũ
  sau khi bỏ lỡ event. Fingerprint khi Apply vẫn bảo vệ dữ liệu, nhưng cần kiểm thử/sửa recovery UX trước demo.
- History summary chỉ có actorId và metadata cơ bản, không có actorName hay counts; FE lấy counts trong detail
  và không bịa tên người khác. Đây là giới hạn contract đã có, không phải lỗi field mapping.
- HTTP timeout FE 30 giây ngắn hơn DB lock timeout 50 giây: test outcome-unknown/retry cùng key bắt buộc.
  AFTER_COMMIT realtime là best-effort, không có outbox đảm bảo phát lại sau lỗi transport.

### 7.4. Dữ liệu hiện tại và an toàn khi E2E

- SELECT đếm chính xác: 652 Student, 17 Class, 1 Deadline; 3 Group gồm 1 OPEN và 2 DISBANDED;
  2 GroupMember, 0 invitation, không có PENDING/ACCEPTED. Không thấy Student thiếu User/Class/Major,
  membership sai lớp/phiên hoặc leader ngoài membership trong các kiểm tra integrity đã thực hiện.
- Chỉ class 17 `EXE101_G102` có phiên (deadline 3), thuộc FALL26, 2 Student (ENG=1, SE=1),
  lecturer User 141 có ROLE_LECTURE và activated=true. Chưa test đăng nhập/quyền bằng account runtime.
- Deadline 3 lưu ACTIVE nhưng effective end là **16/10/2026 17:10 giờ Việt Nam**, override NULL;
  tại thời điểm audit 20/10 đã hết hạn theo thời gian. Không dùng stored status để kết luận còn mở.
- Class 17 bật cả 7 rules: members 4–6, majors 2–6, SE tối thiểu 1, groups 1–50.
  Chỉ 2 Student nên không có happy-path phân bổ hợp lệ với rule hiện tại; các lớp khác chưa có phiên.
  Cần fixture riêng, không giảm rule hoặc thêm Student vào ứng dụng thật để ép demo thành công.
- **Apply auto-approval có thể gửi email thật:** GroupReviewNotificationService AFTER_COMMIT gọi
  NotificationAsyncService → MailService cho thành viên nhóm ACCEPTED. Source SMTP đang dùng Gmail.
  E2E phải cô lập mail transport/mock/test recipients trước khi Apply; audit không gửi email.

### 7.5. E2E test matrix chuẩn bị — chưa thực thi ở Phase 6A

| Kịch bản | Kiểm chứng cần đạt | Cách chạy tiếp theo |
| --- | --- | --- |
| Lecturer đúng/sai lớp; Master assigned/unassigned; Admin; Student/anonymous | Đúng quyền từng endpoint, không lộ Preview owner khác | API integration + MySQL test riêng |
| Term/Class/Deadline sai scope, không có phiên, nhiều phiên legacy | Không fallback scope; FE empty/conflict rõ | API + component + browser |
| Rules bật/tắt, thiếu Major/SE/chỗ; target ngoài range | Validation không đổi; FEASIBLE có witness; không nhầm range với feasibility | Unit engine + API |
| OPEN/REVOKED, PENDING/ACCEPTED, Unassigned | Draft được tái cơ cấu; protected bất biến; đủ đúng một membership | Integration + SQL assertions test DB |
| ACTIVE/EXPIRED và override theo lớp | Lecturer được phân bổ đúng lifecycle; Student không mở quyền ngoài hạn | Integration regression |
| Preview/Auto Again/cùng seed/đổi target nhanh | Không đổi domain; staging riêng; response cũ bị bỏ; phương án trùng có cảnh báo | API + component + browser |
| TTL, sai owner, preview used/missing; browser clock skew | Lỗi riêng; Backend expiry chuẩn; countdown phù hợp | Clock tests + API + browser |
| Happy Apply và auto-approval | Draft đạt rules ACCEPTED, audit đúng một lần; protected không đổi | MySQL integration + browser test riêng |
| Invitation bị ảnh hưởng/không ảnh hưởng/protected | Chỉ PENDING bị ảnh hưởng bị hủy; audit cùng transaction | MySQL integration |
| Cùng key retry/khác payload; hai key/cùng Preview; hai giảng viên | Một run, không duplicate membership/history; conflict/replay đúng | MySQL concurrent requests |
| Stale membership/Leader/Major/rules/deadline/status/invitation | 409, không Apply một phần, yêu cầu Preview lại | MySQL concurrent integration |
| Lỗi giữa move/approval/history; timeout/mất response | Rollback toàn bộ; không realtime/email thành công trước commit; retry cùng key | Failure injection test DB + browser network |
| Retention 30 ngày | Retry đúng contract; Preview đã dùng không Apply lại sau cleanup; Run giữ lâu dài | Controlled-clock MySQL integration |
| History pagination/detail, scope, Before/After | Summary/detail khớp dữ liệu đã commit, không ghi run cho Preview | API + browser |
| Realtime 2 tabs, disconnect/reconnect/focus/online | Workspace/Review/Allocation đồng bộ; không sót refresh sau mất kết nối | Browser thủ công/automation |
| CORS same-origin proxy và direct API | Authorization và Idempotency-Key được browser chấp nhận | OPTIONS + browser |
| VI/EN, keyboard, dialogs, responsive | Không lộ translation key; focus/loading/empty/error đúng; không tràn layout | Component + kiểm tra trực quan desktop/tablet/mobile |

Các tests/build ở Phase 1–5 là bằng chứng lịch sử, không được coi là rerun Phase 6A.
Lượt này chỉ SELECT/metadata, source/diff, Redis PING, GET/OPTIONS không mutation; không chạy suite ghi test DB
hoặc trình duyệt E2E, không chứng nhận responsive hay Apply runtime đã pass.

### 7.6. Các bước cần phê duyệt trước khi tiếp tục

1. Duyệt sửa CORS và recovery invalidation trong phạm vi nhỏ, rồi chạy lại regression FE/BE phù hợp.
2. Duyệt chuẩn bị SQL reconciliation theo schema thực tế và runtime DDL override; review script trước khi áp dụng,
   không chạy lại ba CREATE nguyên bản. Không thay đổi Group Lifecycle/rules hay các bảng nghiệp vụ khác.
3. Duyệt cửa sổ dừng writer/scheduler, logical backup `mysqldump --single-transaction` kèm routines/triggers/events,
   kiểm tra exit code/nội dung/checksum và restore rehearsal trên MySQL 8 riêng. Chưa có backup đã xác thực.
4. Duyệt migration đã rehearsal cho đúng MySQL local 3307, kiểm tra lại bảng trước thao tác, hậu kiểm 12 FK,
   4 CHECK, indexes/collations và dữ liệu không đổi. MySQL production không thuộc phạm vi.
5. Duyệt môi trường E2E riêng với fixture Class/Deadline/Student/protected/invitation và SMTP cô lập;
   chạy các ca có ghi/Apply/concurrency tại đó. Không dùng MySQL ứng dụng thật cho test mutation.
6. Sau khi các blocker được xử lý, kiểm tra browser với Backend thật, report từng ca pass/fail và giới hạn;
   mọi Apply lên dữ liệu ứng dụng thật vẫn cần phê duyệt riêng. Dừng sau Phase 6A.

## 8. Cải tiến Allocation — cân bằng, lịch sử Random và list/detail

### 8.1. Quyết định được xác nhận

- **Chênh lệch tối đa 1 sinh viên**, áp dụng toàn bộ nhóm kết quả, bao gồm PENDING/ACCEPTED.
  6/7 hợp lệ; 5/7 không hợp lệ. Đây là ràng buộc riêng của Allocation, không sửa rule tạo/join thủ công.
- PENDING/ACCEPTED bất biến; chỉ giữ/gộp OPEN/REVOKED, không tạo nhóm mới. Giữ ưu tiên tối ưu và Group Score.
- Nhập target không chạy Random. Chỉ nút Xác nhận hoặc Random Again mới tạo phương án.
- Mỗi kết quả FEASIBLE lưu một bản riêng, kể cả trùng assignments lần trước; infeasible/search-limit không lưu
  như phương án thành công. Xem lịch sử không tính toán lại assignments, không mutation nghiệp vụ.
- **Bỏ hoàn toàn cửa sổ Apply/countdown 15 phút.** Phương án và payload lưu lâu dài; mọi Apply vẫn kiểm tra
  quyền, owner, scope, fingerprints, trạng thái, rules, balance và dữ liệu thực tế trong transaction.
- Danh sách đầu là **lớp được phân công theo Term**, không phải danh sách nhóm. Current Term mặc định
  và lựa chọn Term dùng chung tiếp tục do TermContext quản lý; không ép ghi đè lựa chọn đã lưu.

### 8.2. Feasibility và search

Với S tổng Student (gồm cả protected) và T target: mọi nhóm phải có sĩ số floor(S/T) hoặc ceil(S/T).
Protected có kích thước ngoài hai giá trị này làm target không khả thi ngay trước search.
Bounds cho draft là giao của khoảng cân bằng với MIN/MAX_MEMBERS và các minimum suy ra từ Major/SE.
Kiểm tra tổng sức chứa/thiếu người, coverage ngành và số SE như trước; khoảng sơ bộ tiếp tục không phải
cam kết mọi target bên trong khả thi. Search dùng bounds cân bằng ngay lúc thêm người và pruning canComplete.
Mã lý do `BALANCED_SIZE_CONFLICT` có bản dịch VI/EN; hết budget vẫn là SEARCH_LIMIT_REACHED.
Apply kiểm tra lại `AllocationBalancePolicy` trước khi hủy invitation hay ghi membership/approval.

### 8.3. Storage, API, retention và tương thích

Không cần migration/bảng/cột mới: tái sử dụng `allocation_previews` làm kho phương án Random lâu dài.
`allocation_runs` tiếp tục là audit Apply thành công riêng; unique(preview_id), row lock và applied_at
ngăn áp dụng hai lần kể cả sau khi idempotency records bị dọn. Idempotency retention vẫn 30 ngày.

Cột legacy NOT NULL `expires_at` giữ cách ghi cũ để tương thích schema/script đã có, nhưng **không còn được
dùng làm điều kiện Apply hay dọn dữ liệu**. DTO mới trả expiresAt=null; Frontend không đọc countdown.
Không sửa DDL hoặc script migration nền trong đợt này. Payload đã bị phiên bản cũ dọn không thể khôi phục
từ không khí: history list đánh dấu available=false, giữ nguyên Apply audit nếu có.

Prefix: `/api/deadlines/{deadlineId}/classes/{classId}/allocation`.

| Endpoint | Hành vi |
| --- | --- |
| POST /preview | Contract input giữ nguyên; FEASIBLE lưu bản Random mới, trả previewId/createdAt và expiresAt=null |
| GET /plans?page=1&size=10 | Random history: planId, actorId/actorName, createdAt/appliedAt, targetGroupCount, seed, totalStudents, status, available, canApply, invalidReason |
| GET /plans/{planId} | `{summary, preview}`; khôi phục đúng payload có nhóm/thành viên/Leader/score/rules/report đã lưu |
| POST /apply | Giữ previewId + Idempotency-Key; không nhận assignments, không giới hạn tuổi phương án |
| GET /history và /history/{runId} | Giữ nguyên audit Apply cũ, không thay endpoint hoặc xóa dữ liệu |

Trạng thái phương án là APPLIED nếu applied_at đã có, INVALID nếu live fingerprint không khớp,
dữ liệu live mâu thuẫn, payload không đọc được hoặc vi phạm cân bằng; còn lại UNAPPLIED.
canApply còn yêu cầu đúng owner và quyền quản lý hiện tại. Trạng thái live được tính khi đọc, không ghi
đè payload lịch sử; Apply kiểm tra lại nên kết quả đọc không phải bảo đảm tránh race.
Danh sách tải một snapshot live cho cả page và bulk load actor names, không Random lại hay N+1 theo từng phương án.
Live membership mâu thuẫn vẫn cho đọc lịch sử hợp lệ trong đúng scope, nhưng không cho Apply.

### 8.4. Frontend và navigation

- `/lecturer/automatic-allocation`: class cards, search, pagination 9 lớp/trang; chỉ hiện lớp assigned theo Term.
  Dùng Class API hiện có (tên/Term/studentCount); chưa có groupCount hoặc allocation status trong Class DTO nên không bịa số.
- `/lecturer/automatic-allocation/:classId`: trực tiếp/refresh được, kiểm tra lại catalog và session; Back trở về list.
  Giữ tương thích link query classId/termId cũ bằng redirect khi Term khớp, không đổi Group Management/Review routes.
- Setup chỉ gợi ý/validate range; input không tự gọi Preview. Xác nhận chạy Random; thay target xóa lựa chọn phương án,
  phải xác nhận lại. Chặn double-click, abort/ignore response cũ khi đổi scope/target.
- Random History table + drawer hiển thị nguyên nhóm đã lưu, members, scores, rules, report; có View/Open/Apply.
  Trước xác nhận Apply từ history, FE GET detail mới để cập nhật eligibility; Backend Apply vẫn là nguồn quyết định cuối.
- Audit Apply thành công nằm ở tab riêng, ngang hàng với Current Saved Groups và Random History (xem mục 8.8).
  Unknown outcome giữ nguyên Idempotency-Key như trước.
- VI/EN, Ant Design, TermScope, tokens và style hiện có; bổ sung allocation query keys vào reconnect resync,
  không patch payload lịch sử như Deadline DTO. CORS cho phép Idempotency-Key để browser direct-origin Apply.

### 8.5. Kiểm thử và giới hạn

- Engine tests: 4/4/5, disabled rules, protected 6 làm target 3 không thể cân bằng, protected-only 6/4 bị từ chối,
  protected 3 + draft 4 vẫn có thể giữ protected cũ chưa đạt minimum; exhaustive oracle kiểm tra thêm balance.
- Apply tests: phương án hơn 31 ngày vẫn Apply khi snapshot không đổi, payload không bị retention xóa,
  phương án đã dùng không replay sau cleanup, bản lưu 6/2 bị từ chối trước mutation, protected/rollback/concurrency regression.
- API tests: mỗi Random có ID riêng, list/detail khôi phục đúng groups/report, đọc không gọi engine.allocate,
  stale/unauthorized được kiểm tra; FE tests có Confirm Target, hủy response cũ, load saved không Random,
  Apply từ History, list → detail → back, Term scope, VI/EN và same-key recovery.
- Backend `test bootJar`: **384 tests/38 suites**, 0 failure/error/skipped. Sau bổ sung trường hợp live data
  mâu thuẫn khi đọc History, chạy lại 3 suites Allocation cuối: **91 tests**, 0 failure/error.
  Các lần chạy có test trùng nhau, không cộng thành số test riêng biệt.
- MySQL **8.4** disposable `mysql-allocation-improve-test`, `127.0.0.1:33318/fmaking_allocation_test`:
  **23 Apply integration tests passed**, dùng script storage chỉ trong test container; có transaction, concurrent
  Apply, stale, rollback, invitation, retention và kiểm tra cân bằng trước mutation. Container đã dọn sau test.
  Case fallback đọc History khi live data lỗi được bổ sung sau lượt MySQL và kiểm thử bằng transaction thật trên H2;
  không khẳng định case bổ sung đó đã được rerun MySQL.
- Frontend full regression: **352 tests/37 files passed**, `npm test -- --maxWorkers=2`.
  `npm run build` (tsc -b + Vite) pass; `npm run lint` pass, còn 13 warnings ở code cũ.
  Bundle lớn khoảng 2.41 MB vẫn có cảnh báo, không tối ưu ngoài phạm vi.
- Chrome headless dùng Master fixture với Backend/Frontend thật: list chỉ có lớp được phân công, list → detail,
  History empty state; không tràn ngang tại 1280×900, 768×1024, 390×844; không có uncaught exception.
  Screenshot list desktop và detail mobile đã được đọc trực quan. VI/EN được test bằng component/i18n;
  screenshot runtime là VI. Browser chặn Preview/Apply trước mạng để bảo vệ DB; thực tế không phát request nào.
- Backend local được mở lại với runtime `ddl-auto=none`, SMTP localhost port 1; không ghi đè config file.
  CORS OPTIONS thực tế xác nhận Idempotency-Key được cho phép. Không gửi email thật hay migration/Apply
  lên MySQL ứng dụng; chưa chạy E2E Random → Apply có ghi trên database đó. Không commit/push.
- Chưa kiểm tra trực quan tất cả modal/history nhiều trang trên mobile. Class DTO chưa có groupCount/trạng thái
  allocation nên list không hiện số giả. Payload cũ đã bị dọn không khôi phục được. Thiếu FK/CHECK đã audit ở
  mục 7 vẫn cần xử lý riêng; bộ dữ liệu audit mục 7 là trước lần reset fixture, không phải live counts sau reset.

### 8.6. Files liên quan trong lần cải tiến

- Backend thêm `service/AllocationBalancePolicy.java`, `service/AllocationPlanHistoryService.java`.
  Sửa `SmartAllocationService`, `AllocationPreviewService`, `AllocationPreviewStore`, `AllocationApplyService`,
  `AllocationRetentionService`, `dto/AllocationResultDTO`, `repository/AllocationPreviewRepository`,
  `web/rest/AllocationResource`, `config/CorsConfig` trong `server/src/main/java/com/fmaking`.
- Frontend thêm `features/allocation/components/AllocationPlanHistory.tsx`; sửa `AllocationHistory.tsx`
  (giữ component audit Apply riêng), `hooks/useAllocationFlow.ts`, `api/allocationApi.ts`, `types.ts`,
  `pages/lecturer/LecturerAllocationPage.tsx` và CSS, `app/router/routes.tsx`, `features/deadline/realtime.ts`,
  `locales/en.json`, `locales/vi.json` trong `Client/src`.
- Tests sửa `SmartAllocationServiceTest`, `AllocationApplyServiceTest`, `AllocationResourceTest`;
  FE `allocationFixtures.ts`, `allocationFlow.test.tsx`, `allocationApi.test.ts`.
  Chỉ cập nhật tài liệu Markdown này; không thêm/sửa migration trong lần cải tiến.

### 8.7. Khóa phân bổ khi lớp đã hoàn tất

- Hoàn tất khi có ít nhất một nhóm không DISBANDED, tất cả đều ACCEPTED và Unassigned bằng 0.
  Lớp rỗng, lớp còn PENDING hoặc còn Unassigned không được coi là hoàn tất.
- Khóa Auto Allocate, Xác nhận target, Random Again và Apply mới; hiển thị thông báo VI/EN.
  Overview, lịch sử và xem chi tiết phương án vẫn truy cập được. Tất cả nhóm ACCEPTED nhưng còn Unassigned
  được cảnh báo cần giảng viên xử lý, không thông báo sai rằng lớp đã hoàn tất.
- Backend POST /preview trả 409 `allocationAlreadyComplete` trước khi chạy engine/lưu phương án.
  Apply kiểm tra lại trong transaction sau locking; History đánh dấu phương án chưa Apply không còn áp dụng được
  khi lớp đã hoàn tất. Retry cùng Idempotency-Key của Apply đã thành công vẫn trả kết quả cũ, không bị completion chặn.
- Dùng Overview đã có, không thêm field/endpoint/schema hoặc thay đổi quyền. Realtime invalidation hiện có
  khiến nút cập nhật lại khi trạng thái nhóm hoặc Unassigned thay đổi.
- Test UI/hook cho completed, empty, PENDING, accepted còn Unassigned, đọc History và VI/EN;
  API/service test completed 409, incomplete không bị chặn nhầm, giữ History và idempotent replay.
- Kết quả lượt sửa này: 64 Backend tests (H2 riêng) và 33 Frontend Allocation/API tests passed;
  bootJar, TypeScript/Vite build và lint pass (còn warnings cũ). Không test bằng cách sửa nhóm thật,
  không migration, không gửi email và không commit.

### 8.8. Redesign Automatic Allocation UI/UX

- Phạm vi chỉ presentation Frontend: giữ nguyên API, engine, hooks/state, Term/Class scope, permission,
  Confirm Target, Random Again, idempotency, recovery và realtime. Không sửa Backend hoặc database trong lượt redesign.
- Class list chứa hướng dẫn chung bằng ordered stepper: bốn vòng tròn đánh số và đường nối ngang trên desktop/tablet,
  chuyển sang trục dọc trên mobile. Không hiển thị completed/current giả; bỏ phần hướng dẫn khỏi trang chi tiết.
  Search và header đứng cùng khu vực, class cards dùng grid không kéo giãn một card ra toàn hàng, pagination căn phải.
- Detail header ưu tiên tên lớp, Term, Deadline/status và actions; sáu metrics thành một dải thống nhất.
  Rules đang bật dùng disclosure/chips; trạng thái lớp hoàn tất là thông báo gọn, vẫn giữ guard phân bổ đã có.
  Setup tách range/suggestion/target, xác nhận target vẫn là hành động khởi tạo Random; thông tin tìm kiếm chi tiết có thể mở rộng.
- Current Saved Groups, Random History và Successful Apply Audit là ba tab ngang hàng, không lồng audit trong collapse.
  History table gọn hơn, ngày/giờ dễ đọc, status badges thống nhất, View/Apply phân cấp rõ và có giải thích khi bị khóa.
  Saved-plan drawer giới hạn theo viewport; confirmation modal có footer linh hoạt trên mobile.
- Giữ nguyên `AllocationGroups.tsx`, CSS nội bộ Group Cards, member list, score/breakdown và collapse interactions.
  Chỉ thay wrapper/spacing bên ngoài. Report giữ nguyên dữ liệu, cải thiện phân cấp metrics và khoảng cách.
- Files UI: `Client/src/pages/lecturer/LecturerAllocationPage.tsx` và CSS,
  `Client/src/features/allocation/components/AllocationPlanHistory.tsx`, `AllocationHistory.tsx`,
  `Client/src/locales/en.json`, `vi.json`; thêm kiểm tra điều hướng/stepper trong `Client/src/test/allocationFlow.test.tsx`.
- Kiểm thử: `npm test -- --maxWorkers=2` **356 tests / 37 files passed**; riêng Allocation Flow/API **34 tests passed**
  (là tập con của full suite, không cộng dồn). `npm run build` (TypeScript + Vite) và `npm run lint` pass;
  lint còn 13 warnings ở code ngoài Allocation, Vite còn cảnh báo bundle lớn. jsdom còn cảnh báo pseudo-element từ Ant Design.
- Chrome headless với Backend và dữ liệu thật: kiểm tra list → detail, stepper chỉ ở list, Random History,
  mở lại saved-plan drawer, Apply Audit và chuyển VI/EN. Kiểm tra layout ở **1440, 1024, 768, 390px**:
  không tràn ngang toàn trang, table scroll trong container, drawer nằm trong viewport; không có uncaught exception.
  Đã đọc screenshot list mobile/desktop, detail laptop/desktop, history mobile và drawer mobile để kiểm tra trực quan.
- Browser chặn Preview/Apply trước mạng và ghi nhận **0 requests** tới hai mutation này khi duyệt các màn hình trên.
  Không chạy E2E Random → Apply trên MySQL ứng dụng. Setup/confirmation và các nhánh workflow được kiểm tra bằng
  component tests; chưa xác nhận trực quan bằng browser thật cho mọi trạng thái setup, confirmation, lỗi mạng hoặc mọi trang pagination.
  Không thêm dependency, không migration, không commit/push.

### 8.9. UI theo hai ảnh tham khảo

- Đã mở trực tiếp `Tab_automatic_allocation.png` và `automatic_class_detail.png` ở repository root.
  Trang list dùng hero Smart Group Allocation xanh sáng, minh họa giáo dục/phân nhóm, numbered stepper có icons
  và đường nối; trang detail dùng toolbar Back/Refresh/Auto Allocate, hero tên lớp, Term/Deadline/status,
  sáu metrics có semantic accent/icon và Business Rules disclosure. Không đưa stepper hoặc dữ liệu lớp cụ thể vào hero list.
- Minh họa là SVG decorative trong `features/allocation/components/AllocationIllustration.tsx`, dùng CSS tokens,
  không có thông tin sinh viên và không thêm dependency. Class cards chỉ dùng tên lớp, Term, studentCount từ API;
  không hardcode groupCount hoặc tên Deadline trong ảnh vì Class DTO chưa hỗ trợ hai field này.
- Tabs có icon; Setup, Confirm Target, Preview actions, Before/After Report, Random History, Apply Audit,
  saved-plan drawer và confirmation modal được đồng bộ border/radius/spacing. Button primary dùng `--color-primary`,
  secondary trắng/viền trung tính; hover/focus/disabled scoped trong Allocation, không đổi global Ant Design theme.
- Card `ACCEPTED` giữ nguyên DOM/classes, layout, typography, màu, members/Leader, score/rules và collapse.
  `AllocationGroups.tsx` chỉ thêm class `allocation-group--draft` khi status khác ACCEPTED; toàn bộ style card mới
  được giới hạn trong variant đó. PENDING vẫn hiển thị protected flag; không thay đổi quyền hay trạng thái.
- Source thay đổi: `LecturerAllocationPage.tsx` và CSS; thêm `AllocationIllustration.tsx`; chỉnh presentation
  trong `AllocationGroups.tsx`, `AllocationPlanHistory.tsx`, `AllocationHistory.tsx`; thêm ba keys VI/EN
  cho hero/description/class hint; thêm regression test cho variant ACCEPTED so với PENDING/REVOKED.
  Không sửa hook/API/types/engine/lifecycle/TermContext/routing hoặc Backend trong lượt này.
- `npm run build` (TypeScript + Vite) và `npm run lint` pass; full regression **357 tests / 37 files passed**.
  35 tests Allocation Flow/API là tập con của full suite, không cộng dồn.
  Vẫn có 13 lint warnings ngoài Allocation và cảnh báo bundle lớn khoảng 2.42 MB; không refactor ngoài phạm vi.
- Chrome headless với fixtures **chỉ phục vụ kiểm thử**, lấy từ `Client/src/test/allocationFixtures.ts` theo DTO thật:
  list/detail/setup tại **1440/1024/768/390px**, Preview desktop/mobile, confirmation mobile, Random History,
  saved-plan drawer, Apply Audit và chuyển VI/EN. Đã chụp/đọc screenshots đối chiếu hai reference; không overflow toàn trang,
  stepper ngang từ tablet trở lên, bảng cuộn trong container, drawer/modal dùng được trên mobile.
- Kiểm tra tự động computed styles của toàn bộ card ACCEPTED khi mở Members, Rules và Score Breakdown,
  thay CSS cũ/mới trên cùng DOM: width/height, typography, colors, border, spacing và shadow không đổi.
  Browser regression Confirm Target → Random → Auto Again → Apply confirmation → History pass với API fixtures,
  không có uncaught exception. Mọi API request được intercept trong browser test, không chạy Random/Apply hoặc ghi MySQL thật.
  Chưa xác nhận E2E với Backend/database thật cho lượt UI này; unit tests vẫn bao phủ validation, permissions,
  stale preview, idempotency/recovery và scope hiện có. Không migration, không email, không commit/push.

### 8.10. Đồng bộ giao diện card ACCEPTED

- Theo yêu cầu tiếp theo, card ACCEPTED dùng chung style mới với OPEN/PENDING/REVOKED, thay cho ngoại lệ giữ giao diện cũ ở mục 8.9.
  Đổi modifier presentation thành `allocation-group--enhanced`, áp dụng cho mọi card trong Current Groups, Preview và History.
- Giữ badge trạng thái, protected/khóa, dữ liệu Leader/members, score/rules và collapse; không thay đổi trạng thái hay quyền chỉnh sửa nhóm.
- Cập nhật regression test để kiểm tra style dùng chung, badge protected và mở danh sách thành viên của nhóm ACCEPTED.
  Chỉ sửa component/CSS/test và tài liệu, không sửa Backend hoặc database.
- Kiểm tra lượt đồng bộ này: 35 Allocation Flow/API tests pass, TypeScript/Vite build và lint pass;
  còn 13 lint warnings cũ ngoài Allocation và cảnh báo bundle lớn. Chưa chụp lại browser cho thay đổi nhỏ này.
