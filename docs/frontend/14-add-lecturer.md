# Add Lecturer thủ công

## API và nghiệp vụ

`POST /api/lecturers` chỉ dành cho `ROLE_ADMIN`, nhận JSON gồm hai field bắt buộc:

```json
{ "code": "GV_EXAMPLE", "email": "lecturer@example.test" }
```

Code trim, 2–50 ký tự, không trùng Lecturer khác kể cả khác chữ hoa/thường.
Email trim/lowercase, đúng regex của Import, tối đa 254 ký tự, không trùng bất kỳ
User nào. Không nhận ID tài khoản, mật khẩu, activated, authorities, Class hay Term
để quyết định dữ liệu tạo mới. Tên User bằng Code; tài khoản chưa kích hoạt, chưa
có mật khẩu/key; quyền duy nhất được gán là `ROLE_LECTURE`.

Response HTTP 201 chứa `LecturerDTO` trong wrapper hiện có. Không trả secret.
Không gửi mail hoặc phân công lớp. Admin dùng activation hiện có sau khi tạo.

## Dùng chung Import và xử lý lỗi

`LecturerService` dùng chung `validateRows()` và `saveLecturers()` cho Excel/Form.
Parser và hợp đồng kết quả Import giữ nguyên. Truy vấn email dùng `lower(email)`
và chuẩn hóa kết quả để kiểm tra trùng không phụ thuộc chữ hoa/thường lưu sẵn.

Validation JSON trả 400 với violations hiện có; lỗi trùng trả 409 với một hoặc
hai violations:

- `code`: `lecturerCreate.duplicateCode`.
- `email`: `lecturerCreate.duplicateEmail`.

User, Authority nếu thiếu và Lecturer được lưu trong một transaction. Unique
conflict từ database làm rollback toàn bộ; Resource sau đó gọi truy vấn read-only
trong transaction mới để xác định field đã trùng. Nếu không xác định được duplicate,
đưa exception về handler integrity conflict chung, không suy đoán lỗi field.
Không query tiếp trong transaction đã thất bại và không retry thao tác tạo.

MySQL local đã kiểm tra chỉ đọc: unique `lecturers.code` và `users.email`, collation
`utf8mb4_0900_ai_ci`; không cần migration. Các môi trường khác cũng cần giữ unique
constraints/collation phù hợp để bảo vệ request đồng thời.

## Modal và cache

Nút Add Lecturer ở PageHeader phía ngoài TermScope, vì tạo danh mục toàn hệ thống
không phụ thuộc vào việc CURRENT/Selected Term có dữ liệu hay không. Modal dùng
shared Modal/Input/Button và style của Add Student, form một cột, header/footer
tách khỏi phần body cuộn. Focus được giới hạn trong dialog và khôi phục khi đóng.

React Hook Form kiểm tra dữ liệu, TanStack mutation `retry: false`. Lỗi giữ form
và map violations vào từng field; cả hai duplicate được hiển thị cùng lúc. Tất cả
nội dung mới có VI/EN. Pending chặn submit/đóng. Kết quả mạng không xác định giữ
form và chặn tạo lại trong phiên modal đó, nhắc kiểm tra danh sách trước khi thử.

Thành công đóng Modal, invalidate `lecturers` và `admin-dashboard`, giữ nguyên
Selected Term/filter. Toast nhắc Lecturer chưa có lớp chỉ xuất hiện trong phạm vi
**Toàn hệ thống / All lecturers**, sau đó có thể gửi activation riêng.

## Kiểm thử

- `LecturerCreateResourceTest`: DTO validation, duplicate/case-insensitive trên
  toàn bộ User, cả hai field, database unique conflict và rollback, request đồng
  thời, role/defaults, activation với email mock, Import all-or-nothing và quyền.
- `lecturerCreate.test.tsx`: payload, lỗi từng/cả hai field, giữ form, VI/EN,
  pending/double-submit, unknown outcome, focus/reset và cache/filter.
- Backend chạy H2 riêng với `IGNORECASE=TRUE` để mô phỏng so sánh không phân biệt
  hoa/thường; không tạo dữ liệu thử hoặc gửi email trong MySQL local.

Xác minh ngày 15/10/2026: full Backend build qua 187 test, Frontend qua 228 test,
typecheck/build thành công. Lint các file liên quan không có lỗi; còn cảnh báo
`Date.now()` có sẵn trong cooldown Lecturer List và cảnh báo kích thước bundle.
Hai test database riêng (Lecturer create và Student concurrency) tắt Hibernate
second-level/query cache trong annotation test để việc đóng một context không
đóng Ehcache mà các context khác đang dùng; không đổi cấu hình ứng dụng.

Chrome headless với API fixture tại 1440/768/390 px, VI và EN: dialog nằm trong
viewport, không tràn ngang, input được focus khi mở, hai lỗi duplicate hiện cùng
lúc, dữ liệu được giữ, tạo thành công mới đóng. Không có JavaScript exception.
Đây là kiểm tra UI có API được chặn bằng fixture; kiểm tra nghiệp vụ/transaction
thực hiện bằng Spring/H2, không phải test gửi email hoặc tạo tài khoản trên MySQL.
