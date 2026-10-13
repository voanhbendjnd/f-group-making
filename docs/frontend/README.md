# Đặc tả frontend React — F Group Making

> [Student Profile](12-student-profile.md): API, UI, VI/EN and testing.

> **Cập nhật 12/10/2026:** Đã triển khai Academic Term Filter ([11 — Academic Term Filter](11-academic-term-filter.md)) và khu vực giảng viên, quản lý lớp/Rule cùng kiểm tra quyền theo lớp ([11 — Giảng viên và quy định nhóm](11-giang-vien-va-quy-dinh-nhom.md)). Các mục rà soát 29/09 bên dưới là tài liệu lịch sử.


> Mục tiêu ưu tiên: người không rành công nghệ biết mình đang ở đâu, cần làm gì tiếp theo và thao tác vừa rồi đã có kết quả gì.

Bộ tài liệu này là căn cứ triển khai frontend, thiết kế giao diện và phối hợp giữa người phát triển với agent. Đây là tài liệu thiết kế; chưa tạo ứng dụng React, chưa thay đổi backend, chưa gọi API để ghi dữ liệu hoặc gửi email.

## 1. Phạm vi và mức độ xác minh

- Rà soát ngày **29/09/2026**, tại mã nguồn có HEAD `0679187` và các tệp trong working tree.
- Backend được đọc tại `server/`. Chưa có ứng dụng frontend hoặc `package.json` trong phạm vi đã kiểm tra.
- Có **4 endpoint nghiệp vụ do ứng dụng khai báo**, trong `AccountResource` và `StudentResource`. Các endpoint tự động của framework, nếu được bật, không phải tính năng người dùng trong đặc tả này.
- Hợp đồng API được suy ra từ controller, service, DTO và security. **Chưa kiểm thử HTTP thực tế**; không xem ví dụ trong tài liệu là phản hồi đã thu được từ máy chủ.
- Đường dẫn xuất hiện trong whitelist, entity, repository hoặc hàm service không đồng nghĩa với API đã tồn tại.

## 2. Quyết định sản phẩm

Giao diện dùng tiếng Việt, nền sáng, chữ rõ, ít thành phần trên mỗi màn hình. Mỗi bước có một hành động chính. Các thao tác kỹ thuật được chuyển thành công việc quen thuộc: “Nhập sinh viên từ Excel”, “Gửi email kích hoạt”, “Chọn tệp đã sửa”.

### Flow nghiệp vụ mục tiêu đã xác nhận

1. Sinh viên không tự đăng ký tài khoản.
2. Quản trị viên import Excel có đủ thông tin sinh viên; hệ thống tạo hồ sơ sinh viên và tài khoản ở trạng thái chờ kích hoạt.
3. Quản trị viên mở danh sách sinh viên, chọn **một**, **nhiều** hoặc **toàn bộ sinh viên phù hợp** rồi bấm gửi email kích hoạt.
4. Hệ thống tạo và lưu liên kết/token kích hoạt cho từng tài khoản, gửi email và cho quản trị viên biết yêu cầu nào đã được tiếp nhận/xử lý.
5. Sinh viên mở liên kết, xác nhận tài khoản, thiết lập mật khẩu rồi mới có thể đăng nhập.

Backend hiện tại mới đáp ứng phần import và một phần yêu cầu gửi email; chưa đáp ứng flow hoàn chỉnh từ chọn người nhận đến sinh viên kích hoạt và đăng nhập. Bảng đối chiếu cụ thể nằm trong [01](01-tinh-nang-va-hop-dong-api.md) và các phụ thuộc nằm trong [07](07-phu-thuoc-backend.md).

Luồng chính có thể triển khai trước cho quản trị viên là **đăng nhập → chọn tệp → kiểm tra trước khi nhập → nhập và xem kết quả**. Luồng gửi email hàng loạt đã được đặc tả nhưng chưa được bật cho người dùng vì thiếu nguồn danh sách ID và còn lỗi phía backend. Không biến giới hạn này thành yêu cầu người dùng nhập ID kỹ thuật.

Phối hợp API thông minh nghĩa là tái sử dụng dữ liệu đã có, chỉ gọi khi cần, tránh gửi lặp, phân biệt kết quả thật với kết quả chưa biết và đưa ra bước tiếp theo phù hợp. Không tự động gọi mọi API chỉ vì chúng tồn tại.

## 3. Đọc tài liệu theo vai trò

| Người đọc | Thứ tự đọc |
| --- | --- |
| Chủ sản phẩm, người thiết kế | README → 02 → 03 → 06 → 07 |
| Người triển khai React | README → 08 → 01 → 04 → 05 → 02 → 03 → 06 |
| Người làm backend | 01 → 07 → 05 → 06 |
| Người kiểm thử | 01 → 02 → 05 → 06 → 07 |
| Agent nhận việc | Đọc 08 trước khi lập kế hoạch; đọc các tài liệu liên quan trước khi sửa |

## 4. Danh mục tài liệu

