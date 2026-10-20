# Triển khai flow nhóm và deadline theo lớp

Ngày: 16/10/2026. Triển khai theo [báo cáo 16 đã được duyệt](16-de-xuat-thong-nhat-flow-nhom-va-deadline.md).

## Hành vi đã triển khai

- Giáo viên quản lý lớp được sửa nhóm nháp `OPEN/REVOKED`, gửi duyệt và duyệt lại cả sau deadline. Nhóm `ACCEPTED` cần mở khóa trước; nhóm `PENDING` cần trả lại trước khi sửa cơ cấu.
- Sinh viên chỉ thao tác khi deadline của lớp đang `ACTIVE` và trạng thái nhóm/vai trò cho phép. Mở lại deadline không tự bỏ duyệt nhóm.
- Gia hạn/mở lại chọn một hoặc nhiều lớp, hoặc tất cả lớp thuộc deadline. Thời gian mới áp dụng cho cả lớp; không có lựa chọn nhóm riêng. Lớp không chọn giữ nguyên thời hạn.
- Giáo viên được gia hạn lớp được phân công dù deadline dùng chung với lớp của người khác. Chọn tất cả cần quyền quản lý toàn bộ lớp; request có lớp không hợp lệ hoặc thiếu quyền bị từ chối toàn bộ.
- Nút hủy deadline đổi thành **Kết thúc deadline ngay**, đóng toàn bộ lớp liên kết sau xác nhận. Không tạo trạng thái hủy vĩnh viễn mới. Phiên đã hết hạn/đóng được mở lại cùng ID.
- Phiên `UPCOMING` tiếp tục chỉnh lịch, không có nút kết thúc ngay. Không thêm chức năng tự mở khóa nhóm đã duyệt khi gia hạn.
- Phiên `CANCELLED` cũ được đọc như đã hết hạn. Giáo viên quản lý được nhóm; chủ động mở lại các lớp được chọn vẫn giữ đóng các lớp còn lại và giữ audit hủy cũ.

## Lưu trữ và API

Liên kết `school_class_deadline` được đọc bằng entity `DeadlineClassWindow`, bổ sung `end_time_override` nullable. Deadline hiệu lực của lớp dùng override nếu có, ngược lại dùng `deadlines.end_time`. Quan hệ lớp/phiên hiện có và nguồn membership `group_members` giữ nguyên.

`deadlines.schedule_revision` làm aggregate thay đổi version cả khi chỉ sửa hạn của một lớp. Backend khóa deadline và kiểm tra `expectedVersion` trước cập nhật. Giao diện giữ version khi mở form, yêu cầu xem lại dữ liệu mới nếu realtime báo thay đổi trong khi đang nhập.

`PUT /api/deadlines/{id}` bổ sung:

```json
{
  "id": 8,
  "name": "EXE101 - FALL26",
  "description": null,
  "scope": "SELECTED",
  "targetClassIds": [1, 2],
  "confirmedClassIds": [1, 2],
  "expectedVersion": 4,
  "endTime": "2026-10-17T13:00:00Z"
}
```

- `scope=ALL` áp dụng cho mọi lớp thuộc deadline. Request cũ không có scope tiếp tục mang nghĩa ALL và vẫn phải xác nhận đủ lớp khi có nhiều lớp.
- `targetClassIds` chọn phạm vi gia hạn, không thay danh sách lớp liên kết. `schoolClassIds` cũ không được dùng để chuyển/xóa lớp khỏi phiên.
- Các lớp đang mở chỉ được tăng deadline. Lớp đã đóng được mở lại bằng thời gian hợp lệ trong tương lai, không cần vượt hạn dự kiến trước khi kết thúc sớm.
- Thông tin chung và giờ bắt đầu chỉ chỉnh trong phạm vi quyền phù hợp; giờ bắt đầu chỉ đổi khi toàn bộ phiên chưa bắt đầu và áp dụng tất cả lớp.
- Response quản lý có `classWindows`, `mixedClassWindows`, `canClose` và quyền chỉnh từng lớp. Validation, activity, Workspace và Review dùng thời gian của đúng lớp.

`POST /api/deadlines/{id}/close` nhận `confirmedClassIds` và `expectedVersion`. DELETE cũ chuyển sang cùng nghiệp vụ đóng, không tiếp tục hủy vĩnh viễn. Request đóng lặp trên phiên đã đóng không thay deadline; version cũ bị từ chối để tránh đóng/mở nhầm sau thao tác khác.

## Realtime và FE

