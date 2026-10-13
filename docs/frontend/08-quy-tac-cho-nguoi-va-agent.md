# 08 — Quy tắc làm việc chung cho người phát triển và agent

[Về mục lục](README.md) · [Kiến trúc React](04-kien-truc-react.md) · [Nghiệm thu](06-trien-khai-va-nghiem-thu.md)

## 1. Mục đích và phạm vi

Tài liệu này là quy ước bắt buộc khi triển khai, sửa hoặc review frontend. Nó giúp nhiều người và agent tạo ra cùng một sản phẩm, thay vì các màn hình riêng lẻ có cấu trúc, cách gọi API và ngôn ngữ khác nhau.

Phạm vi mặc định là frontend trong `frontend/` được đề xuất ở 04. Không sửa backend, database, template email, dữ liệu thật hoặc cấu hình triển khai nếu nhiệm vụ không giao rõ phần đó. Khi phát hiện backend thiếu hoặc sai, ghi vào 07 và thiết kế trạng thái frontend an toàn; không âm thầm làm một API giả để che khoảng trống.

## 2. Thứ tự nguồn sự thật

Khi hai nguồn không khớp, dùng thứ tự sau để xác định hành động:

1. Hành vi backend đã được kiểm chứng trên môi trường mục tiêu và hợp đồng đã được nhóm chấp nhận.
2. Controller, DTO, service, security và cấu hình backend đang được phát hành.
3. [01 — Hợp đồng API](01-tinh-nang-va-hop-dong-api.md) và thay đổi hợp đồng đã được ghi nhận.
4. [02](02-luong-su-dung-va-man-hinh.md), [05](05-phoi-hop-api.md) và [07](07-phu-thuoc-backend.md) cho hành trình, điều phối và giới hạn.
5. [03](03-he-thong-thiet-ke.md) và [04](04-kien-truc-react.md) cho giao diện và cấu trúc.
6. Mock, thiết kế tĩnh và suy đoán cá nhân.

Mock không được dùng để “chứng minh” backend có một field hoặc endpoint. Nếu runtime và source khác nhau, dừng việc dựa trên giả định đó, ghi bằng chứng đã làm sạch và cập nhật tài liệu liên quan trước khi tiếp tục phụ thuộc vào hợp đồng mới.

## 3. Tám nguyên tắc không được phá vỡ

1. **Ưu tiên người không rành công nghệ.** Dùng tên công việc, hướng dẫn ngắn và bước tiếp theo cụ thể; không bắt người dùng hiểu ID, role, endpoint, token hoặc mã lỗi.
2. **Chỉ tuyên bố điều đã biết.** Phân biệt “đã lưu”, “chưa lưu” và “chưa xác nhận được”; phân biệt “đã tiếp nhận yêu cầu email” với “email đã đến” và “tài khoản đã kích hoạt”.
3. **Không bịa dữ liệu hoặc API.** Không tạo dashboard số liệu giả, danh sách giả trong production, nút chết hoặc endpoint suy ra từ entity/whitelist.
4. **Một thao tác ghi cần một ý định rõ.** POST phát sinh từ hành động người dùng; không gửi từ mount/effect, không tự retry, tự resume hoặc replay sau đăng nhập.
5. **Backend là nơi quyết định quyền và tính hợp lệ cuối cùng.** Frontend guard giúp trải nghiệm rõ; không thay thế kiểm tra quyền và validation server.
6. **Giữ một nguồn state cho mỗi loại dữ liệu.** Server state ở data layer, form ở form layer, workflow ở feature; không sao chép vào nhiều store rồi tự đồng bộ.
7. **Một hệ thống giao diện và một cách gọi API.** Dùng theme/component/HTTP client chung; không thêm UI kit hoặc HTTP client thứ hai cho một màn hình.
8. **Không làm mất ngữ cảnh khi lỗi.** Giữ email, tệp và preview trong phạm vi an toàn; chỉ xóa dữ liệu khi kết thúc luồng, đăng xuất/đổi user hoặc có lý do rõ ràng.

## 4. Quy trình bắt buộc cho một nhiệm vụ

### Trước khi làm

