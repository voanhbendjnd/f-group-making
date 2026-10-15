# Kế hoạch đồng bộ vòng đời deadline và realtime

Ngày lập: 16/10/2026, múi giờ Asia/Saigon.

Trạng thái: đã triển khai trên nhánh `fix/deadline-lifecycle-realtime`. Mục 1 là kết quả khảo sát trước khi sửa; xem mục 7 cho kết quả kiểm chứng. Dữ liệu phát triển hiện có không được dùng cho kiểm thử ghi.

## 1. Kết quả kiểm tra thực tế

DB MySQL mà ứng dụng cấu hình sử dụng ở cổng 3307 hiện có deadline `id=1`, tên `chọn nhóm`, trạng thái lưu `CANCELLED`, kết thúc dự kiến lúc 23:48 ngày 31/10/2026 (UTC+7). Deadline này có 2 nhóm. Không thực hiện thêm thao tác hủy hoặc thay đổi nhóm để kiểm tra.

| Điểm trong luồng | Hiện trạng | Hậu quả |
| --- | --- | --- |
| `DeadlineService.cancelOrDeleteDeadline` | Lưu `status=CANCELLED`, không xóa deadline | Thông báo hủy thành công có cơ sở; dữ liệu vẫn còn để xem lại |
| `DeadlineService.toDTO`, `getMyActivities` | Tính trạng thái chỉ từ `startTime/endTime` | Danh sách Admin/GV và dashboard SV trả `ACTIVE` dù DB đã hủy |
| `validateDeadlineForStudent` | Trả `valid=false` khi đã hủy nhưng `status` vẫn tính theo thời gian | Cùng một response có thể chứa `valid=false`, `status=ACTIVE` |
| `DeadlineStatus` và type TS | Chỉ có `UPCOMING`, `ACTIVE`, `EXPIRED` | Không biểu diễn được trạng thái đã hủy |
| `SelectGroupPage` | Gộp mọi `!valid` vào `isExpired` | Đã hủy/chưa bắt đầu cũng bị thông báo hết hạn; có thể ghi ngày kết thúc ở tương lai như ngày đã hết hiệu lực |
| `StudentGroupWidget` | Không subscribe realtime; ưu tiên đợt API báo `ACTIVE` | Vẫn hiện đồng hồ và lời mời chọn nhóm từ dữ liệu sai/cũ |
| `GroupService.validateDeadlineActive` | Chỉ kiểm tra chuỗi `EXPIRED` hoặc `now > endTime` | Chưa chặn `CANCELLED`, chưa chặn trước `startTime`, sai biên tại `now == endTime` |
| `GroupService.getWorkspace` | Tính quyền tạo/join từ điều kiện hết hạn tương tự | API workspace có thể trả quyền thao tác cho đợt bị hủy/chưa mở |
| `DeadlineService.updateDeadline` | Quyết định nhánh sửa/gia hạn chỉ theo thời gian | Deadline đã hủy vẫn có thể đi vào luồng gia hạn |
| Admin/GV sau khi hủy | Chỉ `refetch()` danh sách tại màn đang thao tác | Không cập nhật các tài khoản/tab/màn khác |
| Realtime join hiện có | `GroupEventPublisher` phát sau commit; hook chỉ invalidate `group-workspace` | Chưa có event deadline; dashboard SV và kết quả validate không được đồng bộ |

Đây là lỗi hợp đồng trạng thái và kiểm tra nghiệp vụ, cộng với thiếu đồng bộ realtime. Chỉ thêm `refetch` hoặc đổi màu badge không giải quyết được.

## 2. Quy tắc nghiệp vụ đề xuất

### 2.1. Một trạng thái hiệu lực dùng chung

Một hàm resolver ở backend nhận trạng thái lưu và thời gian hiện tại, theo thứ tự:

