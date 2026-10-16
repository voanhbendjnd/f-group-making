# Một phiên chọn nhóm, gia hạn và duyệt lại

## M2 — Lecturer Group Review

- Route `/lecturer/group-review`, menu Duyệt nhóm / Group Review dùng chung Lecturer và Lecturer Master. Danh sách luôn giới hạn các lớp được phân công cho chính tài khoản; quyền xem toàn hệ thống của Master không được dùng cho danh sách cá nhân này.
- API đọc mới: `GET /api/me/group-reviews?termId=<id>&classId=<optional>&status=<optional>&search=<optional>&page=1&size=10`. `termId` bắt buộc, xác minh tồn tại; class filter phải đúng Term và đúng phân công. Phân trang server, tối đa 50 dòng; tìm tên nhóm hoặc tên Leader, loại DISBANDED.
- Response dùng wrapper/pagination hiện có, mỗi dòng có `group: GroupDTO`, `className`, `submittedAt` (lần chuyển PENDING gần nhất trong history, null nếu chưa có), `deadlineStatus`, `eligible`, `canReview`, `canReopen`. Điều kiện hoàn chỉnh tái sử dụng cùng validator với submit/approve; GET không ghi snapshot. Chi tiết gồm cả kết quả MIN/MAX_GROUPS_PER_CLASS đang bật.
- Thao tác tái sử dụng API accept/reject/revoke hiện có, không thay nghiệp vụ M1. Approve chỉ PENDING đạt rules; review PENDING sau hạn được phép. Reject thường về OPEN, nhưng nhóm từng thu hồi duyệt vẫn về REVOKED. Reopen phải xác nhận thu hồi duyệt và nêu rõ điều kiện ACTIVE để chỉnh sửa, nộp/duyệt lại.
- Summary ghi rõ **trong trang hiện tại**, không dùng số đếm trang làm tổng học kỳ. Bộ lọc và state modal được reset theo Term; không giữ dữ liệu kỳ cũ. Danh mục lớp cá nhân được tải phân trang để đủ lựa chọn và đăng ký topic realtime cho toàn bộ lớp trong Term; danh sách nhóm luôn phân trang. Fallback refetch 30 giây và refetch khi focus theo Query conventions.
- Query `group-reviews` tham gia cơ chế invalidation chung với Workspace/Profile/Deadline. Khi CANCELLED được thông báo, cache tắt ngay canReview/canReopen. Không thay schema, không bổ sung ý tưởng kinh doanh, tỷ lệ công nghệ, export hay thuật toán phân bổ.

## M1 — Group Data & Business Rules Foundation (16/10/2026)

- `group_members` là nguồn membership hiện tại cho Workspace, Student Profile và Student Deadline Activities. `students.group_id` chỉ được giữ lại để tương thích dữ liệu cũ, không dùng làm fallback và không tự đồng bộ/xóa. Không có membership thì Profile trả `UNASSIGNED`; nếu membership có liên kết sai lớp/phiên, nhóm DISBANDED, hoặc nhiều membership không thể xác định duy nhất thì trả `MISSING`, không chọn bản ghi tùy ý.
- `MIN_MAJORS_PER_GROUP` mặc định 2 khi chưa có rule lưu. Giá trị/status đã lưu được giữ nguyên. `MIN/MAX_GROUPS_PER_CLASS` chưa lưu mặc định tắt; khi được cấu hình bật thì mới giới hạn số nhóm. Không ép lớp 36 sinh viên thành đúng 6 nhóm.
- Draft được thiếu người, ngành và SE. Tạo/thêm/join/chuyển phải tuân thủ trần số người và ngành đang bật; tạo nhóm còn phải tuân thủ trần số nhóm được bật. MIN rules và toàn bộ kết quả đánh giá được kiểm tra lại khi submit/approve. Rule SE vẫn là số lượng, không phải phần trăm. Tắt MAX_MEMBERS không âm thầm khôi phục trần 6; metadata số nguyên dùng `Integer.MAX_VALUE` cho trường hợp không giới hạn.
- Lecturer Master vẫn đọc được lớp theo quyền xem hiện có, nhưng chỉ ghi rules/thao tác nhóm nếu được phân công lớp; Admin được ghi mọi lớp. Workspace trả `canManageGroups=false` cho Master không được phân công. Quyền mở khóa ACCEPTED không mở rộng.
- Các mutation khóa lớp → deadline → nhóm như hiện có; nếu lớp có nhiều phiên lịch sử thì từ chối ghi với conflict thay vì chọn/xóa/gộp phiên. Cần kiểm kê và quyết định dữ liệu riêng trước khi mở ghi lại. M1 không xác nhận hay sửa dữ liệu MySQL thực tế.
- Không bổ sung schema, API mới, Review UI, Suggestions, Invitation, Introduction Note hoặc Automatic Allocation. Tests sử dụng H2 riêng, không gửi email thật.

