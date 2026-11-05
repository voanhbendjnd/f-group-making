# Trưởng bộ môn và chỉnh sửa vai trò giảng viên

## Phạm vi quyền

Tái sử dụng `ROLE_LECTURE_MASTER` cùng API, service và giao diện giảng viên hiện có.

| Chức năng | Giảng viên | Trưởng bộ môn |
| --- | --- | --- |
| Xem lớp, sinh viên, quy định và nhóm của lớp được giao | Có | Có |
| Thực hiện nghiệp vụ giảng viên trên lớp được giao | Có | Có |
| Xem các lớp ngoài phân công, kể cả lớp chưa có giảng viên | Không | Có |
| Xem deadline, workspace, kết quả và lịch sử phân nhóm ngoài phân công | Không | Có |
| Xem Zalo của lớp/giảng viên khác | Không | Có |
| Sửa dữ liệu, duyệt nhóm, tạo/áp dụng phương án ngoài phân công | Không | Không |
| Đổi role tài khoản, phân công giảng viên | Không | Không; dành cho admin |

Các mục chức năng giảng viên (duyệt nhóm, deadline, phân nhóm tự động, lớp/quy định và Zalo) chỉ hiển thị lớp được phân công cho tài khoản trưởng bộ môn. API danh sách duyệt nhóm và deadline mặc định `MINE` với giảng viên/trưởng bộ môn. Admin giữ nguyên phạm vi quản trị.

## Tab Tổng quan bộ môn

Menu riêng dành cho trưởng bộ môn: `/lecturer/department-overview`. Trang này hiển thị tổng số lớp, giảng viên, sinh viên, nhóm, nhóm chờ duyệt và sinh viên chưa có nhóm theo học kỳ. Biểu đồ thể hiện tiến độ vào nhóm và trạng thái nhóm.

Danh sách lớp có tìm kiếm, phân trang và bộ lọc `ALL`, `MINE`, `OTHERS`. Bộ lọc áp dụng trước phân trang; các chỉ số tổng quan vẫn thể hiện toàn bộ học kỳ. Nhóm đã giải tán không được tính; sinh viên có nhóm ở nhiều phiên chỉ được tính một lần trong tiến độ.

Bấm vào lớp để mở `/lecturer/department-overview/classes/{id}` và xem thống kê, nhóm, sinh viên, quy định, Zalo. Mọi lớp trong khu vực này đều chỉ xem, kể cả lớp do chính trưởng bộ môn phụ trách. Thao tác nghiệp vụ thực hiện tại các mục giảng viên thông thường. Việc xem lớp chưa có phiên chia nhóm không tạo dữ liệu mới.

Các biểu đồ và bảng thống kê dùng API chỉ đọc, tổng hợp ở database thay vì tải toàn bộ danh sách tài khoản sinh viên để tính số liệu.

Deadline chung nhiều lớp giữ nguyên quy tắc hiện tại: quyền sửa theo từng lớp, quyền đóng toàn deadline chỉ khi quản lý tất cả lớp áp dụng. Mở workspace ngoài phân công chỉ đọc phiên đã có, không tự tạo phiên mới.

## Admin đổi vai trò

Vào **Admin → Danh sách giảng viên → Đổi vai trò**. Chọn **Giảng viên** hoặc **Trưởng bộ môn** rồi lưu. Role thuộc tài khoản và áp dụng cho mọi học kỳ. Không thay đổi lớp được phân công hoặc hồ sơ giảng viên.

API: `PUT /api/lecturers/{userId}/role`

```json
{
  "role": "ROLE_LECTURE_MASTER",
  "expectedRole": "ROLE_LECTURE"
}
```

Chỉ admin được gọi API. Hai giá trị role hợp lệ là `ROLE_LECTURE`, `ROLE_LECTURE_MASTER`. Tài khoản có quyền admin hoặc student không được sửa bằng chức năng này. `expectedRole` khác dữ liệu hiện tại trả HTTP 409 để tránh ghi đè thay đổi của admin khác.

Khi role thay đổi, backend vô hiệu hóa session/refresh token cũ, xóa cache tài khoản sau commit và chặn thông điệp tới các kết nối realtime cũ. Người dùng phải đăng nhập lại. Lưu cùng role hiện tại không thu hồi phiên.

Việc cấp token được khóa cùng tài khoản khi đổi role và đọc danh sách quyền hiện tại từ database, để một lần đăng nhập đang diễn ra không phát hành lại quyền cũ từ cache.

## API đọc bổ sung

- `GET /api/department-overview?termId=...&classScope=ALL|MINE|OTHERS&search=...&page=...&size=...`: thống kê học kỳ và danh sách lớp phân trang.
- `GET /api/department-overview/classes/{classId}?termId=...`: thông tin và thống kê lớp, danh sách nhóm và ID sinh viên đã có nhóm; từ chối lớp ngoài học kỳ đang chọn.
- `GET /api/school-classes?termId=...&classScope=ALL|MINE|OTHERS`
- `GET /api/me/group-reviews?termId=...&classScope=ALL|MINE|OTHERS`
- `GET /api/deadlines?termId=...&classScope=ALL|MINE|OTHERS`
- `GET /api/school-classes/{classId}/grouping-session?termId=...`: đọc phiên hiện có; dữ liệu rỗng nếu chưa có phiên.
- `GET /api/lecturers/options`: danh sách mã/tên/ID giảng viên cho bộ chọn của trưởng bộ môn; không trả thông tin quản trị tài khoản.

Không cần bảng hoặc role mới. `DatabaseInitializer` đã tạo `ROLE_LECTURE_MASTER` khi thiếu.

## Kiểm tra

Backend: `cd server` rồi `.\gradlew.bat test`.

Frontend: `cd Client` rồi `npm test -- --maxWorkers=2` và `npm run build`.

Các test bổ sung kiểm tra nâng/hạ role, token cũ, kết nối realtime cũ, xung đột đổi role, phạm vi lớp trước phân trang, đọc lớp ngoài phân công và chặn ghi dữ liệu.
