# Student Profile

Trang `/student/profile` chỉ đọc hồ sơ người đang đăng nhập, trong StudentLayout.
Tham khảo bố cục `profileCard.png`; dùng token/card/badge hiện có.

## API

`GET /api/me/student-profile` yêu cầu `ROLE_STUDENT`. Không có tham số ID.
Backend lấy email từ SecurityContext rồi tìm User/Student. Tham số `userId`
không xác định hồ sơ; các API Admin giữ nguyên quyền truy cập.

Response dùng wrapper hiện tại: `statusCode`, `message`, `data`.
`data` có `fullName`, `rollNumber`, `email`, `activated`, `major`, `schoolClass`,
`term`, `group`. Mỗi thông tin liên kết có `name` và `state`:

- `AVAILABLE`: có bản ghi và tên hiển thị.
- `UNASSIGNED`: chưa gán liên kết.
- `MISSING`: liên kết không tìm được bản ghi, thiếu tên hoặc Group khác lớp.

Học kỳ lấy qua SchoolClass, không dùng Current Term hoặc Selected Term.
Group null hiển thị thông báo chưa có nhóm; không dùng GroupName của Excel.
Không trả ID, password, token hay activation/reset key. Không có Student record
trả 404; không có quyền trả 403; chưa đăng nhập trả 401.

## Frontend

`profileApi` dùng Axios hiện có; `useStudentProfile` có query key theo User ID
và hỗ trợ hủy request. QueryProvider hiện có tách cache khi đổi tài khoản.
Nội dung mới có VI/EN, loading/error/missing states, không có nút chỉnh sửa.

Sidebar Student có My Profile và nút ở footer điều hướng tới Profile, đóng menu
mobile. Header có popover tên/email/vai trò qua portal, mở bằng hover/focus hoặc
tap; đóng khi rời vùng hover, Escape hoặc tương tác ngoài.

Account Preview Card tái sử dụng query/cache Profile cho Student, chỉ bật tải khi
mở lần đầu; đóng/mở lại không tự gửi request. Card có tên/vai trò/email ngay,
và thêm trạng thái kích hoạt, MSSV, Class/Term/Group khi API cung cấp dữ liệu.
Admin/Lecturer chỉ hiện thông tin tài khoản hỗ trợ bởi AuthContext, không gọi API
Student hoặc suy luận trạng thái activation. Menu có giới hạn kích thước theo
viewport; cuộn bên trong không đóng card.

Cập nhật Lecturer Profile: đoạn trên mô tả phạm vi ban đầu. Lecturer/Master hiện
dùng API hồ sơ riêng và cache chung với trang `/lecturer/profile`, bổ sung Code
và activation thật; Admin vẫn chỉ dùng AuthContext. Xem [Lecturer Profile](15-lecturer-profile.md).

GroupRepository chỉ bổ sung đọc Entity Group hiện có; không triển khai quản lý
nhóm hoặc sửa schema. Môi trường có Student.groupId phải có bảng groups đúng
schema Entity; lỗi schema được hiển thị như lỗi tải, không giả thành chưa có nhóm.

## Kiểm thử

Backend: StudentProfileResourceTest dùng H2 và dữ liệu test, kiểm tra sở hữu,
phân quyền, bí mật, dữ liệu chưa gán/liên kết sai và Group khác lớp.
Frontend: studentProfile.test.tsx kiểm tra nội dung API, VI/EN, trạng thái,
Sidebar, menu active và popover hover/focus/tap/Escape.