Cập nhật 16/10/2026. Tài liệu này thay thế các quy tắc cũ mâu thuẫn trong kế hoạch 12/14. Không thay schema.

## Phiên và deadline

- SchoolClass đã thuộc một Term. Mỗi lớp chỉ được tạo một phiên, kể cả phiên cũ đã CANCELLED. Không tạo deadline thay thế để mở vòng chọn nhóm mới.
- `DeadlineService.createDeadline` khóa các bản ghi lớp bằng `SchoolClassRepository.findByIdForUpdate`, theo ID tăng dần, rồi kiểm tra liên kết hiện có và lưu trong cùng transaction. Hai request đồng thời cho cùng lớp không thể cùng tạo phiên.
- Không thay đổi danh sách lớp của phiên sau khi tạo. ACTIVE được tăng endTime; EXPIRED được mở lại bằng endTime mới trong tương lai. Giữ startTime và deadline ID. CANCELLED không được mở lại.
- `PUT /api/deadlines/{id}` giữ contract cũ và bổ sung `confirmedClassIds: number[]`. Nếu phiên có nhiều lớp, phải xác nhận đúng toàn bộ ID lớp. Modal hiện đầy đủ tên lớp và checkbox xác nhận; không dùng danh sách lớp đã bị lọc theo Term làm phạm vi xác nhận.
- Mở lại phát `DEADLINE_REOPENED` sau commit. Scheduler hủy lịch cũ, lập lịch mới theo version; frontend invalidate danh sách, activity, validation và workspace qua cơ chế realtime chung.

## Trạng thái và quyền

| Nhóm | Student | Quản lý nhóm |
| --- | --- | --- |
| OPEN | Chỉ thao tác khi ACTIVE; giữ điều kiện Leader/thành viên | Có thể phân bổ cả sau hạn, trừ CANCELLED |
| PENDING | Leader có thể hủy nộp khi ACTIVE; không sửa cơ cấu trực tiếp | Chỉ review/trả lại, không sửa thành viên; review được sau hạn |
| ACCEPTED | Khóa | Khóa; chỉ Admin hoặc GV được phân công lớp được thu hồi phê duyệt |
| REVOKED | Là nháp cần duyệt lại; chỉnh sửa và submit khi ACTIVE | Chỉ chỉnh sửa khi ACTIVE; không coi là OPEN thông thường sau hạn |
| DISBANDED | Không thao tác | Không sửa cơ cấu |

Thu hồi chuyển ACCEPTED → REVOKED, giữ history cũ. Submit lại chuyển REVOKED → PENDING. Reject/cancel-submit của nhóm đã thu hồi trở về REVOKED, tránh đi vòng qua OPEN để bỏ giới hạn ACTIVE. `GroupStatusHistoryRepository` dùng lịch sử thu hồi hiện có, không thêm cột hay status mới.

Lecturer Master không được cấp thêm quyền mở khóa: nếu không được phân công lớp thì không được mở khóa, dù quyền quản lý nhóm khác của Master trong source hiện tại rộng hơn. Quản lý deadline vẫn yêu cầu Admin hoặc người phụ trách toàn bộ các lớp của deadline dùng chung.