1. Xác định người dùng, mục tiêu, route và trạng thái phát hành của tính năng.
2. Đọc README, 08 và các tài liệu liên quan; với API phải đọc 01, 05 và mục BE tương ứng trong 07.
3. Kiểm tra source backend hiện tại và trạng thái working tree. Bảo toàn thay đổi không thuộc nhiệm vụ.
4. Gắn nhiệm vụ với ID màn hình Sxx, API-xx/FE-xx, BE-xx và ca kiểm thử phù hợp.
5. Liệt kê trạng thái `idle`, `pending`, `success`, lỗi có thể sửa, thiếu quyền/hết phiên và `unknown` nếu thao tác ghi có thể mất kết quả.
6. Chỉ chọn giải pháp nằm trong stack và ranh giới 04. Thay đổi kiến trúc phải có lý do và cập nhật ADR/tài liệu trước khi lan sang nhiều feature.

### Trong khi làm

- Xây lát dọc hoàn chỉnh cho một hành trình: UI → validation → API adapter → trạng thái → lỗi → kiểm thử cần thiết.
- Đặt logic ở đúng chủ sở hữu; component trình bày không tự fetch hoặc hiểu raw JSON backend.
- Tái sử dụng component đã có khi ngữ nghĩa giống nhau. Không ép một component dùng chung nếu nghiệp vụ khác nhau.
- Viết nội dung tiếng Việt cùng lúc với giao diện, gồm lỗi và bước phục hồi; không để placeholder “Lorem ipsum” hoặc thông báo tiếng Anh kỹ thuật.
- Dùng fixture giả, không dùng dữ liệu sinh viên thật. Mock chỉ hoạt động ở dev/test và được nhận diện rõ.
- Không mở tính năng có nhãn CÓ ĐIỀU KIỆN/ĐỀ XUẤT chỉ vì phần UI đã xong.
- Nếu phát hiện yêu cầu khác hợp đồng, ghi sai khác và tác động. Không âm thầm đổi payload hoặc ánh xạ để “chạy được” trong một môi trường riêng.

### Trước khi bàn giao

1. Đối chiếu toàn bộ tiêu chí chấp nhận và trạng thái quan trọng; không chỉ đường thành công.
2. Chạy kiểm tra phù hợp với thay đổi: typecheck/lint/build và kiểm thử hành vi liên quan khi ứng dụng đã tồn tại.
3. Kiểm tra bàn phím, mobile, chữ dài, pending, lỗi và thao tác gửi lặp.
4. Xác nhận không có dữ liệu thật, secret, token, key kích hoạt hoặc response nhạy cảm trong source/log/ảnh.
5. Cập nhật tài liệu nếu hành vi, cấu trúc, contract hoặc phụ thuộc thay đổi.
6. Báo cáo rõ: đã thay đổi gì, vì sao, kiểm tra nào đã chạy, giới hạn/rủi ro còn lại và điều gì chưa được xác minh.

## 5. Quy tắc giao diện và nội dung

- Mỗi trang có một H1 và một hành động chính dễ nhận ra. Nhiều nút cùng màu/chức vụ chính cần được giải thích bằng nhu cầu thật.
- Label luôn hiển thị; placeholder chỉ là ví dụ. Lỗi nằm gần trường và có tóm tắt khi form dài.
- Nút dùng động từ và đối tượng: “Nhập 120 sinh viên”, “Chọn tệp đã sửa”. Tránh “OK”, “Submit”, “Xác nhận” khi có thể nói rõ tác động.
- Không dùng icon đơn độc cho hành động mà người mới có thể không hiểu; icon trang trí được ẩn khỏi công nghệ hỗ trợ.
- Không dùng tooltip làm nơi duy nhất chứa hướng dẫn bắt buộc, đặc biệt trên thiết bị cảm ứng.
- Trạng thái thành công/lỗi có chữ và biểu tượng, không dựa riêng vào xanh/đỏ.
- Toast không giữ lỗi người dùng cần sửa. Kết quả quan trọng tồn tại trên trang cho tới khi người dùng chuyển việc.
- Dialog chỉ dùng khi cần giữ người dùng trước tác động hoặc phục hồi phiên; không biến mỗi form thành nhiều lớp modal.
- Nút disabled có lý do nhìn thấy. Nếu người dùng có thể sửa điều kiện, chỉ thẳng điều cần sửa.
- Nội dung mặc định tiếng Việt có dấu. Thuật ngữ tiếng Anh chỉ giữ khi người dùng thực sự cần nhận diện, ví dụ tên định dạng `.xlsx`.

