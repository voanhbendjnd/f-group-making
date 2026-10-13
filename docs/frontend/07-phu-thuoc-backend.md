# 07 — Phụ thuộc và điểm cần bổ sung backend

> Cập nhật 12/10/2026: các API giảng viên/lớp/Rule, quyền theo lớp và lưu toàn bộ quy định có version đã được triển khai. Xem [11](11-giang-vien-va-quy-dinh-nhom.md). Module nhóm/random/chốt nhóm vẫn chưa nằm trong phạm vi; migration cần chạy trước backend mới trên database cũ.

[Về mục lục](README.md) · [Hợp đồng đã rà soát](01-tinh-nang-va-hop-dong-api.md)

## 1. Cách đọc

Danh sách này xuất phát từ việc đọc mã nguồn, chưa phải kết quả chạy API hay kiểm thử xâm nhập. Mục đích là tránh thiết kế luồng người dùng không thể hoàn thành. Không có mã backend nào được sửa trong lần lập tài liệu.

**Chặn luồng**: không thể phát hành trải nghiệm được nêu một cách hoàn chỉnh. **Cần xác minh/sửa trước vận hành**: có nguy cơ ảnh hưởng dữ liệu hoặc trải nghiệm, cần kiểm chứng trên môi trường chạy. **Mở rộng**: ngoài API hiện tại, chưa cần xây nếu chưa thuộc phạm vi.

## 2. Danh sách có bằng chứng và cách ứng xử frontend