| Tài liệu | Nội dung và quyền quyết định |
| --- | --- |
| [01 — Tính năng và hợp đồng API](01-tinh-nang-va-hop-dong-api.md) | Nguồn sự thật về API hiện có, payload, quyền, kết quả, định dạng Excel |
| [02 — Luồng sử dụng và màn hình](02-luong-su-dung-va-man-hinh.md) | Điều hướng, bố cục, từng bước thao tác, thông báo và phục hồi |
| [03 — Hệ thống thiết kế](03-he-thong-thiet-ke.md) | Màu, chữ, khoảng cách, thành phần dùng chung, responsive và khả năng tiếp cận |
| [04 — Kiến trúc React](04-kien-truc-react.md) | Stack, cấu trúc thư mục, ranh giới module, quản lý state và quy ước React |
| [05 — Phối hợp API](05-phoi-hop-api.md) | Điều phối request, phiên đăng nhập, lỗi, retry, cache và luồng nhiều bước |
| [06 — Triển khai và nghiệm thu](06-trien-khai-va-nghiem-thu.md) | Thứ tự thực hiện, tiêu chí hoàn thành, kịch bản kiểm thử và thử với người dùng |
| [07 — Phụ thuộc backend](07-phu-thuoc-backend.md) | Những điểm cần bổ sung hoặc sửa, bằng chứng, ảnh hưởng và điều kiện mở tính năng |
| [08 — Quy tắc cho người và agent](08-quy-tac-cho-nguoi-va-agent.md) | Quy tắc bắt buộc, bàn giao, quản lý thay đổi và mẫu giao việc |
| [09 — Hướng dẫn vận hành và Báo cáo triển khai](09-huong-dan-van-hanh-frontend.md) | Kiến trúc đã code, danh mục API thực tế, các flow và hướng dẫn chạy kiểm thử |
| [10 — Hỗ trợ đa ngôn ngữ (i18n)](10-da-ngon-ngu-i18n.md) | Kiến trúc i18n, cấu trúc từ điển song ngữ vi/en, component chuyển đổi và quy tắc |

## 5. Nhãn trạng thái thống nhất

| Nhãn | Ý nghĩa |
| --- | --- |
| **HIỆN CÓ** | Đã tìm thấy endpoint trong mã nguồn; vẫn cần kiểm chứng runtime |
| **FRONTEND** | Có thể làm bằng trình duyệt, không đòi hỏi API mới |
| **CÓ ĐIỀU KIỆN** | Có một phần backend nhưng chưa đủ cho trải nghiệm hoàn chỉnh |
| **ĐỀ XUẤT** | Chưa có API; chỉ là hướng mở rộng, không được gọi như API thật |

Các nhãn này phục vụ nhóm triển khai. Giao diện người dùng không hiển thị thuật ngữ “endpoint”, “backend blocker” hay “HTTP contract”.

## 6. Chuẩn nền tảng đã chọn

Đề xuất cho dự án: React + TypeScript + Vite, React Router ở Data Mode, TanStack Query cho tác vụ API, React Hook Form + Zod cho biểu mẫu, Material UI với một theme dùng chung. Cấu trúc chia theo tính năng, có ranh giới phụ thuộc rõ ràng.

Đây là quyết định kiến trúc phù hợp ứng dụng nghiệp vụ dùng Spring REST hiện tại, không phải khẳng định React có một cây thư mục bắt buộc cho mọi hệ thống. Lý do, giới hạn và nguồn chính thức nằm trong [04](04-kien-truc-react.md).

## 7. Điều kiện không được bỏ qua

1. Không báo “nhập thành công” chỉ dựa vào HTTP 200; phải đọc `data.success`.
2. Không báo “email đã đến” hoặc “tài khoản đã kích hoạt” sau API yêu cầu gửi email.
3. Không tự gửi lại POST khi mạng lỗi hoặc hết thời gian chờ.
4. Không tạo danh sách sinh viên, số liệu tổng, trạng thái kích hoạt hay nhóm bằng dữ liệu giả trong bản dùng thật.
5. Không yêu cầu người dùng biết `userId`, tên role hoặc mã lỗi.
6. Không làm người dùng mất ngữ cảnh khi có lỗi; giữ tệp trong bộ nhớ khi trang còn mở và chỉ rõ cách tiếp tục.
7. Không quảng bá quy trình kích hoạt hoàn chỉnh trước khi backend có bước xác nhận và thiết lập mật khẩu.

## 8. Cách duy trì bộ tài liệu

Khi hợp đồng API thay đổi, cập nhật 01 và 07 trước, sau đó cập nhật luồng 02, điều phối 05 và tiêu chí 06. Khi đổi giao diện dùng chung, cập nhật 03. Khi đổi cấu trúc hoặc công nghệ, ghi lý do trong 04. Quy tắc thực hiện chi tiết nằm trong 08.

Nếu tài liệu và mã nguồn không khớp, ghi rõ sai khác rồi cập nhật căn cứ. Không âm thầm đoán một hợp đồng mới. Những điểm chưa xác minh runtime phải tiếp tục được đánh dấu cho đến khi có bằng chứng.
