# Import sinh viên và danh mục ngành

## Dữ liệu và triển khai

Student chỉ lưu `majorId` (`students.major_id`) và khai báo index; entity không ánh xạ
quan hệ đến Major. Truy vấn lấy mã/tên ngành bằng điều kiện `students.major_id = majors.id`.
Migration tạo khóa ngoại ở tầng database, độc lập với entity.
API đọc sinh viên vẫn trả `majorCode`, bổ sung `majorName`; cả hai lấy từ Major.
Chuỗi nguồn như `BEN_CHN_ET_19C` chỉ dùng lúc đọc file, không còn lưu trong Student.

Với database MySQL cũ, dừng backend và chạy [migration](../sql/20261006_students_major_id.sql)
trên đúng database trước khi khởi động bản mới. Sao lưu dữ liệu trước khi chạy.
`ddl-auto=update` không tự xóa cột cũ; để lại `major_code NOT NULL` sẽ làm insert mới thất bại.
Migration dừng nếu có `major_id` không tồn tại hoặc mã ngành trùng sau chuẩn hóa;
không tự đổi ID của sinh viên. Có thể chạy lại migration sau khi đã sửa dữ liệu.
Database mới được tạo bảng/cột và index bằng entity; có thể chạy migration để áp dụng
thêm khóa ngoại ở tầng database.

Nếu import báo `Field 'email' doesn't have a default value`, database cũ vẫn còn
`students.email NOT NULL` dù entity Student không còn trường email. Email hiện được
lưu và đọc từ `users.email`. Dừng backend và chạy
[migration email cũ](../sql/20261006_students_legacy_email_nullable.sql) trên database đang dùng.
Script giữ dữ liệu, kiểu và collation của cột cũ, chỉ cho phép NULL để insert Student
không gửi email vẫn hợp lệ. Không đổi `users.email`; không cần chạy nếu cột cũ đã
nullable hoặc không tồn tại. `ddl-auto=update` không tự sửa cột đã bỏ khỏi entity.

## Hợp đồng import

`POST /api/students/import`, multipart, chỉ ADMIN:

- `file`: file `.xlsx`, tối đa 5 MB, hai dòng đầu là tiêu đề/header.
- `confirmedMajorCodes`: tùy chọn, lặp lại field cho mỗi mã ngành được xác nhận.

Mã ngành là phần ngay sau dấu `_` đầu tiên, kết thúc ở dấu `_` kế tiếp hoặc hết chuỗi.
Mã được trim và viết hoa. Mã hợp lệ có 1–20 ký tự, bắt đầu bằng chữ/số,
chỉ gồm chữ cái ASCII, chữ số và dấu gạch ngang. CRUD Major dùng cùng quy tắc.
Danh mục được nạp một lần cho mỗi request; các mã có sẵn được đối chiếu không phân biệt hoa/thường.

Ví dụ lần gửi đầu có mã chưa có trong danh mục (payload nằm trong envelope `data`):

```json
{
  "success": false,
  "totalImported": 0,
  "errors": [],
  "confirmationRequired": true,
  "newMajorCodes": ["ABC", "XYZ"],
  "createdMajorCodes": []
}
```

Chưa có ngành, tài khoản hoặc sinh viên nào được tạo ở bước này. Frontend hiển thị
dialog liệt kê mã mới, giải thích tên tạm bằng mã. Hủy dialog không gửi request ghi.
Khi xác nhận, frontend gửi lại cùng file với `confirmedMajorCodes=ABC` và `confirmedMajorCodes=XYZ`.