1. Nếu đã hủy: `CANCELLED`, bất kể ngày bắt đầu/kết thúc.
2. Nếu `now < startTime`: `UPCOMING`.
3. Nếu `startTime <= now < endTime`: `ACTIVE`.
4. Nếu `now >= endTime`: `EXPIRED`.

Áp dụng resolver cho danh sách, chi tiết, validate, student activities, workspace, kiểm tra sửa/gia hạn và toàn bộ thao tác nhóm. Dùng `Clock` có thể thay thế trong test để kiểm tra chính xác các mốc thời gian.

Trạng thái lưu dùng để giữ quyết định hủy; không yêu cầu liên tục cập nhật DB từ `UPCOMING` sang `ACTIVE/EXPIRED` chỉ để tính trạng thái hiển thị. Không lấy raw `deadline.status` làm trạng thái hiệu lực trong workspace.

### 2.2. Ma trận hành vi

| Trạng thái | Sinh viên | Quản lý deadline | Quản lý nhóm của Admin/GV |
| --- | --- | --- | --- |
| `UPCOMING` | Xem thời gian bắt đầu, chưa tạo/join/thay đổi nhóm | Cho sửa lịch/lớp và hủy nếu có quyền | Giữ quyền chuẩn bị nhóm theo nghiệp vụ hiện tại và kiểm tra quyền lớp |
| `ACTIVE` | Thao tác theo quyền thành viên/leader và trạng thái nhóm | Gia hạn hoặc hủy; không đổi giờ bắt đầu/lớp | Thao tác theo quyền lớp và trạng thái nhóm |
| `EXPIRED` | Chỉ xem, khóa mọi thao tác ghi | Không gia hạn/sửa trực tiếp theo quy tắc hiện tại; có thể hủy để lưu trữ | Vẫn được duyệt/gán SV còn sót theo tài liệu 13 |
| `CANCELLED` | Xem thông báo hủy và nhóm đã tham gia ở chế độ chỉ đọc | Không sửa/gia hạn/khôi phục qua API update; hủy lặp lại trả thành công nhưng không tạo tác dụng phụ lần nữa | Xem nhóm/lịch sử, không thay đổi thành viên/trạng thái trong đợt đã hủy |

Hủy deadline không xóa nhóm, thành viên, lịch sử hoặc quyết định duyệt đã có. Không tự chuyển nhóm thành `DISBANDED` hay `REVOKED`. DB hiện có 2 nhóm trong deadline bị hủy phải được giữ nguyên.

`CANCELLED` là trạng thái kết thúc. Muốn tổ chức đợt mới thì tạo deadline mới; không tự khôi phục đợt cũ hoặc chuyển thành viên sang đợt mới. Luồng mở lại/hủy quyết định duyệt là nghiệp vụ riêng, không thêm ngầm vào lần sửa này.

Quyền Admin và mô hình sở hữu deadline dùng chung của GV trong tài liệu 12 được giữ: GV chỉ được sửa/hủy khi toàn bộ các lớp của deadline thuộc quyền mình. Quyền xem danh sách không đồng nghĩa quyền sửa. Backend trả các capability phù hợp để UI ẩn/khóa nút chính xác.

### 2.3. Giao diện khi hủy