Mọi thay đổi giao diện dùng chung phải đối chiếu 03. Nếu cần màu, cỡ chữ hoặc khoảng cách mới, bổ sung token có ý nghĩa; không tạo giá trị riêng chỉ để khớp một ảnh thiết kế.

## 6. Quy tắc API và dữ liệu

- Mỗi endpoint có module API của feature, schema/contract đầu vào và mapper đầu ra. Page/component không ghép URL, header hay unwrap envelope.
- Chỉ gọi endpoint có nhãn HIỆN CÓ và đã được xác minh đủ cho môi trường. API đề xuất nằm sau capability flag và không có request production cho tới khi contract được cập nhật.
- Không gửi access token cũ vào endpoint public không cần token. Không gửi token tới URL ngoài backend đã cấu hình.
- Không đặt multipart `Content-Type` thủ công khi gửi FormData; field nhập hiện tại phải là `file`.
- HTTP 2xx chưa đủ xác định thành công nghiệp vụ. Riêng import phải kiểm tra `data.success`; API void chấp nhận body theo contract đã xác minh.
- Không retry mutation tự động. Sau timeout của request ghi, dùng trạng thái `unknown` nếu server có thể đã xử lý.
- Không optimistic update khi response không cung cấp dữ liệu đủ để xác định trạng thái mới.
- Không cache/persist File, nội dung Excel, password hoặc dữ liệu cá nhân vào storage. Dữ liệu query riêng phải bị xóa khi logout/đổi user.
- Không hiện raw server message như HTML; ánh xạ mã đã biết, render text, có fallback. Không bỏ lỗi field mới chỉ vì chưa dịch.
- Không log body login, Authorization, cookie, key kích hoạt, email hoặc nội dung từng dòng Excel. Log đo lường chỉ dùng dữ liệu tổng hợp đã làm sạch.
- Không dựa vào client để giữ bí mật hoặc xác thực quyền. Mọi biến Vite trong bundle đều được coi là công khai.

Để “phối hợp API thông minh”, ưu tiên dùng kết quả response hiện có, chạy kiểm tra cục bộ trước request tốn kém, gộp theo API batch đã được backend hỗ trợ, hủy/loại response đọc đã lỗi thời và invalidate đúng dữ liệu. Không gọi nhiều API chỉ để tạo cảm giác tự động.

## 7. Quy tắc cấu trúc và phụ thuộc

| Nơi | Được chứa | Không được chứa |
| --- | --- | --- |
| `app` | Provider, router, layout, cấu hình toàn ứng dụng | Logic import hoặc validation của một feature |
| `pages` | Ghép layout/feature theo route, điều phối ở cấp màn hình | HTTP raw, parser Excel, component dùng chung tùy tiện |
| `features/*/api` | Contract, request và mapper của feature | JSX bố cục trang |
| `features/*/model` | Kiểu nghiệp vụ, schema, workflow/state machine | Cấu hình global và UI kit |
| `features/*/components` | UI nghiệp vụ của feature | Gọi fetch trực tiếp hoặc phụ thuộc page |
| `features/*/hooks` | Điều phối UI, form và data layer của feature | DOM trình bày lớn hoặc hard-code route ngoài trách nhiệm |
| `shared/api` | HTTP client, envelope/error chung | Mã riêng của student import |
| `shared/ui` | Thành phần thật sự dùng ở nhiều feature | Màn hình nghiệp vụ chỉ có một nơi dùng |
| `shared/lib` | Hàm thuần, độc lập nghiệp vụ hoặc đã được khái quát đúng | “utils” gom mọi hàm không biết đặt đâu |

Không import ngược hướng trong sơ đồ 04. Khi hai feature cần phối hợp, page/app điều phối qua public API của từng feature; không cho feature A truy cập sâu file nội bộ của feature B. Không thêm abstraction trước khi có ít nhất một trách nhiệm rõ và lợi ích kiểm chứng được.

## 8. Quy tắc kiểm thử và mock

Kiểm thử rủi ro người dùng thay vì số dòng mã. Ưu tiên:

1. Gửi đúng một request khi bấm/Enter liên tiếp.
2. Import 200 + false không báo thành công.
3. Timeout sau gửi không tự retry và hiện “chưa xác nhận”.
4. 401/403 có luồng khác nhau; đăng nhập lại không tự replay POST.
5. Parser/preview đồng nhất backend với tệp biên quan trọng.
6. Keyboard, focus, screen reader và responsive cho hành trình phát hành.

