# Add Student thủ công

## Phạm vi và API

Admin mở **Add Student / Thêm sinh viên** trên Student List. Modal chỉ chọn Major,
Term và Class đã có; không tạo danh mục hoặc thay đổi Lecturer.

`POST /api/students`, yêu cầu đăng nhập với `ROLE_ADMIN`:

```json
{
  "fullName": "Example Student",
  "rollNumber": "EXAMPLE001",
  "memberCode": "EXAMPLE_MEMBER",
  "email": "example@example.test",
  "majorId": 1,
  "termId": 1,
  "schoolClassId": 1
}
```

Các ID trong ví dụ phải được thay bằng danh mục thực tế. Tất cả field bắt buộc.
Tên tối đa 50 ký tự, Roll Number/Member Code tối đa 255, email tối đa 254.
Backend trim chuỗi và chuyển email thành chữ thường; kiểm tra Major/Term tồn tại,
Class thuộc đúng Term, Lecturer hợp lệ, email trùng toàn bộ User và Roll Number/
Member Code trùng không phân biệt hoa thường theo validation Import.

Thành công trả HTTP 201 và StudentDTO qua response wrapper hiện có.
Không nhận User ID, Group, password, activation hoặc authorities từ client.
Tài khoản mới chưa kích hoạt; password, activation key và Group chưa có.
Admin dùng thao tác gửi activation hiện có sau khi tạo; API này không gửi email.

Lỗi validation dùng hợp đồng lỗi hiện có: `violations`, hoặc
`error.studentCreate.<field>`; Term không tồn tại dùng `termNotFound`.
Integrity conflict dùng exception handler chung. Không trả secret.

## Tái sử dụng Import và transaction

`StudentService.createStudent()` chuyển form thành một dòng dữ liệu đã ánh xạ
Major/Class/Lecturer từ database, dùng chung `validateRows`, `mapToEntities` và
`saveStudents` với Import Excel. Không thay đổi parser, cơ chế xác nhận Major mới
hoặc tự tìm/tạo Class của Import.

User và Student được lưu/flush trong cùng transaction; lỗi rollback cả hai.
Import và Add Student cùng dùng khóa tạo sinh viên, giữ đến khi transaction kết
thúc để kiểm tra trùng và ghi không xen kẽ trong **một Backend process**.

Schema MySQL đã kiểm tra có unique email và Roll Number, chưa có unique
Member Code. Khóa Java không bảo vệ giữa nhiều instance Backend hoặc thao tác
SQL bên ngoài. Triển khai nhiều instance cần nhóm quyết định constraint/khóa
database phù hợp; thay đổi này chưa bổ sung migration.

## Frontend

- `CreateStudentModal`: React Hook Form, shared Modal/Input/Select/Button,
  TanStack mutation với `retry: false`, nội dung VI/EN.
- `useStudentCreateOptions`: lấy đủ các trang Major/Class; query Class có Term
  trong key và params, loại bản ghi không thuộc Term đã chọn.
- Mặc định CURRENT từ TermContext, độc lập với Selected Term toàn website.
  Không có CURRENT thì để trống. Đổi Term xóa lựa chọn Class.
- Class chưa có Lecturer hợp lệ thì không cho lưu; không tự phân công Lecturer.
- Lỗi giữ form. Khi kết quả request không xác định, không tự retry; yêu cầu kiểm
  tra danh sách trước khi thử lại. Pending chặn submit/đóng Modal.
- Thành công đóng Modal, xóa batch selection, invalidate Student/Dashboard/Class
  caches; giữ Term, filter và pagination hiện tại. Toast nhắc kiểm tra filter nếu
  sinh viên mới không thuộc phạm vi đang xem.
- Modal có focus trap/khôi phục focus, bố cục hai cột chuyển một cột ở màn nhỏ.

### Đề xuất Member Code và giao diện

`features/students/utils/memberCode.ts` sinh đề xuất từ tên cuối đã bỏ dấu,
viết hoa chữ đầu + chữ đầu các từ trước đó + MSSV trim/viết hoa. Chuẩn hóa Unicode
và xử lý riêng đ/Đ. Ví dụ: Lương Huỳnh Bảo Trân + CS192013 → TranLHBCS192013.
Chỉ đề xuất khi tên và MSSV phù hợp để sinh mã không có ký tự phân cách, không
vượt giới hạn field. Nếu không sinh được, Admin vẫn nhập thủ công như trước.

Ban đầu mã tự cập nhật theo tên/MSSV. Khi Admin sửa mã (kể cả xóa trắng), Modal
giữ nguyên giá trị đó. **Tạo lại / Regenerate** dùng đề xuất mới nhất và bật lại
chế độ tự động. Đóng/mở Modal khởi tạo lại form. Mã đề xuất vẫn đi qua validation
và kiểm tra trùng hiện có; không áp dụng cho Import hoặc sinh viên đã tồn tại.

Modal chia hai nhóm thông tin, dùng CSS tokens hiện có, header/footer không cuộn
cùng body. `StudentFormSelect` chỉ dùng tại form này, không thay đổi shared native
Select. Menu portal vào overlay của dialog (ngoài card có overflow), giữ focus
ở combobox, hỗ trợ mũi tên/Home/End/Enter/Space/Escape/Tab, highlight/check và nhãn
CURRENT. Đổi Term tiếp tục xóa Class; resize/scroll bên ngoài đóng menu để tránh
sai vị trí. Tất cả nội dung mới có VI/EN.

## Kiểm thử

- `StudentCreateResourceTest`: quyền truy cập, validation, dữ liệu mới, Term/Class,
  trùng dữ liệu và sử dụng activation hiện có với email service được mock.
- `StudentCreateConcurrencyTest`: cùng payload, cùng Member Code khác Class và
  rollback khi flush lỗi, chạy H2 riêng.
- `StudentImportResourceTest`: hồi quy Import Excel.
- `studentCreate.test.tsx`: CURRENT/Selected, đổi Term, thiếu CURRENT/Class,
  lỗi giữ form, duplicate, double-submit, kết quả không xác định, VI/EN và cache.

Test tự động không thay thế kiểm tra trình duyệt thật trên desktop/mobile hoặc
SMTP thật. Không gửi email hoặc tạo sinh viên thử trong MySQL local khi chạy
các test trên.