- Admin/GV: badge `Đã hủy`; nút `Xem nhóm` chỉ đọc; ẩn gia hạn/sửa/hủy lần nữa. Giữ lịch dự kiến trong cột thời gian như thông tin lịch sử.
- Dashboard SV: đợt đã hủy không được chọn làm thẻ đang diễn ra; không có đồng hồ, CTA tham gia hay câu nhắc hạn cũ. Nếu không có đợt mở/sắp mở khác, hiện thông báo đợt đã hủy và tùy chọn xem nhóm cũ chỉ đọc. Có thể chuyển các đợt đóng vào phần lịch sử.
- Trang chọn nhóm mở sẵn hoặc link email cũ: thông báo riêng `Đợt chọn nhóm đã bị hủy`; không dùng nội dung hết hạn/gia hạn. Nếu đã có nhóm, vẫn xem được nhóm ở chế độ chỉ đọc.
- `UPCOMING`: nội dung chưa bắt đầu và thời gian bắt đầu, không dùng thông báo hết hạn.
- `EXPIRED`: nội dung hết hạn thật và lịch sử nhóm chỉ đọc; không hiển thị hành động tự chọn nhóm.
- Đóng modal đang chỉnh sửa, hủy thao tác chưa gửi và khóa nút ngay khi nhận sự kiện hủy. Yêu cầu REST đã gửi vẫn phải được backend xử lý theo thứ tự transaction thực tế.
- Dùng cùng định nghĩa trạng thái, capability và bản dịch VI/EN cho cả ba vai trò. Đồng bộ badge nhóm trên widget với enum backend `PENDING/ACCEPTED` thay cho cách đặt `SUBMITTED/APPROVED` đang lệch ở widget.

## 3. Hợp đồng API và an toàn khi thao tác đồng thời

### 3.1. API

- Giữ endpoint hủy hiện có `DELETE /api/deadlines/{id}` để không phá lời gọi đang dùng; bên trong đổi cách gọi rõ nghĩa là soft cancel, không hard delete.
- Response của list/detail/validate/activities/workspace đều có cùng trạng thái hiệu lực, gồm `CANCELLED`.
- `valid` trong validate chỉ mang nghĩa được phép thao tác SV khi đang mở; không dùng nó làm điều kiện duy nhất để quyết định có quyền xem workspace.
- Workspace luôn kiểm tra quyền xem lớp/deadline; vẫn trả dữ liệu chỉ đọc cho đợt đóng. Thêm `readOnlyReason` và capability cần thiết, không dùng `deadlineExpired` để đại diện cho mọi lý do khóa.
- Mọi mutation nhóm kiểm tra policy chung: SV chỉ thao tác khi `ACTIVE`; Admin/GV bị khóa ghi khi `CANCELLED`, nhưng vẫn có quyền hậu kiểm khi `EXPIRED` như ma trận trên.
- Mã lỗi phân biệt: `ERR_DEADLINE_CANCELLED`, `ERR_DEADLINE_NOT_STARTED`, `ERR_DEADLINE_EXPIRED`, trả 409 cho xung đột trạng thái. Kiểm tra danh tính/phạm vi lớp trước khi lộ trạng thái tài nguyên; lỗi 403/404 vẫn giữ đúng nghĩa.
- Bổ sung `cancelledAt`, `cancelledBy` cho lần hủy mới để có mốc hủy thật. Bản ghi cũ thiếu thông tin thì hiển thị không có dữ liệu; không gán ngày `endTime` thành ngày hủy hoặc tự suy đoán người hủy.
- Đồng bộ `termId` từ trang Admin xuống request/query key và truy vấn backend: hiện danh sách dùng `TermScope` nhưng query deadline chưa mang học kỳ. Không dùng event làm lý do để reset học kỳ hoặc phân trang của người dùng.

### 3.2. Chống join/gia hạn đồng thời với hủy

Khóa riêng row nhóm ở `joinGroup` hiện chưa đủ vì thao tác hủy sửa row deadline khác.

- Dùng khóa chung trên row deadline: đọc có khóa chia sẻ trong mutation nhóm, khóa ghi khi hủy/sửa lịch. Giữ khóa đến hết transaction. Khi kiểm thử với MySQL phải xác nhận query locking thật, không chỉ test mock.
- Thứ tự khóa thống nhất `deadline -> group -> membership` trên các luồng liên quan để tránh đảo thứ tự gây deadlock.
- Sau khi lấy khóa, đọc trạng thái hiện tại và kiểm tra quyền/thời gian lại trước khi sửa dữ liệu. Tránh sử dụng entity cũ từ persistence context trước khi chờ khóa.
- Nếu join commit trước hủy: thành viên được giữ lại và đợt chuyển sang chỉ đọc. Nếu hủy commit trước: join bị từ chối, không có bản ghi membership/history hoặc event join giả.
- Hủy lần hai là idempotent: không đổi `cancelledAt/cancelledBy`, không phát thêm event hủy như một hành động mới.
- Gia hạn không được làm sống lại đợt đã hủy, kể cả khi admin đang mở modal cũ.