- Dùng STOMP/SockJS, QueryClient và hệ thống subscription hiện có; không thêm hệ thống realtime riêng.
- Mỗi sự kiện deadline chụp thời gian/trạng thái theo lớp trong transaction, chỉ broadcast sau commit. Sự kiện gia hạn riêng có `affectedClassIds` đúng phạm vi và snapshot lịch từng lớp.
- Scheduler lập lịch theo deadline/lớp. Khi aggregate version tăng, lịch cả lớp được thay đổi và lớp giữ nguyên đều được lập lại với version mới; job cũ không được phát trạng thái hết hạn sai.
- Sự kiện đóng/hết hạn dừng quyền sinh viên ở cache ngay, hủy request đọc cũ rồi refetch. Không khóa nhầm quyền giáo viên hoặc tự thu hồi duyệt nhóm.
- Provider và cache bỏ qua sự kiện deadline có version thấp hơn. Callback của Workspace kiểm tra đúng lớp, tránh hết hạn lớp B làm đóng modal của lớp A.
- Hộp thoại gia hạn có chọn lớp/tất cả lớp, hạn hiện tại, quyền chọn và xác nhận phạm vi. Danh sách hiển thị thời gian tóm tắt; chi tiết hiển thị thời gian và trạng thái từng lớp. Chỉ dùng nhãn trạng thái “Khác nhau theo lớp” nếu trạng thái các lớp thực sự khác nhau.
- Giao diện mới, thông báo lỗi và xác nhận có đủ VI/EN. Thuật ngữ `deadline` được giữ nguyên; bỏ các cách dịch “hạn chót”, “hạn cuối”, “đợt hạn” ở các nội dung FE liên quan.
- Nhóm vẫn dùng realtime đã có để đồng bộ membership, thu hồi duyệt, nộp và duyệt lại. Mất kết nối giữ cơ chế đồng bộ lại khi kết nối/focus/online và fallback của hệ thống hiện tại.

## Kiểm chứng

- Backend: **253 tests pass**, `test` và `bootJar` thành công.
- MySQL 8 riêng: **37 tests pass** cho GroupSessionPolicy và DeadlineLifecycle, gồm gia hạn theo lớp, khóa nhóm đã duyệt, rollback, cạnh tranh ghi và nhận sự kiện qua WebSocket.
- FE: **290 tests pass** trong toàn bộ suite, gồm VI/EN, chọn lớp, version conflict, cache và callback theo lớp. TypeScript và production build thành công.
- Lint không có error; còn các warning có sẵn. Production build còn cảnh báo kích thước bundle.
- Chrome thực tế: VI/EN trên desktop 1440×1000 và mobile 390×844; chọn lớp và submit gửi đúng `SELECTED/targetClassIds/expectedVersion`, modal không tràn ngang. API trong kiểm tra giao diện được mock, không ghi dữ liệu ứng dụng. Ảnh QA lưu trong `server/build/deadline-{vi,en}-{desktop,mobile}.png`.
- Migration đã kiểm tra chạy hai lần trên database MySQL riêng trước khi áp dụng local. Database test đã xóa; email được mock trong kiểm thử backend.

## Vận hành local

[Migration MySQL](sql/20261016_deadline_class_windows.sql) đã áp dụng cho database local khớp datasource hiện tại `localhost:3307/fgroup-making`. Chỉ bổ sung hai cột, không chuyển trạng thái phiên hay sửa dữ liệu nhóm. Đã kiểm tra số tài khoản, nhóm, membership và liên kết lớp/phiên giữ nguyên.

**Khởi động lại backend trong IDE để chạy code mới**, rồi tải lại FE nếu cần. Không dừng hoặc thay thế phiên backend đang được IDE quản lý trong lượt triển khai này. Với môi trường khác, chạy migration trước khi đưa backend mới vào phục vụ.

File SQL tài khoản demo từ yêu cầu trước được giữ nguyên; không tự chạy seed trong lượt này. Chưa tạo Git commit.

## Cập nhật giao diện danh sách và chi tiết deadline

- Áp dụng chung cho Admin và Giảng viên. Danh sách còn bốn cột: tên, trạng thái, kết thúc, thao tác; chuyển danh sách lớp, giờ bắt đầu và mô tả vào chi tiết. Deadline có nhiều giờ kết thúc hiển thị “Theo từng lớp” thay vì liệt kê dài trong một dòng.
- Nút **Chi tiết** mở hộp thoại có mô tả, thời gian và trạng thái từng lớp, liên kết xếp nhóm đúng lớp và các nút gia hạn/mở lại/kết thúc theo quyền. Mobile hiển thị danh sách dạng thẻ; nội dung chi tiết cuộn riêng với vùng nút thao tác cố định.
- Chi tiết gọi `GET /api/deadlines/{id}` bằng query `deadline-detail`, đồng bộ bằng realtime hiện có. Khi tải lỗi, chặn thay đổi và cho thử lại. Chuyển sang form gia hạn đóng chi tiết trước, dùng dữ liệu/version mới; trang quản lý không được ghi đè version mới bằng bản danh sách cũ.
- Đủ bản dịch VI/EN và giữ thuật ngữ `deadline`. Kiểm tra Chrome với 8 lớp ở desktop 1440×1000 và mobile 390×844: không tràn ngang, đủ chi tiết, chỉ một modal khi chuyển sang gia hạn, request dùng version mới nhất.
- Bổ sung 8 kiểm thử về danh sách gọn, VI/EN, quyền thao tác, lỗi/thử lại, realtime và luồng trang thực tế từ chi tiết sang gia hạn.
- Kết quả sau cập nhật giao diện: toàn bộ **298 tests FE pass**, production build thành công, lint không có error và không phát sinh warning mới ở các component bổ sung.
