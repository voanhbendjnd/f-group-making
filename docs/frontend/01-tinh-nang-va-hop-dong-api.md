# 01 — Tính năng hiện có và hợp đồng API

> Contract bổ sung 12/10/2026: [bốn API giảng viên và Rule theo lớp](11-giang-vien-va-quy-dinh-nhom.md#bốn-api), đã có kiểm thử HTTP qua MockMvc với H2. Các mô tả API thiếu ở bản rà soát cũ không áp dụng cho phần bổ sung này.

[Về mục lục](README.md)

## 1. Căn cứ và giới hạn

Các đường dẫn bên dưới là mapping trong ứng dụng, chưa cộng context path hoặc tiền tố reverse proxy nếu môi trường triển khai có cấu hình thêm. Không hard-code host, port hoặc thời hạn token chưa được xác minh.

| Nguồn trong repository | Nội dung đối chiếu |
| --- | --- |
| [AccountResource.java](../../server/src/main/java/com/fmaking/web/rest/AccountResource.java) | Ba POST đăng nhập và yêu cầu kích hoạt |
| [StudentResource.java](../../server/src/main/java/com/fmaking/web/rest/StudentResource.java) | POST nhập sinh viên và `ROLE_ADMIN` |
| [StudentService.java](../../server/src/main/java/com/fmaking/service/StudentService.java) | Đọc Excel, kiểm tra và lưu toàn bộ hoặc từ chối |
| [UserService.java](../../server/src/main/java/com/fmaking/service/UserService.java) | Sinh khóa kích hoạt, kiểm tra tài khoản và xử lý hàng loạt |
| [AuthService.java](../../server/src/main/java/com/fmaking/service/AuthService.java) | Thông tin đăng nhập, access token, refresh token, session |
| [SecurityConfiguration.java](../../server/src/main/java/com/fmaking/config/SecurityConfiguration.java) | API public và yêu cầu xác thực |
| [ResFormatResponse.java](../../server/src/main/java/com/fmaking/util/ResFormatResponse.java) | Bao gói phản hồi thành công |
| [ExceptionTranslator.java](../../server/src/main/java/com/fmaking/web/rest/errors/ExceptionTranslator.java) | Phản hồi Problem và lỗi kiểm tra dữ liệu |
| [SmartAuthenticationEntryPoint.java](../../server/src/main/java/com/fmaking/config/SmartAuthenticationEntryPoint.java) | Một dạng phản hồi lỗi xác thực khác |

Ưu tiên hành vi trong thân hàm hơn comment. Ví dụ comment cũ chỉ nói ba cột Excel và một dòng tiêu đề; thân hàm thực tế đọc năm cột B–F và bỏ hai dòng đầu.

## 2. Ma trận bao phủ tính năng

| ID | Tính năng | API | Quyền backend hiện tại | Trải nghiệm được đặc tả | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| API-01 | Đăng nhập bằng email và mật khẩu | `POST /api/login` | Public | S01 đăng nhập; thông tin tài khoản từ kết quả login | HIỆN CÓ |
| API-02 | Yêu cầu gửi email kích hoạt một tài khoản | `POST /api/activate` | Xác thực + `ROLE_ADMIN` | S06 gửi cho một người; không coi là hoàn tất kích hoạt | HIỆN CÓ / luồng cuối CÓ ĐIỀU KIỆN |
| API-03 | Yêu cầu gửi email kích hoạt nhiều tài khoản | `POST /api/activate/mul` | Xác thực + `ROLE_ADMIN` | S06 gửi theo danh sách ID; chưa có UI chọn người nhận | HIỆN CÓ / luồng cuối CÓ ĐIỀU KIỆN |
| API-04 | Nhập sinh viên từ Excel | `POST /api/students/import` | Xác thực + `ROLE_ADMIN` | S04 hướng dẫn ba bước, S05 kết quả | HIỆN CÓ |
| FE-01 | Hướng dẫn, xem trước tệp, tải lỗi đã nhận | Không có API mới | Theo màn hình chứa dữ liệu | Xử lý cục bộ trong bộ nhớ | FRONTEND |
| FE-02 | Kết thúc phiên trên giao diện | Chưa có logout API | Người đang đăng nhập | Xóa phiên frontend, không hứa thu hồi token server | FRONTEND / giới hạn |

Các entity `User`, `Student`, `Major`, `Term`, `MajorTerm`, `Authority` đã có. Chưa có REST CRUD tương ứng cho danh sách/chi tiết/cập nhật/xóa; chưa tìm thấy entity hoặc API quản lý nhóm. Không suy luận tính năng xếp nhóm từ tên repository hoặc tên tệp Excel.

Các đường dẫn như `/api/register`, `/refresh`, `/account/reset-password/init`, `/account/reset-password/finish`, `/account/activate/**`, `/api/v1/search/**`, `/api/v1/files/**`, đường dẫn thanh toán và WebSocket xuất hiện trong security nhưng **không tìm thấy controller thực hiện trong phạm vi nguồn đã rà soát**. Không đưa vào danh mục API dùng được.

### 2.1. Mức đáp ứng flow cấp tài khoản qua Excel

| Bước nghiệp vụ mục tiêu | Backend hiện tại | Kết luận |
| --- | --- | --- |
| Sinh viên không tự đăng ký | Có hàm service `registerUser` nhưng không có controller đăng ký trong nguồn đã rà soát | Đúng định hướng không tự đăng ký; frontend không mở trang đăng ký |
| Admin import thông tin sinh viên | API-04 yêu cầu `ROLE_ADMIN`, kiểm tra Excel và lưu `User` + `Student` | **Đáp ứng một phần**; còn vấn đề validation/tính toàn vẹn ở 07 |
| Tài khoản mới ở trạng thái chờ | `User.activated` mặc định false | Có trạng thái chờ, nhưng User tạo từ import chưa có password và chưa được gán `ROLE_STUDENT` |
| Admin xem danh sách để chọn người nhận | Không có API danh sách student/user | **Chưa đáp ứng** |
| Gửi cho một sinh viên | API-02 nhận email, lưu activation key và yêu cầu gửi mail; yêu cầu admin | **Đáp ứng ở mức API**; chưa có danh sách quản trị để chọn |
| Gửi cho nhiều sinh viên | API-03 nhận `userIds`, loại ID trùng, bỏ user đã active, lưu key và yêu cầu gửi mail; yêu cầu admin | **Đáp ứng ở mức API theo ID**; frontend chưa có nguồn ID và response không có kết quả từng người |
| Gửi cho toàn bộ sinh viên phù hợp | Không có selection/filter “toàn bộ”, không có API/job tương ứng | **Chưa đáp ứng** |
| Sinh viên mở link, đặt mật khẩu và kích hoạt | Template có link nhưng không có controller hoàn tất activation/đặt password | **Chưa đáp ứng** |
| Sinh viên đăng nhập sau kích hoạt | Login đã có, nhưng các bước tạo password, activated=true và gán quyền cho tài khoản import chưa có | **Chưa thể đi hết flow** |

Kết luận: hệ thống hiện tại **không đáp ứng flow end-to-end**. Chỉ có thể triển khai chắc chắn phần admin đăng nhập và import; không mở chức năng “gửi một/nhiều/toàn bộ” như một quy trình hoàn chỉnh cho đến khi các phụ thuộc backend được xử lý.

## 3. Quy ước phản hồi chung

### 3.1. Phản hồi thành công có dữ liệu

`ResFormatResponse` bao gói body thành cấu trúc sau. Đây là mô tả dữ liệu, không phải mã triển khai:

| Trường | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `statusCode` | number | HTTP status do server gán |
| `message` | string hoặc giá trị JSON khác | Mặc định `Call API success!`; không đưa nguyên văn lên UI |
| `error` | string/null hoặc vắng mặt tùy cấu hình JSON | Không được dùng làm nguồn duy nhất xác định thành công |
| `data` | T/null | Dữ liệu nghiệp vụ |

HTTP status thực tế là căn cứ phân loại transport. Nếu body và status mâu thuẫn, xử lý như sai hợp đồng. Client unwrap một lần tại lớp API; component không tự truy cập nhiều tầng `response.data.data`.

### 3.2. Endpoint trả `void`

API-02 và API-03 khai báo HTTP 200, body nghiệp vụ `void`. Advice có thể tạo envelope với `data: null`; cần kiểm chứng response body thực tế. Frontend chấp nhận HTTP 200 với body rỗng hoặc envelope hợp lệ không có dữ liệu. Không buộc parse JSON trên body rỗng, không chờ danh sách người nhận trong response.

### 3.3. Phản hồi lỗi

Có ít nhất ba dạng cần nhận diện:

| Dạng | Trường có thể có | Cách xử lý |
| --- | --- | --- |
| Problem | `type`, `title`, `status`, `detail`, `message`, `params`, `path`, `violations` | Chuẩn hóa về lỗi ứng dụng; ưu tiên mã đã biết và bản dịch |
| Authentication entry point | `error`, `message`, `code`, `publicApi`, `redirect`, `redirectUrl` | Ánh xạ `code`; không điều hướng mù theo URL server |
| Ngoài hợp đồng | Body rỗng, HTML từ proxy, JSON khác | Hiện thông báo dự phòng, không làm trang crash |

Không mặc định mọi lỗi có `data`, `fieldErrors` hoặc `errorKey`. `ExceptionTranslator` có hằng tên `fieldErrors` nhưng không đủ để khẳng định mọi lỗi validation trả trường đó. Cần thu fixture runtime cho `@Valid`, lỗi đăng nhập chưa kích hoạt và lỗi bị chặn bởi security.

## 4. API-01 — Đăng nhập

**Mapping:** `POST /api/login`. JSON; không gửi Bearer token cũ kèm request đăng nhập.

| Request | Kiểu | Ràng buộc đã thấy |
| --- | --- | --- |
| `username` | string | Email; không trống; backend trim và chuyển chữ thường |
| `password` | string | Không trống; dài 4–100 ký tự theo `ManagedUserVM` |

Trên giao diện, nhãn phải là **Email**, dù tên request là `username`. Không trim hay chuyển chữ hoa/thường mật khẩu. Quy tắc 4–100 là hợp đồng hiện có, không phải chính sách mật khẩu mới do frontend tự đặt.

| `data` trong response 200 | Kiểu | Sử dụng |
| --- | --- | --- |
| `accessToken` | string | Header Bearer cho API bảo vệ |
| `user.id` | number, Java Long ở server | Định danh tài khoản; không hiển thị làm tên người dùng |
| `user.email` | string | Thông tin tài khoản |
| `user.name` | string/null | Lời chào; dùng email dự phòng nếu thiếu |
| `user.authorities` | string[] | Điều hướng và kiểm soát khả năng hiển thị trên frontend |

`refreshToken` bị `@JsonIgnore`, không có trong JSON. Server đặt cookie `refresh_token`: HttpOnly, Secure, SameSite=Strict, Path=/; thời hạn lấy từ cấu hình server. **Chưa có refresh API** để frontend sử dụng cookie đó.

Các authority khai báo: `ROLE_ADMIN`, `ROLE_LECTURE`, `ROLE_LECTURE_MASTER`, `ROLE_STUDENT`, `ROLE_ANONYMOUS`. Giữ đúng chính tả `LECTURE`; không tự đổi thành `LECTURER`. Nhãn tiếng Việt đề xuất: Quản trị viên, Giảng viên, Giảng viên phụ trách, Sinh viên; cần xác nhận tên nghiệp vụ “Giảng viên phụ trách”. Vai trò chưa có màn hình nghiệp vụ chỉ thấy trang chào và hướng dẫn phù hợp.

Lỗi sai thông tin được chuyển thành Problem 401 (`/invalid-password`). `DomainUserDetailsService` từ chối user chưa kích hoạt; entry point có nhánh `USER_NOT_ACTIVATED`, nhưng việc exception này đi qua nhánh nào khi login phải kiểm thử thực tế. Không suy luận “chưa kích hoạt” từ tất cả lỗi 401.

`SessionManager` sinh session ID mới mỗi lần login, converter kiểm tra với server. Có cache user trong repository; hiệu lực thay đổi phiên cần kiểm thử. Không hứa đăng nhập đồng thời nhiều thiết bị hoặc chắc chắn phiên cũ bị vô hiệu ngay.

## 5. API-02 — Yêu cầu email kích hoạt một tài khoản

**Mapping:** `POST /api/activate`. Request JSON có `email: string`. Yêu cầu Bearer token có `ROLE_ADMIN`. Không cần gửi ID hoặc activation key.

Trình tự hiện có: trim/lowercase email → tìm user → từ chối nếu user đã activated → tạo và lưu activation key mới → yêu cầu gửi email bất đồng bộ.

| Kết quả từ mã nguồn | Cách giải thích trên UI |
| --- | --- |
| 200 | “Đã tiếp nhận yêu cầu gửi email. Hãy kiểm tra hộp thư và thư rác.” |
| 400 `error.emailnotfound` khi thiếu email | “Vui lòng nhập email.” |
| 404 `error.emailnotfound` khi không có user | “Chưa tìm thấy tài khoản với email này. Hãy kiểm tra lại hoặc liên hệ người phụ trách.” |
| 403 `error.donotpermission` trong ngữ cảnh này | “Tài khoản này đã được kích hoạt. Bạn có thể quay lại đăng nhập.” |
| Lỗi mạng hoặc timeout | “Chưa xác nhận được yêu cầu. Hãy kiểm tra hộp thư trước khi gửi lại.” |

Phải ánh xạ lỗi theo endpoint + status + mã, vì cùng mã có thể có ý nghĩa khác ở thao tác khác. Email đến hộp thư không được xác nhận trong response. Mỗi yêu cầu hợp lệ có thể thay khóa trước đó; thông báo gửi lại cần nhắc dùng email mới nhất.

Chưa có endpoint nhận key và hoàn tất kích hoạt/đặt mật khẩu. Màn hình gửi yêu cầu chưa tạo thành hành trình tự phục vụ đầy đủ; xem [07](07-phu-thuoc-backend.md).

## 6. API-03 — Yêu cầu email kích hoạt hàng loạt

**Mapping:** `POST /api/activate/mul`. Yêu cầu Bearer token có `ROLE_ADMIN`. Request JSON có `userIds: number[]` (Java `List<Long>`). Response 200/void như mục 3.2.

- `userIds` bắt buộc có ít nhất một phần tử; từng ID phải khác null và là số dương. Payload sai bị từ chối trước khi gọi service.
- ID trùng được loại trước khi truy vấn/gửi; một tài khoản không nhận hai email trong cùng request.
- Nếu có ID không tồn tại, toàn request bị từ chối bằng lỗi tổng quát `error.idnotfound`; response không liệt kê ID nào có thật.
- Chỉ user có `activated=false` được cấp key mới. Key trong email và key lưu vào User là cùng một giá trị; user đã active bị bỏ qua và key cũ không bị thay đổi.
- Việc lưu key chạy trong transaction và hoàn tất trước khi lời gọi bất đồng bộ được phát đi từ controller.
- Không trả số email gửi thành công, trạng thái giao thư, job ID hay danh sách user.
- Không có API danh sách user để lấy `userIds`; kết quả import cũng không trả ID.
- Chưa có giới hạn kích thước batch/rate limit ở cấp API; cần chốt trước khi mở cho tải lớn.

Do đó: API backend có thể gửi cho một danh sách ID hợp lệ của admin, nhưng frontend vẫn **tắt tính năng hàng loạt mặc định** cho đến khi có nguồn danh sách và trạng thái phản hồi phù hợp. Không yêu cầu dán JSON hoặc nhập số ID. Không thay thế bằng vòng lặp API-02 cho từng email nếu chưa có thiết kế giới hạn gửi và trạng thái kết quả.

## 7. API-04 — Nhập sinh viên

**Mapping:** `POST /api/students/import`. Multipart form, tên field chính xác **`file`**. Gửi `Authorization: Bearer <accessToken>` với quyền `ROLE_ADMIN`. Không tự đặt multipart boundary/Content-Type khi thư viện HTTP tạo FormData.

### 7.1. Tệp đầu vào

| Thuộc tính | Hành vi hiện tại |
| --- | --- |
| Định dạng | Workbook `.xlsx`; backend chấp nhận kiểm tra sơ bộ theo MIME **hoặc** đuôi tệp rồi dùng XSSFWorkbook để đọc |
| Kích thước | Không rỗng; tối đa `5 × 1024 × 1024 = 5.242.880` byte, UI ghi “tối đa 5 MB” |
| Sheet | Chỉ sheet đầu tiên |
| Tiêu đề | Bỏ dòng Excel 1 và 2; dữ liệu bắt đầu từ dòng 3 |
| Dòng trống | Bỏ dòng hoàn toàn trống; nếu còn dữ liệu ở cột khác thì dòng vẫn có thể được kiểm tra |
| Cột A | Không ánh xạ vào Student; có thể dùng số thứ tự |
| Cột G trở đi | Không ánh xạ nghiệp vụ; không coi là dữ liệu cần import |

| Cột | Tên người dùng đọc | Trường đọc | Ràng buộc chính |
| --- | --- | --- | --- |
| B | Mã sinh viên | `rollNumber` | Bắt buộc; không trùng trong tệp và student đã có |
| C | Họ và tên | `fullName` | Bắt buộc; cũng được chép sang User.name |
| D | Mã ngành theo danh sách gốc | `originalMajor` | Bắt buộc; tách `_`, lấy phần thứ hai làm mã ngành và tìm trong majors |
| E | Mã thành viên | `memberCode` | Bắt buộc; kiểm tra trùng hiện có lỗi, xem 07 |
| F | Email | `email` | Bắt buộc; trim/lowercase; User còn có ràng buộc email hợp lệ, dài 5–254 và unique |

Ví dụ minh họa giả: dòng 3 có B=`SV000001`, C=`Nguyễn Minh An`, D=`BEN_CHN_ET_19C`, E=`TV000001`, F=`an@example.com`. `CHN` chỉ là ví dụ cú pháp, không đảm bảo có trong database. Không đưa dữ liệu sinh viên thật vào tài liệu, mock hoặc tệp mẫu công khai.

Backend không xác minh tên header mà đọc theo vị trí. Preview phải cảnh báo nếu nhận diện lệch cột, không tự đổi vị trí rồi gửi tệp gốc. Mã sinh viên và mã thành viên nên được lưu dạng Text trong Excel để không mất số 0 đầu. Tránh công thức/ô gộp ở B–F; nếu vẫn hỗ trợ preview các ô này thì phải kiểm chứng khớp cách Apache POI đọc trước khi phát hành.

Một số ràng buộc chỉ phát sinh ở bước lưu User, ví dụ tên dài hơn 50 ký tự, email trùng user không nằm trong students. Không hứa rằng tất cả lỗi dữ liệu đều sẽ xuất hiện trong `errors`; có thể gặp lỗi lưu/5xx. Preview nên bắt sớm giới hạn đã biết nhưng backend vẫn là nơi xác nhận cuối cùng.

### 7.2. Response nghiệp vụ

| `data` | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `success` | boolean | Kết quả nghiệp vụ thực sự |
| `totalImported` | number | Số sinh viên lưu thành công; không phải tổng toàn hệ thống |
| `errors` | array | Các lỗi kiểm tra dòng; có thể nhiều lỗi cho một dòng |
| `errors[].row` | number | Số dòng Excel gốc, bắt đầu từ 1; dữ liệu thực tế từ dòng 3 |
| `errors[].rollNumber` | string/null | Có thể thiếu; hiện một số lỗi email/memberCode gán nhầm giá trị vào trường này |
| `errors[].field` | string | `rollNumber`, `fullName`, `originalMajor`, `majorCode`, `memberCode`, `email` |
| `errors[].message` | string | Lời giải thích; render như text |

| HTTP và dữ liệu | Trạng thái frontend |
| --- | --- |
| 200 + `data.success=true` | Đã nhập `totalImported` sinh viên |
| 200 + `data.success=false` | Có lỗi dữ liệu, `totalImported=0`; không dòng nào được lưu theo nhánh validation |
| 400 `error.excel.invalid` | Tệp rỗng, sai định dạng, quá lớn, không có dòng dữ liệu hoặc lỗi đọc được service chuyển đổi |
| 401 | Cần đăng nhập; không tự gửi lại tệp sau đăng nhập |
| 403 | Tài khoản không có quyền nhập |
| 413 hoặc lỗi từ proxy/multipart | Môi trường từ chối kích thước; không giả định luôn có Problem JSON |
| 5xx/mất kết nối/timeout | Chưa xác nhận kết quả; không kết luận chắc chắn chưa lưu |

Service đặt `@Transactional`, có ý định lưu toàn bộ hoặc rollback. Việc lưu User và Student, lỗi ràng buộc database, và rollback thực tế phải được xác minh tích hợp. Không dùng câu “chưa lưu sinh viên nào” cho lỗi mạng không có kết quả chắc chắn.

Import hiện tạo User với email, tên, `activated=false`, password chưa đặt và authorities rỗng; tạo Student liên kết bằng userId. **Nhập thành công không có nghĩa sinh viên đã có thể đăng nhập.** Không tự đánh dấu activated hoặc gán quyền từ frontend.

### 7.3. Giới hạn kết nối với API khác

Import trả tổng số và lỗi, không trả ID người dùng, email đã lưu, import job hay lịch sử. Vì vậy chưa thể nối an toàn “nhập xong → tự gửi kích hoạt hàng loạt”, chưa thể mở danh sách mới nhập từ server và chưa thể đối soát kết quả sau timeout qua API.

## 8. Hạng mục cần xác minh khi có môi trường chạy

1. Login thành công có envelope đúng; cookie xuất hiện theo môi trường HTTP/HTTPS và SameSite.
2. Sai mật khẩu, tài khoản chưa kích hoạt, session hết hạn và thiếu quyền trả body/status thực tế nào.
3. API void trả body rỗng hay envelope; các trường null có được serialize không.
4. File hợp lệ hai dòng đầu có được xử lý như mô tả; lỗi dữ liệu trả HTTP 200 + false.
5. Giới hạn upload thực tế của Spring/proxy có thấp hơn 5 MB không.
6. Lỗi database rollback đồng thời User/Student; response không để lộ dữ liệu nội bộ.
7. CORS, base URL email và cấu hình mail hoạt động trong môi trường kiểm thử.

Việc thực hiện các kiểm chứng trên thuộc giai đoạn triển khai, chưa được thực hiện trong lần viết tài liệu này.


Academic Term catalog access update (15/10/2026): GET /api/terms (currentAndFutureOnly=false for history) and GET /api/terms/current support ROLE_ADMIN, ROLE_STUDENT, ROLE_LECTURE, ROLE_LECTURE_MASTER. POST /api/terms remains Admin-only. See [Academic Term Filter](11-academic-term-filter.md) for supported screens and explicitly unfiltered Deadline/Student screens.