Backend đọc lại và validate toàn bộ file. Nếu xuất hiện mã chưa được xác nhận, trả lại
`confirmationRequired=true` cùng danh sách hiện tại và không ghi dữ liệu.
Nếu có lỗi dữ liệu, trả `success=false`, `errors` theo dòng/cột, `confirmationRequired=false`.
Chỉ khi không có lỗi và tất cả mã mới được xác nhận, backend tạo mỗi ngành một lần
với `code=name`, rồi lưu tài khoản và sinh viên trong cùng transaction. Tên Major
chấp nhận tối thiểu một ký tự để hỗ trợ mã một ký tự; ràng buộc tên unique vẫn giữ.
Nếu tên tạm trùng tên ngành khác, request trả lỗi validation để admin xử lý danh mục.

Thành công: `success=true`, `totalImported` là số sinh viên, `createdMajorCodes` liệt kê ngành vừa tạo.
Frontend thông báo cập nhật tên thật và invalidate cache ngành/sinh viên.
Xung đột unique/FK khi ghi (ví dụ hai import đồng thời) trả HTTP 409 và rollback;
client có thể thử lại, khi đó ngành đã được request khác tạo sẽ được dùng lại.

## Tìm ngành và lọc sinh viên

Hai API danh sách mặc định trả bản ghi mới nhất trước nếu không truyền `sort`:

- `GET /api/students`: `createdDate,desc`, rồi `userId,desc` khi trùng thời gian.
  `createdDate` lấy từ tài khoản User, giống trường ngày tạo trong dữ liệu trả về;
  không thêm trường hoặc quan hệ vào entity Student.
- `GET /api/majors`: `createdDate,desc`, rồi `id,desc` khi trùng thời gian.

Truyền `sort` để thay thứ tự mặc định, ví dụ `sort=rollNumber,asc` cho sinh viên
hoặc `sort=code,asc` cho ngành.

- `GET /api/majors?search=...&page=1&size=10&sort=code,asc`: tìm mã hoặc tên ngành.
  Các từ được kết hợp AND; mỗi từ khớp mã hoặc tên, không phân biệt hoa/thường.
  `%` và `_` trong nội dung tìm kiếm là ký tự thường.
- `GET /api/majors?temporaryName=true`: ngành có tên tạm, `name` trùng `code` sau
  khi trim và bỏ qua hoa/thường. `temporaryName=false` lấy ngành có tên khác mã.
  Không truyền tham số này lấy cả hai loại; có thể kết hợp với `search`, `page`,
  `size`, `sort`. Đây là kiểm tra tên hiện tại, không phải nguồn tạo ngành.
  Ví dụ: `/api/majors?search=SE&temporaryName=true&page=1&size=10`.
- `GET /api/students?majorSearch=...`: sinh viên thuộc các ngành khớp mã/tên.
- `GET /api/students?majorId=...`: lọc chính xác theo ID. ID được ưu tiên nếu cả hai tham số được gửi.
- `majorCode` query cũ vẫn được chấp nhận như alias của `majorSearch` khi không gửi `majorSearch`.
- `POST /api/students/activate/all` nhận cùng `majorSearch`, `majorId` và alias cũ.

Ô tìm ngành đề xuất sau 350 ms. Nhập chữ thì lọc theo chữ; chọn gợi ý thì lọc bằng ID.
Sửa nội dung đã chọn xóa ID cũ ngay. Xóa trắng bỏ bộ lọc. Có thể dùng phím mũi tên,
Enter để chọn gợi ý, Escape để đóng. Enter khi không chọn gợi ý áp dụng tìm chữ.

Trang quản lý ngành có ô tìm mã/tên và bộ lọc tên tạm/tên khác mã. Tìm kiếm tự
áp dụng sau khi ngừng nhập 350 ms; Enter áp dụng ngay. Chọn loại tên áp dụng
ngay; đổi bộ lọc về trang đầu. “Xóa bộ lọc” khôi phục danh sách đầy đủ và hủy
từ khóa đang chờ áp dụng. Danh sách rỗng do lọc có thông báo riêng.
Danh sách sinh viên luôn hiển thị nút “Xóa bộ lọc” để xóa tìm kiếm, ngành,
trạng thái tài khoản và trạng thái lời mời, đồng thời về trang đầu.