## Phân bổ và hoàn thiện nhóm

- GV tạo nhóm OPEN (nháp), không tự động ACCEPTED. Có thể bắt đầu từ một thành viên sau hạn.
- Mỗi bước phân bổ phải đúng lớp/phiên, không trùng membership và không vượt số thành viên tối đa. Không ép nhóm trung gian phải đạt số người tối thiểu, ngành hoặc số SV SE tối thiểu.
- Submit và approve kiểm tra lại cơ cấu/Leader, toàn bộ rule nhóm đang bật và MIN/MAX_GROUPS_PER_CLASS. Snapshot được đánh giá lại; không chỉ tin snapshot lúc nộp trước đó.
- Rule công nghệ thực tế hiện là **MIN_SE_MEMBERS_PER_GROUP (số lượng)**. Source không có rule phần trăm; không tự thêm hay quy đổi thành tỷ lệ mới.
- Không tự giải tán theo đồng hồ. Xóa thành viên cuối cần hành động giải tán rõ ràng. Chuyển thành viên cuối sang nhóm khác sẽ giải tán nhóm nguồn trong cùng transaction của hành động chuyển.
- Membership mutation khóa lớp trước deadline/nhóm. Chuyển nhóm atomic: nếu nhóm đích lỗi, toàn bộ xóa/thay Leader/giải tán nguồn và history phải rollback.

## API nhóm bổ sung

Prefix: `/api/deadlines/{deadlineId}/classes/{classId}/groups`.

| Method/path | Mục đích |
| --- | --- |
| `POST /{groupId}/submit-review` | GV gửi nhóm nháp đạt rule sang PENDING; OPEN được gửi sau hạn, REVOKED chỉ khi ACTIVE |
| `POST /{groupId}/move-member/{studentId}/to/{targetId}` | Chuyển thành viên atomic giữa hai nhóm nháp cùng lớp/phiên |
| `POST /{groupId}/revoke` (đã có) | Thu hồi duyệt để sửa và duyệt lại; thêm kiểm tra Admin/GV được phân công |

Các endpoint mới chỉ cho Admin/Lecturer/Lecturer Master ở Resource và tiếp tục kiểm tra quyền lớp tại Service. Endpoint revoke áp dụng quyền chặt hơn cho từng lớp. Student không được gọi API quản lý giảng viên.

## Dữ liệu cũ và kiểm tra

SELECT trên MySQL Docker local cổng 3307 phát hiện SchoolClass 17 thuộc Deadline 1 và 2. Người dùng đã xác nhận giữ nguyên dữ liệu cũ, chỉ sửa source và test. Không chọn phiên chính, gộp/xóa hay áp dụng constraint. Lớp này chưa đạt quy tắc một phiên cho đến khi nhóm quyết định xử lý dữ liệu lịch sử.

- Backend: `GroupSessionPolicyTest` (H2 riêng) kiểm tra mở lại lặp, xác nhận lớp, khóa trạng thái, quyền mở khóa, Student submit lại, chống lách qua reject, rollback, cạnh tranh tạo phiên/chuyển thành viên và 36 SV/9 nhóm → 6 nhóm sau hạn.
- `DeadlineLifecycleIntegrationTest` bổ sung kiểm tra sự kiện mở lại cùng ID/version mới sau commit; tái sử dụng test realtime và boundary cũ.
- Frontend: `groupSessionPolicy.test.tsx`, `lecturerGroupPolicy.test.tsx` kiểm tra modal, scope, lỗi/VI/EN, hành động Student, trạng thái nút Lecturer, quyền Master và request chuyển atomic.
- Không dùng dữ liệu thật để test ghi; không gửi email thật. Chưa coi test H2/jsdom là kiểm chứng MySQL concurrency hoặc browser responsive thực tế.

Kết quả chạy:

- Frontend: 29 files / 266 tests pass; typecheck và production build pass. Lint không có error, còn warning có sẵn; build cảnh báo bundle lớn.
- Backend: 229 tests, 225 pass / 4 fail. 28 tests trong các suite Deadline/Group liên quan đều pass, gồm concurrency và realtime sau commit.
- Đã chạy riêng `LecturerClassRulesTest` và `StudentProfileResourceTest` trên source HEAD `70f05bb` được archive vào thư mục build: tái hiện đúng 4 failure. Ba test mong Master không được ghi toàn hệ thống nhưng `SchoolClassAccessService` hiện miễn kiểm tra phân công cho Master; fixture Student Profile thiếu deadlineId/leaderId bắt buộc. Không sửa quyền dùng chung hoặc fixture ngoài phạm vi chỉ để làm xanh suite.
- Dữ liệu MySQL local chỉ được SELECT; kiểm thử ghi dùng H2. Không áp dụng migration hoặc constraint, không commit Git.

## Sửa kéo thả và thông báo

- Vùng tạo nhanh dùng `dropEffect=move`, thống nhất với nguồn kéo `effectAllowed=move`. Drop sinh viên Unassigned chỉ mở modal có sinh viên chọn sẵn; không phát sinh POST trước khi người dùng xác nhận tên/thành viên. Click và Enter/Space vẫn mở modal bình thường.
- Modal giữ dữ liệu nếu API thất bại, không đóng trước response thành công và có khóa request để tránh submit lặp. Sinh viên không bị optimistic-remove khỏi pool.
- Kéo thành viên cuối của nhóm nháp ra pool mở xác nhận giải tán; gọi API lecturer-disband thay vì remove-member. API giữ kiểm tra lớp/phiên/trạng thái và transaction hiện có. PENDING/ACCEPTED không được tự giải tán bằng drop.
- Bản ghi DISBANDED và audit giữ nguyên. Kiểm tra tên ở cả Student/Lecturer chỉ xét nhóm chưa DISBANDED trong cùng lớp/deadline, không phân biệt hoa/thường. MySQL local đã được kiểm tra chỉ đọc: bảng groups không có unique index tên; không cần migration. Khóa lớp hiện có bảo vệ cạnh tranh tạo lại cùng tên.
- Lecturer Workspace dùng ToastProvider hiện có thay cho Ant Design static message. Container toast dùng header-height để đặt góc trên bên phải, có giới hạn chiều cao và khoảng cách mobile; không thêm hệ thống notification mới.
- `lecturerGroupPolicy.test.tsx` kiểm tra payload drop, modal preselection, không ghi sớm và xác nhận người cuối; `lecturerGroupModal.test.tsx` kiểm tra modal thực tế khi lỗi/loading/success; `GroupSessionPolicyTest` bổ sung dùng lại tên sau giải tán nhưng vẫn giữ nhóm cũ và lịch sử.

Ghi chú dữ liệu: sau khảo sát hai phiên cũ, người dùng đã yêu cầu reset riêng hai deadline local; thao tác đó được backup và commit trước lượt sửa kéo thả này. Lượt sửa kéo thả chỉ SELECT metadata MySQL, không ghi database.- Ki?m tra SELECT MySQL local Docker (host 3307, database fgroup-making) ng?y 16/10: 0 l?p nhi?u phi?n; 0 membership sai li?n k?t/l?p/phi?n, nhi?u membership hi?n t?i ho?c Leader kh?ng h?p l?; 1 membership kh?c legacy students.group_id. Gi? nguy?n b?n ghi, kh?ng backfill. Unique student_id/deadline_id v? rule class/code ?? t?n t?i; metadata th?c t? ch?a c? ??y ?? c?c FK group_members nh? script SQL, n?n ch?a ?? xu?t ?p d?ng FK n?u ch?a audit v? ???c duy?t ri?ng.
- X?c minh: 240 tests Backend H2, 0 l?i/skip; test + bootJar th?nh c?ng. 43 tests Frontend li?n quan Profile/Workspace/Modal pass. Kh?ng ch?y ghi d? li?u tr?n MySQL ho?c g?i email th?t.
