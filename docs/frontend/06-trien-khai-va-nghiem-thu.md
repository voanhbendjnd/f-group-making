# 06 — Lộ trình triển khai và tiêu chí nghiệm thu

> Bổ sung 12/10/2026: frontend và backend cho giảng viên/Rule đã được triển khai. Các ca nghiệm thu cụ thể và giới hạn kiểm chứng được ghi tại [11](11-giang-vien-va-quy-dinh-nhom.md#kiểm-tra-nghiệm-thu), thay cho trạng thái chưa có frontend của kế hoạch ban đầu.

[Về mục lục](README.md)

## 1. Phạm vi thực hiện

Đây là kế hoạch cho giai đoạn **triển khai sau khi được giao**, không phải báo cáo ứng dụng đã hoàn thành. Trong lần hiện tại chỉ tạo tài liệu, chưa có frontend để chạy build, kiểm thử UI hoặc đánh giá người dùng.

Một tính năng hoàn thành phải đồng thời: đúng hợp đồng backend, dễ dùng, xử lý được trạng thái lỗi quan trọng và tuân thủ cấu trúc chung. Không nghiệm thu bằng việc chỉ mở được một màn hình thành công với mock.

## 2. Thứ tự triển khai

| Giai đoạn | Kết quả cụ thể | Phụ thuộc | Điều kiện hoàn tất |
| --- | --- | --- | --- |
| P0 — Chốt hợp đồng chạy thật | Fixture sạch cho 4 API; xác minh base URL, CORS, lỗi, void response, upload và cookie | Backend kiểm thử, tài khoản/role, dữ liệu giả, mail sandbox nếu kiểm thử gửi thư | Danh sách 01 được đối chiếu runtime; cập nhật 07 |
| P1 — Nền tảng và mẫu giao diện | React/TS/Vite, route, theme, form, HTTP client, error model, session layer | 03, 04, 05 | Build/lint/typecheck; kiểm tra login card và import shell trên desktop/mobile |
| P2 — Login và điều hướng | S01, S03, trang lỗi, thông tin tài khoản, xử lý phiên | API-01 và fixture lỗi | Đăng nhập đúng/sai, quyền admin/non-admin, reload, 401/403 đúng |
| P3 — Import hoàn chỉnh | S04/S05, preview cùng định dạng backend, lỗi dòng, báo cáo lỗi cục bộ | API-04, mẫu sạch, parser đã đánh giá | Thực hiện được toàn bộ kịch bản import trọng yếu |
| P4 — Kích hoạt đơn | S02/S10 và hướng dẫn phù hợp | API-02 và các phụ thuộc kích hoạt trong 07 | Người nhận có thể đi hết luồng thực tế; không chỉ nhận mail |
| P5 — Kích hoạt hàng loạt | S06, chọn người nhận, batch request và trạng thái trung thực | API-03 đã sửa phần key/quyền/validation; còn thiếu API nguồn danh sách và contract kết quả | Không nhập ID thủ công; quyền server; khóa dùng được; không báo giao thư giả |
| P6 — Hoàn thiện và phát hành | Trợ giúp, đo hiệu năng, kiểm thử người không rành công nghệ, kiểm tra triển khai | Các phạm vi được chọn phát hành đã qua điều kiện | Không còn lỗi chặn trong hành trình được phát hành |

Có thể hoàn thành P1–P3 cho phạm vi quản trị nội bộ trong khi P4/P5 chưa đủ điều kiện. Phải công bố rõ phạm vi bản thử nghiệm; không gọi đó là hệ thống quản lý nhóm hoặc kích hoạt tự phục vụ hoàn chỉnh. Các vấn đề import ảnh hưởng tính toàn vẹn và phiên ảnh hưởng môi trường dùng chung vẫn cần được đánh giá trước khi đưa dữ liệu thật vào vận hành.

## 3. Hồ sơ bàn giao cho từng màn hình

1. Mục tiêu người dùng, vai trò và route.
2. API dùng thực tế hoặc ghi rõ chỉ xử lý cục bộ.
3. Thiết kế desktop/mobile, trạng thái pending/success/error/unknown tương ứng.
4. Dữ liệu bắt buộc, nguồn dữ liệu, validation và câu thông báo.
5. Vị trí file/module theo 04, thành phần dùng chung được dùng lại.
6. Kịch bản kiểm thử trọng yếu và bằng chứng đã kiểm tra.
7. Phụ thuộc backend chưa giải quyết, flag mở/tắt tính năng, giới hạn còn lại.

Mỗi ticket dùng ID màn hình Sxx, API-xx và mã kiểm thử dưới đây để truy vết. Không giao một ticket chỉ ghi “làm giao diện đẹp”.

## 4. Ma trận kiểm thử hành vi

Các trường hợp là yêu cầu nghiệm thu tương lai, **chưa được chạy trong lần viết tài liệu**.

### Đăng nhập, quyền và phiên

| ID | Tình huống | Kết quả cần thấy |
| --- | --- | --- |
| AUTH-01 | Login admin hợp lệ | Một POST; dùng user trả về; vào đúng nơi có thao tác nhập |
| AUTH-02 | Sai mật khẩu | Lỗi dễ hiểu tại form; không redirect lặp, không xóa email |
| AUTH-03 | Email/mật khẩu trống, độ dài sai | Chặn submit, chỉ đúng trường; không gọi API |
| AUTH-04 | User chưa kích hoạt | Chỉ hướng dẫn kích hoạt khi có tín hiệu đã xác minh; fallback không đoán |
| AUTH-05 | User không phải admin mở URL import | Guard UX chặn; gọi trực tiếp backend cũng phải bị server từ chối |
| AUTH-06 | User nhiều role hoặc role lạ | Capability theo role đã biết; role lạ không được nâng quyền |
| AUTH-07 | Reload cùng tab | Session hợp lệ được phục hồi theo 05; File cũ không được giả vờ còn |
| AUTH-08 | Storage hỏng/bị chặn, token hết hạn | Không crash; xóa dữ liệu hỏng hoặc dùng memory; về login hợp lý |
| AUTH-09 | Nhiều API bảo vệ cùng trả 401 | Một luồng đăng nhập lại; không có nhiều toast/dialog |
| AUTH-10 | 403 import và 403 email đơn | Hai lời giải thích khác nhau đúng ngữ cảnh |
| AUTH-11 | Đăng nhập lại cùng user sau 401 | Còn File trong memory thì về kiểm tra; không tự gửi lại |
| AUTH-12 | Đăng nhập lại thành user khác | Xóa bản nháp/cache riêng của user cũ |
| AUTH-13 | Đăng xuất, back, mở tab khác | Không hiển thị dữ liệu riêng đã xóa; ghi nhận giới hạn logout server |
| AUTH-14 | Login thiếu token hoặc response HTML | Không tạo phiên lỗi; thông báo dự phòng hữu ích |
| AUTH-15 | Đăng nhập ở thiết bị khác | Kiểm chứng hành vi session/cache thực tế, không dựa vào suy đoán |

### Nhập Excel

| ID | Tình huống | Kết quả cần thấy |
| --- | --- | --- |
| IMP-01 | Chọn tệp rỗng/sai đuôi/quá 5.242.880 byte | Giải thích tại chỗ; không upload |
| IMP-02 | Hai dòng đầu, dữ liệu từ dòng 3, B–F đúng | Preview và backend thống nhất số dòng/giá trị |
| IMP-03 | Chỉ header hoặc sheet trống | Hướng dẫn thêm dữ liệu; lỗi server vẫn được xử lý nếu gửi lọt |
| IMP-04 | Có nhiều sheet, dữ liệu sheet hai khác | Nêu rõ chỉ sheet đầu được nhập |
| IMP-05 | Thiếu mã SV/họ tên/ngành/member code/email | Hiển thị dòng và ô cần sửa; không mất File |
| IMP-06 | Trùng mã SV trong tệp/database | Phân biệt lý do; số dòng Excel chính xác |
| IMP-07 | Email/member code trùng, email trùng User nhưng chưa có Student | Kiểm chứng giới hạn backend; frontend không báo thành công giả khi lưu lỗi |
| IMP-08 | Ngành sai định dạng hoặc không có trong majors | Hướng dẫn sửa hoặc liên hệ người quản lý danh mục |
| IMP-09 | Mã có số 0 đầu, ô số/công thức/gộp, tiếng Việt | Preview không làm sai định danh; chặn loại chưa hỗ trợ rõ ràng |
| IMP-10 | Dòng chỉ có dữ liệu cột A/G; dòng trống giữa tệp | Đồng nhất quy tắc xác định dòng trống với backend |
| IMP-11 | HTTP 200 + success=true | N lấy từ `totalImported`; không hiện tổng hệ thống hay activated giả |
| IMP-12 | HTTP 200 + success=false, nhiều lỗi cùng dòng | “Chưa lưu”; đếm lỗi và đếm dòng riêng; không toast thành công |
| IMP-13 | errors[].rollNumber null hoặc chứa email/member code | Dùng row/field và preview phù hợp; không gắn nhầm danh tính |
| IMP-14 | Lỗi field mới chưa có bản dịch | Vẫn thấy dòng/lý do; không bỏ qua lỗi |
| IMP-15 | Sửa Excel rồi chọn lại | Hủy preview/kết quả cũ; gửi đúng byte của tệp mới khi xác nhận |
| IMP-16 | Double click, Enter liên tiếp, React StrictMode | Đúng một request cho một lần xác nhận |
| IMP-17 | Chọn tệp, preview, lọc lỗi, tải lỗi | Không có POST ngoài thao tác nhập |
| IMP-18 | Chậm 10–30 giây hoặc mạng yếu | Có phản hồi đang chờ; không giả phần trăm xử lý |
| IMP-19 | Request đã gửi rồi mất mạng/timeout/5xx | “Chưa xác nhận”; không tự retry hoặc tự resume |
| IMP-20 | Response 2xx thiếu success/envelope hỏng | Không báo lưu thành công; xử lý như kết quả chưa xác nhận |
| IMP-21 | 400 tệp, 413 từ proxy, body rỗng/HTML | Thông báo hữu ích; không crash do parse JSON |
| IMP-22 | 401/403 khi import | Giữ ngữ cảnh theo 05; không replay tự động |
| IMP-23 | Điều hướng nội bộ hoặc rời tab lúc đang gửi | Trạng thái còn đúng/có cảnh báo; không hứa đã hủy server |
| IMP-24 | Lỗi lưu User hoặc Student giữa giao dịch | Kiểm thử tích hợp xác nhận rollback; không xem mock là bằng chứng |
| IMP-25 | Xuất lỗi có dấu tiếng Việt và ô bắt đầu `=`, `+`, `-`, `@` | Tệp đọc được và không thực thi nội dung như công thức ngoài ý muốn |
| IMP-26 | Tệp gần giới hạn, nhiều dòng/cell | UI không treo; có loading; giới hạn tài nguyên thực tế được thống nhất |

### Email và API hàng loạt

| ID | Tình huống | Kết quả cần thấy |
| --- | --- | --- |
| MAIL-01 | Email đơn trả 200 body rỗng/envelope null | Chỉ nói đã tiếp nhận; không lỗi parse |
| MAIL-02 | 400 thiếu email, 404 không có user, 403 đã activated | Thông báo khác nhau và bước tiếp theo phù hợp |
| MAIL-03 | Bấm gửi liên tiếp, refresh/trở lại trang | Không phát request chỉ do mount/focus; cooldown không được coi là rate limit server |
| MAIL-04 | Gửi yêu cầu thành công nhưng SMTP lỗi | Không tuyên bố email đã tới; hướng dẫn kiểm tra/hỗ trợ |
| MAIL-05 | Timeout rồi người dùng muốn gửi lại | Nêu khả năng đã gửi/khóa cũ thay đổi; không tự gửi lại |
| MAIL-06 | Batch chưa đủ phụ thuộc | Không có menu thao tác thật hoặc request ngầm |
| MAIL-07 | Batch đã được mở, chọn N người | ID lấy từ server; đúng một batch; không nhập ID thủ công |
| MAIL-08 | Có ID không tồn tại hoặc user đã activated | Hành vi theo contract backend mới; không giả kết quả từng người |
| MAIL-09 | Import thành công, gửi email bước sau lỗi | Giữ kết quả import; chỉ xử lý lại bước email theo contract |
| MAIL-10 | Click liên kết email | Key được xử lý đúng qua API mới khi có; khi chưa có thì không báo activated giả |
| MAIL-11 | Không có quyền admin gọi batch trực tiếp | Backend phải từ chối trước khi mở tính năng rộng |

### Giao diện, khả năng tiếp cận và triển khai

| ID | Tình huống | Kết quả cần thấy |
| --- | --- | --- |
| UX-01 | Người mới mở trang | Nhận ra hành động chính và bước tiếp theo không cần chỉ dẫn miệng |
| UX-02 | Khung nhìn 360, 768, 1280 px; zoom 200% | Không mất nội dung/CTA; bảng có cách đọc phù hợp |
| UX-03 | Chỉ dùng bàn phím | Chọn tệp, gửi form, mở/đóng dialog, xem lỗi được |
| UX-04 | Screen reader ở form/error/status | Đọc được label, lỗi và trạng thái mới; không spam bảng |
| UX-05 | Tên dài/email dài/lỗi nhiều dòng | Không đè chữ, cắt mất thông tin quan trọng |
| UX-06 | Màu, focus, target size | Đo và kiểm tra theo 03, không chỉ cảm nhận bằng mắt |
| UX-07 | Không có API danh sách/tổng số | Không có số 0 giả, chart giả, nút xem danh sách chết |
| OPS-01 | Reload deep link React, `/api` lỗi | Trang React hoạt động; `/api` không bị trả nhầm HTML SPA |
| OPS-02 | Origin/CORS/cookie trên môi trường thật | Ghi lại hành vi chính xác; không suy từ localhost |
| OPS-03 | Console/log/network recording | Không lộ password, token, activation key hoặc toàn bộ Excel |
| OPS-04 | Production không có backend | Báo lỗi thật; không tự chuyển sang mock |

## 5. Mức kiểm thử cần thiết

- **Unit có giá trị:** đọc/kiểm tra Excel, field mapping, unwrap response, chuẩn hóa lỗi, state transition và phép đếm dòng lỗi. Không kiểm thử chỉ để lặp lại getter hoặc giá trị hard-code.
- **Component/interaction:** form validation, keyboard, pending chống gửi lặp, import 200 + false, trạng thái unknown.
- **Mock contract:** các body khác nhau của 4 endpoint, lỗi security, body rỗng, HTML, timeout. Mock phải phản ánh giới hạn hiện tại; không tự thêm userIds vào import response.
- **Tích hợp backend:** giao dịch import, ràng buộc email/name, quyền server, session/cache, mail sandbox, response body thực tế. Đây là nơi xác minh điều frontend không thể chứng minh.
- **E2E:** một luồng login → preview → import thành công; một luồng sửa lỗi; một luồng timeout; một luồng hết phiên. Email end-to-end chỉ kiểm thử khi backend đủ chức năng.
- **Kiểm tra trực quan/thủ công:** thiết bị nhỏ, zoom, keyboard, screen reader, contrast và nhận diện trạng thái.

Không dùng tài khoản sinh viên thật hoặc gửi thư thật hàng loạt để kiểm thử mặc định. Dùng dữ liệu giả và môi trường mail sandbox được dự án cung cấp; việc gửi thử tới người thật cần nằm trong phạm vi triển khai được giao.

## 6. Thử với người không rành công nghệ

Mời khoảng 5 người đại diện cho người sử dụng mục tiêu. Cho nhiệm vụ bằng ngôn ngữ tự nhiên, không chỉ vị trí nút trước. Dùng tệp giả đã chuẩn bị và tài khoản kiểm thử.

| Nhiệm vụ | Điều quan sát | Mục tiêu nghiệm thu đề xuất |
| --- | --- | --- |
| Đăng nhập và tìm nơi nhập danh sách | Có nhận ra Email và nút nhập không | Ít nhất 4/5 tự làm được |
| Nhập tệp hợp lệ | Có hiểu bước kiểm tra và lúc nào lưu không | Ít nhất 4/5 hoàn thành, thời gian thao tác dưới 3 phút, không tính chờ server |
| Sửa một lỗi email ở dòng 18 | Có tìm đúng ô F18 và chọn lại tệp không | Ít nhất 4/5 làm được không cần giải thích thuật ngữ |
| Phân biệt kết quả lỗi dữ liệu và lỗi mạng | Có nghĩ đã lưu/chưa lưu đúng không | Cả 5 hiểu timeout là chưa xác nhận, không tự bấm nhập liên tục |
| Yêu cầu email khi luồng đã mở | Có hiểu email được yêu cầu khác activated không | Không ai hiểu nhầm tài khoản đã kích hoạt chỉ vì màn hình 200 |

Đây là mục tiêu dự án, không phải kết quả đã đo hoặc chuẩn thống kê. Nếu người dùng cần hướng dẫn nhiều, sửa nhãn/bố cục/bước tiếp theo rồi thử lại. Không giải quyết sự khó dùng chỉ bằng cách bổ sung tài liệu hướng dẫn dài hơn.

## 7. Checklist hoàn thành trước bàn giao triển khai

- [ ] Mọi API dùng trong bản phát hành có nguồn và contract đã xác minh; API đề xuất không bị gọi.
- [ ] Mỗi màn hình có trạng thái quan trọng và câu thông báo theo 02/03/05.
- [ ] Không có double submit, tự replay POST hoặc optimistic success sai.
- [ ] Backend bảo vệ quyền thực tế; UI guard không được dùng thay kiểm tra server.
- [ ] Cấu trúc module đúng 04, không có fetch trong component trình bày, không trộn UI kit.
- [ ] Tệp mẫu sạch và parser preview đã đối chiếu backend.
- [ ] Kiểm thử trọng yếu tương ứng phạm vi đã qua; ghi những ca chưa chạy và lý do.
- [ ] Lint, typecheck và build production qua khi đã có ứng dụng.
- [ ] Desktop/mobile, bàn phím, tương phản và thử người dùng đã có bằng chứng.
- [ ] Bản phát hành ghi đúng phạm vi và điều kiện còn lại trong 07.

## 8. Mẫu báo cáo nghiệm thu

Ghi: phạm vi/version → màn hình/API được nghiệm thu → môi trường và dữ liệu thử → kết quả các nhóm ca → ảnh/bản ghi đã làm sạch → vấn đề còn lại và người phụ trách → quyết định phạm vi phát hành. Không đánh dấu “đã kiểm thử” cho điều chỉ được suy luận từ mã nguồn.