| ID | Phát hiện và bằng chứng | Ảnh hưởng người dùng | Ứng xử frontend hiện tại | Điều kiện giải quyết |
| --- | --- | --- | --- | --- |
| BE-01 | Không có controller xác nhận activation key/thiết lập mật khẩu; AccountResource chỉ login và yêu cầu mail | Người được nhập mới không tự hoàn tất kích hoạt | Chưa mở luồng kích hoạt tự phục vụ; S10 có hướng dẫn hỗ trợ | Contract xác nhận key, hạn sử dụng, đặt mật khẩu, role và kết quả activated được thiết kế/kiểm thử |
| BE-02 — ĐÃ SỬA | Batch gán cùng activation key cho User và DTO, lưu bằng `saveAll`; chỉ xử lý `activated=false` | Link batch nay khớp database; user đã active không bị gửi lại | Vẫn tắt S06 do thiếu danh sách/kết quả | Đã có kiểm thử hồi quy; còn cần expiry/status theo các mục khác |
| BE-03 — ĐÃ SỬA MỘT PHẦN | API đơn và batch yêu cầu `ROLE_ADMIN`; batch có `@Valid`, danh sách không rỗng, ID khác null/dương và lỗi ID tổng quát | Đã chặn anonymous/non-admin và payload sai cơ bản | Chỉ gửi Bearer admin | Còn cần giới hạn batch/rate limit trước tải lớn |
| BE-04 | Không có API danh sách user/student; import chỉ trả số lượng/lỗi | Không có nguồn ID cho batch, không xem lại dữ liệu đã nhập | Không yêu cầu nhập ID; không có danh sách giả | API đọc có phân trang/filter/quyền, trả định danh và trạng thái cần thiết; hoặc import trả nguồn ID có thể truy vết |
| BE-05 | Có refresh cookie và service tạo token nhưng thiếu controller refresh/logout/current user | Khó khôi phục phiên chuẩn, không thu hồi token khi logout UI | Chính sách phiên tạm ở 05, không gọi endpoint giả | Contract đầy đủ cho refresh, logout, user hiện tại, cookie/CSRF và session được kiểm thử |
| BE-06 | `StudentService` tạo User chỉ set email/name; password null, activated false, authorities mặc định rỗng | Nhập xong chưa thể đăng nhập như sinh viên | Giải thích tài khoản cần thiết lập; không tự gán role | Quy trình onboarding server gán quyền đúng và cho đặt mật khẩu/kích hoạt |
| BE-07 | `memberCodesInFile` lấy `getRollNumber()` thay vì `getMemberCode()` trong validateRows | Kiểm tra member code đã có có thể sai | Preview kiểm tra cơ bản nhưng không hứa thay kiểm tra DB | Sửa nguồn lookup, thống nhất case sensitivity và tính duy nhất, kiểm thử trùng |
| BE-08 | Chỉ theo dõi trùng rollNumber trong file; chưa theo dõi email/memberCode; email lookup chỉ students, User.email unique | Một tệp có thể qua kiểm tra dòng rồi lỗi lưu User | Bắt sớm trùng trong tệp, xử lý lỗi lưu mà không báo thành công | Validation nhất quán giữa Student/User, lỗi theo dòng, kiểm thử rollback |
| BE-09 | User.name tối đa 50, email có ràng buộc định dạng/độ dài; validateRows không kiểm tra đầy đủ | Lỗi có thể tới muộn dưới dạng persistence/5xx | Preview kiểm tra giới hạn đã biết; hướng dẫn lỗi dự phòng | Trả lỗi dữ liệu có vị trí trước khi lưu; quyết định nghiệp vụ về tên dài |
| BE-10 | `MailService` gửi bất đồng bộ, bắt một số lỗi mail rồi log; không có trạng thái job | 200 không chứng minh email được gửi/giao thành công | Chỉ nói đã tiếp nhận yêu cầu | Nếu cần theo dõi: response/job và trạng thái xử lý; không đồng nhất SMTP accepted với delivered |
| BE-11 — SỬA MỘT PHẦN | MailService dùng `djnd.client.base-url`, mặc định `http://localhost:3000`, và không log nội dung email/key | URL có scheme và cấu hình theo môi trường; vẫn chưa có flow xử lý key hoàn chỉnh | Không báo kích hoạt thành công | Cấu hình URL production và kiểm thử link; BE-01 vẫn phải hoàn tất |
| BE-12 | Không có import ID/status/history/idempotency; API ghi đồng bộ trả kết quả cuối | Sau timeout không đối soát tự động được | Trạng thái unknown, không tự gửi lại | Có định danh thao tác/kết quả tra cứu và chống trùng server nếu cần tự phục hồi |
| BE-13 | ResFormatResponse, Problem và entry point có định dạng khác nhau; void chưa xác minh | Client dễ parse sai hoặc thông báo sai | Adapter nhiều dạng, fixture thực tế | Chốt response status/body cho mọi nhánh và schema thống nhất khi nâng cấp |
| BE-14 | CORS chỉ localhost; Secure/SameSite=Strict; giới hạn multipart/proxy chưa xác minh | Login/upload có thể hoạt động khác giữa máy dev và production | Cấu hình tập trung, báo lỗi kết nối hữu ích | Kiểm tra origin, HTTPS, cookie, upload, proxy trên môi trường dự kiến |
| BE-15 | `findOneWithAuthoritiesByEmail` có cache; updateSessionIdById là bulk update, chưa thấy evict tương ứng tại SessionManager | Hiệu lực phiên mới/cũ cần kiểm chứng, có thể gây đăng nhập lại khó hiểu | Không suy luận lỗi phiên chắc do thiết bị khác | Kiểm thử cache/session; đồng bộ cache với thay đổi phiên/quyền |
| BE-16 — SỬA MỘT PHẦN | Cron nay dùng `lastModifiedDate` thay cho `createdDate`, nên cấp lại key sẽ bắt đầu lại cửa sổ dọn ba ngày | Tránh xóa ngay tài khoản cũ vừa được gửi mail; vẫn có thể lệch nếu pending User được sửa vì lý do khác | Không hứa expiry chính xác như token chuyên biệt | Chốt lifecycle, cân nhắc trường expiry riêng và kiểm thử quan hệ Student khi xóa |
| BE-17 — ĐÃ SỬA | Batch từng gọi `@Async` lồng qua MailService, khiến executor batch không kiểm soát từng mail và catch ngoài không thấy lỗi xử lý | Nguy cơ tăng tác vụ ngoài hàng đợi dự kiến và khó quan sát lỗi | Không ảnh hưởng contract frontend | Batch nay xử lý từng mail đồng bộ bên trong executor chuyên dụng; API đơn vẫn async |

