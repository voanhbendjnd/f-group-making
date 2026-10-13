# 03 — Hệ thống thiết kế giao diện

[Về mục lục](README.md) · [Luồng và màn hình](02-luong-su-dung-va-man-hinh.md)

## 1. Hướng thẩm mỹ

Giao diện sáng, gọn, có khoảng thở; nội dung và hành động quan trọng được nhận ra trước phần trang trí. Dùng xanh lam làm màu hành động, nền xám rất nhạt, bề mặt trắng, đường viền nhẹ và bo góc vừa phải. Hình minh họa chỉ xuất hiện khi giúp hiểu thao tác hoặc trạng thái trống.

Không dùng gradient đậm, glassmorphism, nền chuyển động, bảng quá dày hoặc nhiều thẻ số liệu không có ích. Không dùng màu sắc để thay thế chữ. Mục tiêu là một công cụ làm việc đẹp và bình tĩnh, dễ sử dụng trong thời gian dài.

## 2. Bộ giá trị dùng chung

Các giá trị sau là quyết định thiết kế dự án. Khi triển khai, đưa vào một theme Material UI; không chép mã màu và khoảng cách rải rác. MUI hỗ trợ tùy chỉnh theme cho các thành phần; dự án dùng cơ chế này để giữ nhất quán. [Tài liệu theme của MUI](https://mui.com/material-ui/customization/theming/).

### Màu sắc

| Token ý nghĩa | Giá trị khởi điểm | Cách dùng |
| --- | --- | --- |
| Nền trang | `#F6F8FC` | Toàn bộ vùng ngoài card |
| Bề mặt | `#FFFFFF` | Form, bảng, dialog |
| Chữ chính | `#172B4D` | Tiêu đề, nội dung quan trọng |
| Chữ phụ | `#475569` | Mô tả, nhãn phụ; không giảm opacity tùy ý |
| Hành động chính | `#1D4ED8` | Nút chính với chữ trắng, link, focus |
| Hover chính | `#1E40AF` | Nút đang hover |
| Đang chọn | `#EFF6FF` | Nền menu hoặc dòng đang chọn; kèm chữ/icon |
| Thành công | `#166534` trên `#F0FDF4` | Kết quả đã lưu |
| Cần chú ý | `#92400E` trên `#FFFBEB` | Cảnh báo cần đọc |
| Lỗi | `#B91C1C` trên `#FEF2F2` | Lỗi cần sửa |
| Viền trang trí | `#D8E0EB` | Chia vùng; không dùng làm dấu hiệu duy nhất của input |
| Viền điều khiển | `#64748B` | Input/checkbox chưa focus cần nhìn rõ |

Phải đo tương phản ở trạng thái thực tế, gồm disabled, hover, focus và theme override. Mã màu ở đây không thay thế kiểm tra khả năng tiếp cận của cả màn hình.

### Chữ, khoảng cách và hình khối

| Thuộc tính | Quy tắc |
| --- | --- |
| Font | Một font sans-serif hỗ trợ đầy đủ tiếng Việt, đề xuất Noto Sans; self-host khi triển khai; system sans-serif dự phòng |
| Nội dung chính | 16 px, line-height khoảng 1,5 |
| Nhãn/bảng | Tối thiểu 14 px, line-height khoảng 1,5; ưu tiên 16 px nếu không thiếu chỗ |
| Tiêu đề trang | 28–32 px desktop, 24 px mobile, độ đậm 600–700 |
| Tiêu đề khu vực | 20–24 px |
| Chú thích | 14 px; không đặt hướng dẫn quan trọng bằng chữ cực nhỏ |
| Khoảng cách | Thang 4, 8, 12, 16, 24, 32, 48 px |
| Đệm card | 24 px desktop, 16 px mobile |
| Bo góc | 8 px điều khiển, 12 px card, 16 px dialog |
| Chiều cao input/nút chính | Khoảng 44–48 px, vùng bấm ít nhất 44 × 44 px theo mục tiêu dự án |
| Đổ bóng | Nhẹ; chủ yếu cho lớp nổi như dialog, không tạo nhiều lớp card lồng nhau |
| Icon | Một bộ MUI icons; thống nhất kích thước 20/24 px; hành động quan trọng luôn có chữ |

Không dùng chữ in hoa toàn bộ cho câu dài hoặc nút mặc định. Hiển thị tên người và văn bản tiếng Việt đúng dấu. Không cắt email/lỗi theo cách khiến người dùng không nhận diện được dữ liệu; cho xuống dòng hoặc xem đầy đủ.

## 3. Khung trang và responsive

| Kích thước khung nhìn | Bố cục |
| --- | --- |
| Dưới 600 px | Một cột; lề 16 px; menu trong drawer có nhãn; CTA toàn chiều rộng khi phù hợp |
| 600–899 px | Một hoặc hai vùng tùy nội dung; không cố ép bảng vào card hẹp |
| Từ 900 px | Sidebar khoảng 232 px, topbar 64 px, vùng nội dung rộng tối đa khoảng 1200 px |
| Màn rộng | Căn vùng nội dung, không kéo dòng mô tả từ mép trái tới mép phải |

Form nhập liệu đơn giản có bề rộng khoảng 480–640 px; form login khoảng 420 px. Wizard dùng bề rộng lớn hơn khi có preview. Mỗi trang có một H1, mô tả ngắn, vùng nội dung và vùng hành động theo thứ tự ổn định.

Trên điện thoại, bảng lỗi chuyển thành từng thẻ gồm “Dòng Excel → trường cần sửa → cách sửa”; giữ toàn bộ thông tin. Bảng preview có thể cuộn ngang trong vùng có nhãn/hướng dẫn, không làm cả trang cuộn ngang. Dùng header cố định nếu cần, nhưng không che phần tử đang focus.

Nút chính của bước có thể cố định ở đáy màn nhỏ nếu có đủ khoảng đệm và không che bàn phím/nội dung. Khi bàn phím mở phải nhìn thấy trường đang nhập và lỗi của trường đó.

## 4. Danh mục thành phần dùng chung

| Thành phần quy ước | Trách nhiệm | Không làm |
| --- | --- | --- |
| AppShell | Sidebar, topbar, điều hướng theo capability | Tự gọi tất cả API nghiệp vụ |
| PageHeader | Tiêu đề, mô tả, một hành động chính nếu cần | Chứa nhiều thanh công cụ cạnh tranh |
| PrimaryAction | Nút có loading, khóa bấm lặp, tên hành động | Tự quyết định retry request |
| FormField | Label, input, mô tả, lỗi và liên kết truy cập | Thay label bằng placeholder |
| StatusPanel | Kết quả thành công/cần sửa/chưa biết | Chỉ dựa vào màu sắc |
| EmptyState | Giải thích chưa có dữ liệu và bước bắt đầu | Hiển thị “0” thay cho lỗi tải dữ liệu |
| FilePicker | Chọn tệp bằng bàn phím/chuột, tên/dung lượng | Tự upload khi người dùng chọn tệp |
| StepProgress | Tên bước, bước đang làm, bước đã xong | Cho nhảy tới kết quả chưa có |
| ConfirmDialog | Xác nhận tác động cần cân nhắc, quản lý focus | Lồng nhiều dialog hoặc hỏi lại mọi thao tác |
| InlineHelp | Ví dụ hoặc giải thích ngắn tại chỗ | Bắt người dùng rời việc đang làm |
| SessionExpiredDialog | Form đăng nhập lại và quay về bản nháp | Tự replay POST đã thất bại |

`ImportPreview`, `ImportErrorTable`, `ImportSummary`, `ActivationRecipients` là thành phần nghiệp vụ trong feature tương ứng; không đẩy vào shared chỉ vì muốn tái sử dụng trong tương lai. Thành phần cần dùng lại bởi nhiều feature mới được cân nhắc đưa vào thư viện chung.

## 5. Trạng thái bắt buộc

| Trạng thái | Hình thức | Cách diễn đạt |
| --- | --- | --- |
| Chưa bắt đầu | Vùng chọn/hướng dẫn rõ | “Chọn tệp Excel để bắt đầu.” |
| Đang đọc tệp | Loading trong khu vực tệp | “Đang kiểm tra tệp trên thiết bị…” |
| Đang gửi | Nút pending + mô tả trong trang | “Đang gửi và kiểm tra danh sách…” |
| Thành công đã xác nhận | Panel xanh có icon + tiêu đề | “Đã nhập 120 sinh viên.” |
| Dữ liệu chưa hợp lệ | Panel và lỗi theo dòng/trường | “Chưa lưu sinh viên nào. Hãy sửa 4 dòng bên dưới.” |
| Chưa xác nhận kết quả | Panel cảnh báo bền vững | “Chưa xác nhận được kết quả nhập.” |
| Thiếu quyền | Trang/panel có đường quay lại | “Tài khoản này chưa có quyền nhập sinh viên.” |
| Mất kết nối trước gửi | Giữ form, giải thích gần CTA | “Chưa có kết nối mạng. Hãy kết nối rồi thử lại.” |

`navigator.onLine` chỉ là tín hiệu hỗ trợ, không đảm bảo server truy cập được. Không đánh đồng trạng thái “chưa có dữ liệu” với “không tải được”. Toast chỉ dành cho phản hồi phụ ngắn; kết quả nhập và lỗi cần xử lý luôn nằm trên trang.

## 6. Quy tắc viết nội dung

| Tránh trên UI | Dùng thay thế |
| --- | --- |
| Submit / Execute / Import data | Đăng nhập / Gửi email / Nhập sinh viên |
| Invalid payload | Một số thông tin chưa đúng. Hãy kiểm tra các mục được đánh dấu. |
| Unauthorized / Token expired | Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại. |
| Success sau gửi email | Đã tiếp nhận yêu cầu gửi email. |
| userId / role / originalMajor | Tên và email / Vai trò / Mã ngành theo danh sách gốc |
| Error at row 12 | Dòng 12 trong tệp Excel cần được sửa. |

Nguyên tắc: nói điều đã biết, nói việc người dùng làm được tiếp theo. Nếu chưa biết đã lưu chưa, dùng “chưa xác nhận” thay vì “thất bại”. Không lộ stack trace, SQL, token, tên class hay endpoint trong thông báo người dùng.

Số liệu dùng định dạng tiếng Việt; thời gian sự kiện hiển thị theo `Asia/Ho_Chi_Minh`, kèm ngày khi có nguy cơ nhầm. Mã sinh viên/member code là chuỗi định danh, không thêm dấu phân cách hàng nghìn hoặc chuyển số làm mất số 0 đầu.

## 7. Khả năng tiếp cận

Mục tiêu nghiệm thu là WCAG 2.2 AA cho các màn hình phát hành. Văn bản thông thường cần tương phản ít nhất 4,5:1, văn bản lớn ít nhất 3:1; người dùng phải thao tác được bằng bàn phím, nhìn thấy focus và nhận biết lỗi mà không chỉ dựa vào màu. Nguồn tiêu chí: [W3C WCAG 2.2 Quick Reference](https://www.w3.org/WAI/WCAG22/quickref/).

Quy tắc áp dụng của dự án:

- Thứ tự Tab theo thứ tự đọc; không bẫy focus; có đường bỏ qua menu tới nội dung chính.
- Button/link/input dùng ngữ nghĩa HTML phù hợp. Vùng kéo thả luôn có nút chọn tệp tương đương.
- Dialog đặt focus hợp lý, giữ focus bên trong khi mở, trả focus về nút đã mở khi đóng.
- Có label và mô tả gắn với input; khi submit lỗi, focus tới tóm tắt lỗi hoặc trường lỗi đầu tiên và cho đi tới từng trường.
- Thông báo trạng thái được đọc bởi công nghệ hỗ trợ; không đọc lại toàn bộ bảng lỗi sau mỗi lần render.
- Cỡ chữ phóng 200% vẫn dùng được; kiểm tra bố cục ở khung nhìn 320 px và thiết bị rộng hơn.
- Tôn trọng reduced motion; animation ngắn khoảng 120–200 ms là lựa chọn thiết kế, không trì hoãn công việc.
- Mục tiêu vùng bấm 44 px của dự án rộng hơn ngưỡng tối thiểu trong một số tiêu chí WCAG; không dùng con số này để thay thế đánh giá toàn bộ tiêu chí.

## 8. Bàn giao thiết kế

Mỗi màn hình cần có bản desktop và mobile, trạng thái đang xử lý, thành công, lỗi và chưa xác nhận nếu áp dụng. Người review đối chiếu cùng theme, cùng nhãn hành động và cùng cách đặt lỗi. Chưa hoàn thành thiết kế nếu chỉ có một ảnh đẹp ở trạng thái thành công.

Khi triển khai có thể dùng Storybook cho các thành phần có nhiều trạng thái nếu nhóm cần; chưa cần bổ sung công cụ chỉ để chứa một nút đơn giản. Các ví dụ thiết kế phải dùng dữ liệu giả, dễ phân biệt với dữ liệu thật.