Mock handler phải bám fixture thật đã làm sạch và có ít nhất đường thành công, lỗi nghiệp vụ, lỗi xác thực/quyền, body ngoài hợp đồng và mạng chậm cho feature có request. Không để mock production tự bật. Snapshot giao diện không thay kiểm thử hành vi; test một giá trị hard-code hoặc implementation detail không được coi là bằng chứng UX.

Khi một vấn đề phụ thuộc backend, thêm kiểm thử tích hợp/backend hoặc ghi rõ chưa kiểm chứng; không viết test frontend với mock “đẹp” rồi đóng vấn đề.

## 9. Quy tắc thay đổi hợp đồng hoặc kiến trúc

### Khi API thay đổi

1. Thu thập method/path/request/response/status/quyền/lỗi và fixture mới.
2. Cập nhật 01 và mục BE liên quan trong 07.
3. Đánh giá tác động tới màn hình 02, state 05 và test 06.
4. Cập nhật schema/adapter của feature; không truyền raw format mới ra toàn ứng dụng.
5. Có kế hoạch tương thích trong thời gian frontend/backend lệch phiên bản nếu triển khai không đồng thời.
6. Chỉ mở capability sau kiểm thử end-to-end phù hợp.

### Khi muốn thêm thư viện hoặc đổi cấu trúc

Người đề xuất phải nêu vấn đề hiện tại, lựa chọn đã xem, chi phí bundle/bảo trì, khả năng tiếp cận, giấy phép, tác động migration và cách gỡ bỏ. Ghi quyết định ở 04 nếu ảnh hưởng nhiều feature. Không thêm thư viện trùng nhiệm vụ của công cụ đã chọn chỉ để giải quyết một đoạn mã nhỏ.

### Khi tài liệu và code lệch nhau

Không coi tài liệu cũ luôn đúng hoặc code mới luôn hợp lệ. Xác định thay đổi có được chấp nhận không, sửa nguồn sai trong cùng phạm vi và báo rõ. Nếu chưa xác định, giữ tính năng ở trạng thái an toàn và ghi điểm cần quyết định; không chọn phương án làm người dùng hiểu sai kết quả.

## 10. Mẫu giao việc cho người hoặc agent

```text
Mục tiêu người dùng:
Vai trò:
Màn hình/route (Sxx):
API/feature (API-xx, FE-xx):
Phụ thuộc backend (BE-xx):

Hành vi cần có:
-

Trạng thái bắt buộc:
- idle / pending / success / correctable error / unauthorized / forbidden / unknown

Ngoài phạm vi:
-

Tiêu chí chấp nhận (gắn test ID):
-

Bằng chứng kiểm tra cần bàn giao:
-
```

Mẫu này buộc nhiệm vụ bắt đầu từ kết quả người dùng, đồng thời làm rõ API và giới hạn. Có thể bỏ trạng thái không áp dụng, nhưng phải cân nhắc trước khi bỏ.

## 11. Mẫu báo cáo hoàn thành

```text
Kết quả:
Tệp/module thay đổi:
Hành vi người dùng trước → sau:
API/contract sử dụng:
Kiểm tra đã chạy và kết quả:
Khả năng tiếp cận/mobile đã kiểm tra:
Giới hạn hoặc điều chưa xác minh:
Tài liệu đã cập nhật:
```

Không viết “đã xong” nếu chỉ hoàn thành UI tĩnh, dùng mock chưa đối chiếu hoặc bỏ qua trạng thái lỗi có thể làm người dùng hiểu sai dữ liệu.

## 12. Checklist review ngắn

- [ ] Người mới hiểu việc chính và bước tiếp theo bằng tiếng Việt.
- [ ] Không có API/dữ liệu/tổng số/chức năng được bịa ra.
- [ ] Kết quả thành công, lỗi dữ liệu và chưa xác nhận được phân biệt.
- [ ] POST không tự chạy, tự retry, tự resume hoặc gửi lặp.
- [ ] Quyền được backend kiểm tra; role lạ không được nâng quyền.
- [ ] Component, state và dependency đúng ranh giới 04.
- [ ] Theme/nội dung/trạng thái tuân thủ 02–03.
- [ ] Tệp, token, password và dữ liệu cá nhân không bị persist/log sai.
- [ ] Kiểm thử tập trung vào rủi ro thực và có bằng chứng.
- [ ] Tài liệu và mã nguồn còn đồng bộ sau thay đổi.