Các dẫn chiếu chính: [UserService](../../server/src/main/java/com/fmaking/service/UserService.java), [StudentService](../../server/src/main/java/com/fmaking/service/StudentService.java), [User](../../server/src/main/java/com/fmaking/domain/User.java), [MailService](../../server/src/main/java/com/fmaking/service/MailService.java), [SessionManager](../../server/src/main/java/com/fmaking/security/SessionManager.java), [UserRepository](../../server/src/main/java/com/fmaking/repository/UserRepository.java), [SecurityConfiguration](../../server/src/main/java/com/fmaking/config/SecurityConfiguration.java).

Không kết luận mọi nguy cơ trong bảng chắc chắn đã phát sinh ở production. Những điểm phụ thuộc JPA/cache/mail/proxy cần tái hiện bằng kiểm thử tích hợp; những mapping thiếu và đoạn không lưu key là phát hiện trực tiếp từ nguồn đã đọc.

## 3. Điều kiện mở từng trải nghiệm

| Trải nghiệm | Điều kiện tối thiểu |
| --- | --- |
| Bản thử nghiệm login/import | API-01/04 chạy thực tế; tài khoản admin; danh mục ngành; fixture; xử lý lỗi/unknown; xác minh BE-07/08/09/13/14/15 ở mức phạm vi thử nghiệm |
| Nhập dữ liệu để vận hành | Tính toàn vẹn User/Student và rollback đã kiểm thử; lifecycle tài khoản rõ; có quy trình hỗ trợ đối soát timeout |
| Kích hoạt đơn tự phục vụ | BE-01/06/11 hoàn tất, hành vi gửi lại và lỗi mail được thống nhất, người dùng đi hết luồng từ email tới login |
| Kích hoạt hàng loạt | Các điều kiện đơn + BE-02/03/04, số lượng batch và kết quả được chốt |
| Phiên thuận tiện cho dùng lâu dài/thiết bị dùng chung | BE-05/14/15 được xử lý; không coi local logout là thu hồi server |
| Tự đối soát import | BE-12 có contract và UI dùng kết quả server |

### 3.1. Trạng thái flow sau khi sửa các lỗi batch hiện tại

Backend đã thực hiện các thay đổi sau trong working tree:

- Lọc tài khoản chưa kích hoạt, gán activation key vào User và lưu database trước khi gửi mail.
- Bỏ `permitAll`, yêu cầu `ROLE_ADMIN` tại cả endpoint gửi đơn và hàng loạt.
- Validate `userIds` không null/rỗng, loại ID trùng và áp dụng giới hạn kích thước batch phù hợp.

API gửi hàng loạt đã chuyển từ trạng thái **không an toàn và tạo liên kết không dùng được** sang **có thể tiếp nhận một danh sách ID hợp lệ do admin cung cấp**. Tuy nhiên flow cấp tài khoản vẫn chưa hoàn chỉnh:

| Bước | Trạng thái sau các sửa nhanh |
| --- | --- |
| Admin import Excel | Có, nhưng User import vẫn cần quyền sinh viên và quy trình đặt mật khẩu |
| Admin chọn một/nhiều sinh viên | Chưa có API danh sách để frontend lấy ID và trạng thái |
| Admin gửi cho một tài khoản | Có một phần qua email; cần thống nhất quyền và response quản trị |
| Admin gửi cho nhiều ID đã biết | Có thể dùng sau sửa, nhưng cần response tổng hợp và giới hạn batch |
| Admin gửi “toàn bộ theo bộ lọc” | Chưa có contract; không nên bắt frontend tải/gửi toàn bộ ID |
| Email chứa key khớp database | Có sau khi sửa lưu key |
| Theo dõi mail nào gửi thành công/thất bại | Chưa có job/status; HTTP 200 chỉ nên hiểu là đã tiếp nhận |
| Sinh viên mở link, đặt mật khẩu, activated=true | Chưa có endpoint hoàn tất activation |
| Sinh viên đăng nhập với `ROLE_STUDENT` | Chưa hoàn chỉnh vì tài khoản import chưa có password/quyền và chưa có bước kích hoạt cuối |

Do đó, các sửa này là điều kiện bắt buộc để dùng API batch nhưng chưa đủ để mở flow end-to-end. Có thể kiểm thử backend gửi nhiều email bằng ID trong môi trường quản trị; chưa nên phát hành nút chọn một/nhiều/toàn bộ cho người dùng thật.

Trước khi coi batch sẵn sàng cho sản phẩm, cũng cần chốt:

- Response nêu rõ số yêu cầu, số được tiếp nhận, số bỏ qua vì đã kích hoạt và lỗi; không im lặng lọc rồi làm admin hiểu sai.
- Token chưa có trường expiry riêng. Cron đã chuyển sang `lastModifiedDate` để tránh xóa ngay tài khoản cũ vừa được cấp lại key, nhưng một mốc expiry chuyên biệt vẫn chính xác hơn nếu User có thay đổi khác.
- Chính sách gửi lại: key mới có làm key cũ mất hiệu lực hay không; UI phải nhắc dùng email mới nhất.
- Giới hạn batch, rate limit, hàng đợi có giới hạn, audit người gửi và chống gửi lặp do double click.
- Trạng thái mail chỉ là queued/sent/failed theo khả năng thực tế; không tuyên bố delivered nếu nhà cung cấp không xác nhận.

## 4. Năng lực backend đề xuất, chưa phải API hiện có

Không gán đường dẫn mới như hợp đồng đã tồn tại. Khi triển khai từng năng lực, nhóm backend phải thống nhất method/path, request, response, quyền, lỗi, phân trang, giới hạn và ví dụ runtime trước.

| Năng lực | Dữ liệu tối thiểu phục vụ UI | Vì sao cần |
| --- | --- | --- |
| Phiên hiện tại và làm mới/kết thúc phiên | User/authorities, thời hạn, lỗi nhất quán, cookie policy | Tránh đăng nhập lại khó hiểu và bảo đảm kết thúc phiên |
| Xác nhận kích hoạt và đặt mật khẩu | Key, hiệu lực, trạng thái cuối, quy tắc mật khẩu | Người được nhập có thể bắt đầu sử dụng |
| Danh sách sinh viên/tài khoản | userId, mã SV, tên, email, ngành, activated; pagination/filter/sort và quyền | Xem lại dữ liệu và chọn người nhận bằng thông tin quen thuộc |
| Danh mục ngành/kỳ | ID, code/name, trạng thái áp dụng nếu có | Chọn dữ liệu hợp lệ và giải thích lỗi ngành |
| Kết quả một lần import | Batch/operation ID, tổng, trạng thái, tập tài khoản liên quan theo quyền | Đối soát timeout, bước kích hoạt tiếp theo |
| Kết quả yêu cầu email batch | Request/job ID, số tiếp nhận, lỗi từng đối tượng theo contract | Gửi lại đúng phần lỗi và không gửi trùng toàn bộ |
| Dry-run/preview phía server | Lỗi theo dòng, dữ liệu chuẩn hóa, chính sách hiệu lực kết quả | Chỉ cần nếu muốn xác nhận kiểm tra database trước khi commit; frontend preview hiện tại không thay thế |

`UserDTO`, `Student`, `Major` hoặc repository đã tồn tại không đủ để bỏ qua việc thiết kế các hợp đồng đọc/ghi này.

## 5. Phạm vi quản lý nhóm tương lai

Chưa có cơ sở để đặc tả đầy đủ màn hình xếp nhóm chạy thật. Khi được giao mở rộng, cần chốt: nhóm thuộc kỳ/môn nào, ai được tạo/tham gia, giới hạn thành viên, quy tắc cân bằng ngành, lời mời/đơn tham gia, chuyển nhóm, phân công giảng viên, thời hạn và quyền sửa sau chốt.

Chỉ sau khi có nghiệp vụ và API mới thêm menu “Nhóm của tôi”, “Quản lý nhóm” hoặc thuật toán gợi ý. Không dựng nút “Tự động xếp nhóm” gọi endpoint tưởng tượng hoặc mô phỏng rồi hiển thị như đã lưu server. Kiến trúc feature-based trong 04 cho phép bổ sung module nhóm khi phạm vi đó có thật.

## 6. Quy trình cập nhật một phụ thuộc

Khi một mục BE được xử lý: gắn thay đổi backend và hợp đồng mới → ghi fixture thực tế đã làm sạch → cập nhật 01 → cập nhật 02/05 → thêm ca kiểm thử 06 → mới đổi capability để mở UI. Việc chỉ sửa một endpoint không tự động làm cả hành trình hoàn chỉnh; cần kiểm thử từ đầu đến cuối theo mục 3.