## 4. Realtime theo cơ chế join hiện có

### 4.1. Luồng chuẩn

`REST mutation -> transaction kiểm tra/lưu DB -> commit -> event STOMP -> client đánh dấu cache cũ và tải REST -> hiển thị trạng thái/quyền mới`.

Tái sử dụng mẫu `GroupEventPublisher` với `AFTER_COMMIT`; không broadcast trước commit hoặc biến lỗi gửi socket thành thông báo hủy thất bại sau khi DB đã commit. Cơ chế transaction-bound event được Spring mô tả trong [Transaction-bound Events](https://docs.spring.io/spring-framework/reference/data-access/transaction/event.html).

Thêm event deadline: `DEADLINE_CREATED`, `DEADLINE_UPDATED`, `DEADLINE_EXTENDED`, `DEADLINE_CANCELLED`, `DEADLINE_STARTED`, `DEADLINE_EXPIRED`.

Payload tối thiểu: `eventId`, `eventType`, `deadlineId`, `affectedClassIds`, `status`, `startTime`, `endTime`, `occurredAt`, `version` của vòng đời deadline. Snapshot event được tạo trong transaction; không truy cập lazy entity sau commit. Event sửa danh sách lớp phải gửi cho hợp của lớp cũ và lớp mới để lớp bị loại cũng xóa cache cũ.

### 4.2. Đích nhận và kết nối

- Giữ topic nhóm hiện có cho sự kiện nhóm.
- Thêm `/topic/classes/{classId}/deadlines` cho lifecycle deadline của lớp. Dashboard SV subscribe theo lớp, không chỉ theo deadline đang nổi bật: như vậy vẫn nhận được event tạo đợt mới ngay khi chưa có hoạt động nào.
- Danh sách quản lý của Admin dùng topic deadline dành riêng cho Admin. Danh sách GV dùng user destination cho GV phụ trách; tạo/hủy đợt phải cập nhật các GV liên quan, kể cả deadline nhiều lớp.
- Tách kết nối STOMP chung ở tầng authenticated provider; các hook đăng ký subscription cần dùng. Không tạo thêm một socket cho mỗi thẻ/page rồi nhận toast trùng.
- Xác thực JWT ở STOMP CONNECT, gắn principal và kiểm tra quyền SUBSCRIBE theo role/lớp/topic. `connectHeaders` phía client hiện chưa có server interceptor tương ứng; không coi việc gửi Bearer là đã xác thực. Cách xác thực token qua interceptor được mô tả trong [Spring STOMP Token Authentication](https://docs.spring.io/spring-framework/reference/web/websocket/stomp/authentication-token-based.html).
- Subscribe xong mới resync REST để khép khoảng trống giữa tải dữ liệu và bắt đầu nhận event. Reconnect thực hiện subscribe lại và refetch; logout/đổi tài khoản dọn subscription và cache.

### 4.3. Query cache cần đồng bộ

Một helper/hook dùng chung quyết định cache cần làm mới theo event và phạm vi:

| Event | Cache cần làm mới |
| --- | --- |
| Lifecycle deadline | `admin-deadlines`, `lecturer-deadlines`, `lecturer-deadlines-for-workspace`, `student-deadline-activities`, `validate-deadline`, `group-workspace`, cùng detail nếu có |
| Join/leave/create/submit/accept/reject/transfer/disband nhóm | `group-workspace` tương ứng, `student-deadline-activities`, hồ sơ nhóm SV nếu màn đó sử dụng dữ liệu thành viên bị ảnh hưởng |
| Socket reconnect hoặc quay lại tab sau gián đoạn | Các query đang dùng trong phạm vi người dùng, gồm trạng thái deadline và workspace |

Mutation tại tab thao tác cũng invalidate cùng helper sau HTTP thành công; không chờ socket quay về. Khi hủy thành công nhưng refetch lỗi, báo dữ liệu đang cần đồng bộ, không báo hủy thất bại hoặc giữ nút thao tác như còn mở.

Event chỉ là tín hiệu đồng bộ, REST là nguồn dữ liệu chuẩn. Dedupe theo `eventId`, không áp snapshot cũ đè dữ liệu mới; dùng version và gộp invalidation để xử lý event trùng/đến đảo thứ tự. Query đang bay phải được hủy/bỏ response cũ phù hợp để không hiện lại CTA sau khi đã nhận hủy. Cơ chế invalidate/refetch theo key được mô tả trong [TanStack Query Invalidation](https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation).

### 4.4. Tự bắt đầu/hết hạn và mất kết nối

- Lập lịch server cho mốc bắt đầu/kết thúc; khi đổi lịch thì thay lịch cũ. Startup khôi phục các mốc từ DB. Job đọc lại trạng thái/version dưới khóa trước khi phát để không gửi `STARTED/EXPIRED` cho đợt đã hủy hoặc gửi mốc cũ sau gia hạn.
- Frontend đặt timer tại mốc bắt đầu/kết thúc để đổi hiển thị và refetch; khi hết thời gian phải khóa thao tác ngay theo thông tin hiện có. Đồng hồ chỉ phục vụ hiển thị, REST vẫn quyết định có cho ghi hay không.
- Reconnect, online và focus sau gián đoạn đều resync. Khi socket mất kết nối kéo dài, hiển thị trạng thái kết nối và bật polling dự phòng có giới hạn (đề xuất 30 giây), dừng polling khi socket ổn định trở lại.
- Không hứa giao mọi event trong lúc offline bằng simple broker hiện có. Nếu sau này cần nhiều backend instance hoặc yêu cầu giao bền vững thì đánh giá broker/outbox riêng; reconnect/refetch là cơ chế phục hồi của phạm vi này.

## 5. Các bước triển khai

1. **Chuẩn hóa backend trước:** resolver/status enum, DTO/capability, policy nhóm, chặn update đợt hủy, idempotency, audit hủy, khóa deadline và truy vấn học kỳ. Kiểm tra lại bản ghi `CANCELLED` sẵn có mà không sửa dữ liệu nhóm.
2. **Sửa giao diện theo contract:** type TS, badge, nút quản lý, widget dashboard, trang chọn nhóm/link cũ và workspace GV. Tách trạng thái hủy/chưa mở/hết hạn; cho xem nhóm cũ nhưng khóa ghi phù hợp.
3. **Bổ sung event và subscription:** publisher deadline sau commit, auth/scope kênh STOMP, kết nối dùng chung, helper invalidation, mở rộng sự kiện nhóm sang widget và thông tin thành viên liên quan.
4. **Hoàn thiện thời gian và phục hồi:** lịch bắt đầu/hết hạn, xử lý gia hạn/hủy lịch, reconnect/focus/offline và response cũ. Modal đang mở phải phản ứng với event.
5. **Kiểm thử và chạy đồng bộ bản mới:** backend tests dùng DB test riêng; frontend tests/build; kiểm tra nhiều phiên trình duyệt. Dừng backend cũ và chạy bản biên dịch mới trước nghiệm thu để tránh lặp lại lỗi source mới nhưng runtime cũ.

Các file chính: `DeadlineStatus`, `DeadlineService`, `DeadlineRepository`, `DeadlineResource`, DTO deadline/workspace, `GroupService`, publisher/event deadline mới, `WebSocketConfiguration` và interceptor; phía client gồm deadline types/table/badge, Admin/GV deadline pages, `StudentGroupWidget`, `SelectGroupPage`, workspace GV, realtime provider/hooks và locales VI/EN.

Tài liệu này bổ sung trạng thái `CANCELLED` cho tài liệu 12 và giữ quyền GV hậu kiểm khi hết hạn ở tài liệu 13. Khi triển khai cập nhật các mục trạng thái/quyền ở hai tài liệu cũ để tránh mâu thuẫn.

## 6. Điều kiện nghiệm thu

| Kịch bản | Kết quả bắt buộc |
| --- | --- |
| Admin hủy đợt đang mở, GV và 2 SV đang mở các màn khác nhau | Trong điều kiện socket ổn định, mọi màn cập nhật trong mục tiêu 2 giây sau commit, không F5: badge `Đã hủy`, dừng countdown, mất CTA ghi |
| Deadline đã `CANCELLED` trong DB từ trước lần sửa | Tất cả REST trả đúng `CANCELLED`; 2 nhóm hiện có và thành viên/lịch sử được giữ nguyên |
| SV chưa có nhóm và SV đã có nhóm mở link cũ | Thông báo hủy chính xác; người có nhóm xem được chỉ đọc, không được tạo/join/leave/submit/transfer/disband |
| Gọi API ghi trực tiếp sau hủy | Trả lỗi trạng thái, không phát event thành công và không đổi DB |
| GV/Admin cố sửa nhóm hoặc gia hạn đợt đã hủy | Bị chặn, kể cả từ modal và dữ liệu cache cũ |
| Hủy lặp lại hoặc hủy đồng thời | Không lỗi phụ, không tạo thêm bản ghi audit/event hủy, giữ mốc/người hủy đầu tiên |
| Hủy đồng thời với join/create/submit/gia hạn | Thứ tự commit xác định kết quả; không ghi lọt sau quyết định hủy hoặc khôi phục trạng thái ngoài ý muốn |
| Sát biên thời gian | Trước start bị chặn; tại start được phép nếu ACTIVE; tại end bị chặn; CANCELLED ưu tiên mọi mốc |
| Tạo đợt mới khi SV đang ở dashboard chưa có đợt | Dashboard nhận đợt mới qua realtime; không cần vào workspace trước |
| Gia hạn trước lúc hết hạn | Mọi countdown đổi theo giờ mới; job/timer cũ không khóa nhầm đợt |
| Đợt tự bắt đầu/hết hạn | Tất cả vai trò cập nhật trạng thái/quyền mà không cần thao tác mutation |
| Hết hạn bình thường | SV chỉ đọc, GV vẫn có thể duyệt/gán còn sót theo quyền hiện tại |
| Mất mạng lúc hủy rồi reconnect; event trùng/đảo thứ tự | REST khôi phục đúng trạng thái, không hiện lại CTA từ response/event cũ |
| Đổi lớp áp dụng của đợt chưa mở | Cả lớp được thêm và bị loại đều đồng bộ; lớp bị loại không còn quyền truy cập |
| Deadline nhiều lớp/GV; khác học kỳ | Chỉ người có quyền nhận/xem/thao tác; Admin không bị hiển thị dữ liệu sai học kỳ |
| Join/leave/duyệt nhóm bình thường | Realtime workspace hiện tại không hồi quy; dashboard cũng cập nhật nhóm/thành viên/badge |

Backend cần unit test resolver/policy và integration test transaction, authorization, locking trên MySQL test riêng. Frontend cần test các trạng thái, invalidation/reconnect và timer bằng fake clock. Kiểm tra thủ công ít nhất 1 Admin, 1 GV, 2 SV trong các phiên tách biệt. Không chạy test ghi dữ liệu lên DB đang dùng để trình diễn.

## 7. Kết quả triển khai và kiểm chứng

- Đã dùng chung resolver có `Clock` cho trạng thái/capability của deadline, activities và workspace. Thêm `CANCELLED`, audit hủy và version; hủy lặp không đổi audit hoặc phát event mới.
- API ghi nhóm dùng khóa chia sẻ trên deadline trước khóa nhóm; hủy/sửa lịch dùng khóa ghi deadline. Nhóm phải khớp cả lớp và deadline trong URL, không thể đưa ID đợt đang mở vào đường dẫn để sửa nhóm thuộc đợt đã hủy. Kiểm tra lại thời gian sau khi chờ khóa nhóm.
- Nhóm cũ được giữ nguyên, xem chỉ đọc. Không hiển thị countdown của đợt hủy hoặc thông báo hủy thành hết hạn. DTO giữ đúng tên `isLeader/isLecturer` mà client sử dụng.
- Realtime dùng một kết nối cho mỗi tài khoản, event sau commit, JWT CONNECT và kiểm tra quyền SUBSCRIBE. Đã cấu hình broker `/queue` để user destination của GV thực sự nhận được thông báo; topic nhóm cũ vẫn hoạt động.
- Đã thêm lịch bắt đầu/kết thúc theo version, khôi phục khi ứng dụng khởi động; job cũ không kết thúc nhầm đợt được gia hạn/hủy. Client có timer ở mốc thời gian, resync khi reconnect/focus và polling dự phòng khi socket gián đoạn.
- Frontend: 27 file, 249 test thành công; build thành công. Lint không có lỗi, còn các warning sẵn có của repo.
- Backend: cả 17 test mới trong `DeadlinePolicyTest`, `DeadlineBoundaryTest`, `RealtimeChannelInterceptorTest` và `DeadlineLifecycleIntegrationTest` đều thành công. Bộ đầy đủ chạy 217 test: 213 qua, 4 lỗi có sẵn. Đã tái hiện đúng 4 lỗi trên worktree sạch tại commit gốc `357d52f`: 3 test quyền ghi trưởng bộ môn trong `LecturerClassRulesTest` và 1 fixture `Group` thiếu `deadlineId/leaderId` trong `StudentProfileResourceTest`. Các lỗi này thuộc luồng phân quyền và fixture ngoài phạm vi sửa deadline.
- Integration test trên MySQL 8 dùng container dùng một lần, cổng 13307, schema test riêng: các luồng giữ dữ liệu, idempotency, rollback, API ghi, khóa hủy/join và truyền sự kiện đến ba phiên STOMP đều thành công.
- Kiểm tra trình duyệt thực trên app test riêng (backend 18080, UI 3001), gồm 4 browser context cho Admin, GV, SV chưa có nhóm và SV là leader: join cập nhật cả dashboard/workspace; hủy từ nút UI cập nhật cả 4 phiên không F5 trong khoảng 339 ms ở lần chạy local, giữ đủ 2 thành viên. Không có exception JS hoặc HTTP lỗi ngoài trạng thái offline chủ động.
- Đã kiểm tra ngắt mạng SV, tạo đợt mới, kết nối lại, nhận đợt mới; trạng thái tự chuyển sắp mở -> đang mở -> hết hạn mà không tải lại trang.
- Build artifacts và ứng dụng test được kiểm tra riêng; để dùng trong phiên IDE đang chạy cần dừng backend cũ và chạy lại bản mới. Với cấu hình phát triển `ddl-auto=update`, Hibernate thêm các cột audit/version; không backfill thông tin người/giờ hủy cho bản ghi cũ bằng dữ liệu suy đoán.


> 16/10/2026: [Group session / deadline / reapproval policy](15-group-session-deadline-approval.md) supersedes conflicting earlier lifecycle rules. Shared deadline updates require confirmedClassIds; EXPIRED may reopen, CANCELLED may not. Lecturer-created groups are drafts; member moves use one atomic request.
