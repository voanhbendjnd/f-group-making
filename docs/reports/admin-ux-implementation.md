# Kết quả triển khai cải thiện UX/UI Admin

Ngày: 21/10/2026. Nhánh: `feat/admin-ux-improvements`, tách từ `develop` tại `29ab7af`.

Đối chiếu: [Báo cáo đánh giá và đề xuất](admin-ux-ui-review.md). Đây là ghi nhận thay đổi thực tế, không thay thế bản đánh giá ban đầu. Phạm vi sửa là frontend; tái sử dụng các API hiện có. Chưa triển khai các năng lực nghiệp vụ/API mới ở mục 5 dưới đây.

## 1. Thay đổi theo vấn đề ưu tiên

| Mã | Kết quả triển khai | Giới hạn kiểm chứng |
| --- | --- | --- |
| UX-01 | “Toàn bộ phù hợp” tải đủ trang với search, ngành, trạng thái tài khoản, liên kết và kỳ; xác nhận danh sách cụ thể rồi gửi tập ID. Không gọi API activate-all vốn không hỗ trợ đủ bộ lọc. Lỗi ở một trang chặn gửi. | Đây là ảnh chụp danh sách tại thời điểm xem xét; server vẫn quyết định điều kiện cuối khi gửi. Chưa có job batch/dry-run phía server. |
| UX-02 | Lưu thông tin các dòng đã chọn trong bộ nhớ qua trang; số đủ điều kiện/bỏ qua tính trên toàn tập đã chọn. Đổi bộ lọc xóa lựa chọn cũ. | Không lưu lựa chọn hoặc thông tin cá nhân vào storage. |
| UX-03 | Form thêm sinh viên mặc định kỳ đang xem. | Có hồi quy cho trường hợp kỳ đang xem khác kỳ hiện tại. |
| UX-04 | Import sinh viên/giảng viên tải mẫu riêng, đúng tên file. Bổ sung `public/sample-lecturers.xlsx`, sheet `Mentors`, hai cột `Mentor`, `Email`. | Đối chiếu cấu trúc parser FE/BE trong mã nguồn; chưa upload vào backend chạy thật. |
| UX-05 | Thêm cơ chế cảnh báo rời trang/đổi kỳ cho các bản nháp form chính, tệp import, quy tắc và bảng nhóm; cảnh báo đóng tab trình duyệt. Giữ ngữ cảnh khi đang ghi. | Cần nghiệm thu thao tác thực tế với phiên đăng nhập và dữ liệu staging. |
| UX-06 | Tạo/gia hạn/đóng deadline giữ khóa chuyển kỳ trong request. Tạo/gia hạn chặn các đường đóng khi đang gửi, giữ lỗi và trạng thái kết quả chưa xác định để tránh gửi lại ngay. | Không có mã tác vụ để truy vấn kết quả ghi; phải kiểm tra danh sách/chi tiết trước khi thao tác tiếp. |
| UX-07 | Danh sách lớp cho deadline tải đủ trang, có loading/lỗi/thử lại riêng. Hiện lớp đã chọn, phần nút cuối dễ tiếp cận hơn. | Tải toàn bộ dùng API phân trang hiện có; chưa có bộ chọn tìm kiếm phía server cho dữ liệu cực lớn. |
| UX-08 | Xóa giảng viên ghi rõ “tài khoản toàn hệ thống”, xác nhận đúng các danh tính bị tác động; tách khỏi ý nghĩa bỏ phân công trong kỳ. | Tác động phụ thuộc và quyền cuối cùng do backend xác nhận. |
| UX-09 | Thêm route Admin cho duyệt nhóm, bảng nhóm và phân nhóm tự động; mở từ deadline/lớp vẫn giữ khung Admin. Lớp có tab nhóm và chọn đợt rõ ràng. | Giữ bộ lọc khi quay từ bảng nhóm về duyệt nhóm, hoặc về tab Nhóm khi đi từ lớp; chưa bổ sung lưu toàn bộ trạng thái mọi màn hình. |
| UX-10 | Preview xuất có lựa chọn toàn lớp/kết quả lọc và số dòng cụ thể. Chặn xuất khi không có dữ liệu hoặc đọc nhóm lỗi. Kiểm tra tất cả trang deadline khi cần tìm phiên; nhiều phiên không tự chọn phiên đầu. | Không thay đổi định dạng Excel nghiệp vụ hiện có. |
| UX-11 | Sau thêm giảng viên, mở phạm vi toàn hệ thống và làm mới danh sách, tránh người mới bị ẩn vì chưa được phân công. | Dùng tìm kiếm hiện có để tra cứu; chưa có trang hồ sơ chi tiết giảng viên mới. |
| UX-12 | Bộ lọc/huy hiệu mô tả trạng thái liên kết kích hoạt; không coi activation key là bằng chứng email đã đến. Kết quả batch mô tả số được tiếp nhận/xử lý. | Chưa có tracking queued/sent/delivered/failed hoặc lịch sử mail bền vững. |

## 2. Bố cục và hành trình đã sửa

- **Khung Admin:** học kỳ ở header, vẫn nhìn thấy khi thu gọn sidebar; menu chia nhóm công việc, bỏ mục import chung dễ nhầm và đăng xuất trùng. Hộp thoại dùng ID tiêu đề riêng, quản lý focus, Tab/Shift+Tab và khôi phục focus.
- **Dashboard:** thẻ sinh viên, tài khoản chờ kích hoạt, lớp, đợt đang mở; đường vào lớp thiếu giảng viên; danh sách deadline/sinh viên gần đây; hướng dẫn thiết lập thu gọn. Từng khối có trạng thái tải/lỗi riêng, không hiển thị 0 thay dữ liệu tải lỗi.
- **Sinh viên:** có cột lớp, giữ bộ lọc/trang trong URL theo kỳ, sửa trạng thái trống do bộ lọc liên kết; xác nhận người nhận trước batch; chống click gửi lặp và không tự retry request ghi.
- **Giảng viên:** gộp phạm vi và bộ lọc; nhãn Việt/Anh; chọn qua trang, xác nhận kích hoạt/xóa; phân trang về trang hợp lệ sau xóa. Cooldown chỉ lưu ID và thời hạn, không lưu tên/email.
- **Import:** chọn/thay/xóa tệp rõ nghĩa, chọn lại cùng tên tệp được; hỗ trợ Enter/Space. Hiện phạm vi, định dạng và giới hạn kiểm tra cục bộ. Kết quả giảng viên hiển thị tại một màn hình với hai hướng tiếp tục. Khi ghi chưa rõ kết quả, hướng người dùng đối chiếu trước khi gửi lại.
- **Lớp:** tìm/lọc giảng viên đã gán/chưa gán trên toàn danh sách của kỳ, không chỉ trang hiện tại; gán nhanh từ danh sách. Chi tiết chia Sinh viên/Nhóm/Hạn chót/Cài đặt. Lỗi roster không làm mất phần cài đặt. Quay lại giữ URL danh sách nguồn.
- **Gán giảng viên:** một bộ chọn tìm kiếm, gồm cả giảng viên chưa có lớp; tải đủ các trang kết quả; đối chiếu lớp/kỳ/người mới rồi lưu. Giữ cơ chế phát hiện xung đột và tải lại khi kết quả chưa rõ.
- **Hạn chót:** cột lớp áp dụng, form rộng hơn, chip lớp đã chọn, nút cuối form cố định và mô tả múi giờ của trình duyệt. Giữ lịch riêng theo lớp và chính sách gia hạn hiện có.
- **Nhóm/phân nhóm:** tái sử dụng bảng nhóm, thao tác bằng nút và phương án tự động sẵn có. Admin chọn rõ đợt từ lớp; duyệt nhóm có cảnh báo bản nháp lý do và không cho lặp ngay yêu cầu có kết quả chưa xác định. Xuất dùng giảng viên của lớp, không lấy tài khoản admin làm giảng viên.
- **Chuyên ngành/quy tắc:** giữ phạm vi ngành toàn hệ thống, quy tắc thuộc lớp; thêm cảnh báo bản nháp và đặt lại trang khi đổi kích thước trang ở danh mục ngành.

## 3. Kiểm chứng

Các kiểm tra frontend tự động và kiểm tra trình duyệt dùng dữ liệu giả; không gửi email, import hay xóa dữ liệu thật.

| Kiểm tra | Kết quả |
| --- | --- |
| Toàn bộ Vitest | 383/383 kiểm thử đạt trong 40 file; JSON reporter xác nhận `success: true`. Bao gồm 24 ca nhóm/xuất/realtime được chạy riêng sau sửa cuối. Còn cảnh báo môi trường jsdom/AntD và một số cảnh báo `act`, không có assertion thất bại. |
| Build TypeScript + Vite | Đạt. Vẫn có cảnh báo kích thước bundle lớn, khoảng 2,54 MB JS trước gzip; không thêm thư viện UI mới. |
| Oxlint | Không có lỗi; còn các cảnh báo về effect, purity, Fast Refresh và dependency hook. |
| `git diff --check` | Đạt. |
| Chromium với fixture API | 11 màn hình desktop ở 1366×768 và Dashboard mobile ở 390×844; thêm ảnh form tạo deadline. Không có `pageerror`; chiều rộng tài liệu không vượt viewport. Xem lại ảnh Dashboard, import, lớp/nhóm và form deadline. WebSocket bị mock 404 có chủ ý, nên lượt này không kiểm chứng realtime trên server. |

Ca hồi quy bổ sung/điều chỉnh tập trung vào hành vi: scope người nhận đủ bộ lọc, chọn qua trang, lỗi tải trang sau, double-click, timeout không tự gửi lại, hủy/chấp nhận bỏ bản nháp, router chặn rời trang thực tế, mẫu import đúng đối tượng, danh sách lớp nhiều trang, khóa đóng deadline, kỳ đích sinh viên, giảng viên trong file xuất và nội dung Excel đúng số dòng theo scope.

Các bộ kiểm thử nhóm, quy tắc, deadline và phân nhóm tự động hiện có tiếp tục được chạy để kiểm tra ảnh hưởng đến các component dùng chung với giảng viên/sinh viên.

## 4. Các ca còn cần nghiệm thu với backend chạy thật

Việc kiểm thử frontend không đủ để đánh dấu toàn bộ AT-01…AT-25 trong báo cáo là đã nghiệm thu sản phẩm.

1. Import mẫu đã điền dữ liệu giả hợp lệ; lỗi ngành/GV trùng hoặc không tồn tại; đối chiếu danh sách sau import, timeout và hết phiên.
2. Batch email theo bộ lọc và lựa chọn nhiều trang; đối chiếu số được server xử lý, bỏ qua và phạm vi kỳ. Kiểm tra giới hạn batch/rate limit ở quy mô vận hành.
3. Hai admin cùng gán giảng viên, sửa quy tắc, gia hạn hoặc duyệt nhóm; xác minh mã xung đột và không tự ghi đè.
4. Điều hướng Admin → lớp → đợt → nhóm/phân nhóm → xuất; kiểm tra quyền bằng tài khoản admin thực, dữ liệu nhiều đợt và trạng thái đã chốt.
5. Dùng bàn phím cho cả hành trình, zoom 200%, màn hình nhỏ, chữ dài, dữ liệu lớn và đổi VI/EN. Lượt kiểm tra trình duyệt hiện tại chưa phải đánh giá accessibility đầy đủ hoặc chứng nhận WCAG.
6. Đo thời gian và tỷ lệ hoàn thành công việc với người vận hành trước/sau; chưa có cơ sở công bố phần trăm cải thiện UX.

## 5. Các đề xuất cần triển khai tiếp khi có điều kiện

| Hạng mục | Điều kiện còn thiếu |
| --- | --- |
| Tạo/xóa lớp thủ công; sửa/chuyển/xóa SV; reset mật khẩu do admin | Hợp đồng ghi, quyền, tác động dữ liệu liên quan, xác nhận nghiệp vụ. |
| Phân công giảng viên hàng loạt, gửi toàn bộ theo snapshot phía server | API batch, giới hạn, kết quả từng đối tượng và đối soát request. |
| Import một phần, sửa trực tiếp lỗi trong preview, tải báo cáo lỗi server | Chính sách commit/rollback, lỗi theo dòng và hợp đồng preview/commit. Chưa thêm sửa ô hoặc nút tải lỗi trong đợt này. |
| Tìm/lọc SV theo lớp/nhóm phía server, KPI tổng nhóm toàn kỳ | Các trường/filter và nguồn tổng hợp đã thống nhất. Không suy ra KPI từ trang dữ liệu đầu. |
| Theo dõi mail, thông báo nền, lịch sử tác vụ bền vững | Job/status, audit, retention và dữ liệu được backend xác nhận. |
| Học kỳ chỉ xem/đóng/lưu trữ; lưu và gửi lý do đóng hạn | Vòng đời và quyền nghiệp vụ. Khóa đổi kỳ khi đang ghi không phải khóa học kỳ cũ. |
| Lưu đầy đủ lịch sử ngữ cảnh mọi trang; tối ưu tải catalog rất lớn | Thiết kế URL/state thống nhất và API tìm kiếm/phân trang phù hợp. Hiện chỉ khôi phục các ngữ cảnh nêu ở mục 2. |

Các mục này là backlog minh bạch; không có nút giả hoặc endpoint mới được dựng để mô phỏng là đã hoàn thành. Thay đổi hiện tại chưa push, merge hoặc triển khai lên môi trường dùng thật.

## 6. Tinh chỉnh giao diện Quản lý ngành

Theo phản hồi trực tiếp về cụm nút ở `/admin/majors`, thống nhất kích thước, khoảng cách và icon Lucide cho Xem/Sửa/Xóa. Nút Xem dùng viền xanh, Sửa dùng viền trung tính, Xóa dùng viền đỏ nhẹ; nút xác nhận xóa trong dialog vẫn dùng đỏ đặc. Giữ chữ trên cả ba nút, nhãn trợ năng có mã ngành và trạng thái disabled khi tải dữ liệu.

Gộp bảng/phân trang vào một card, giảm đệm dòng, làm gọn bộ lọc với icon tìm kiếm và đặt lại; mã ngành có nền xanh nhạt. Cửa sổ chi tiết và form có icon tiêu đề cùng hệ thống, nút Lưu/Sửa có icon. Style riêng đặt trong `features/majors/components/majors.css`; bổ sung biến thể `danger-outline` vào Button chung để tái sử dụng.

Kiểm tra bổ sung: 24/24 ca ngành/bộ lọc đạt; build và lint đạt (còn các cảnh báo hiện có). Chromium với fixture kiểm tra desktop 1366px, mobile 390px, mở/đóng Xem/Sửa/Xóa, thứ tự Tab từ Xem sang Sửa, chuyển VI/EN; không có lỗi JavaScript hoặc tràn ngang toàn trang. Bảng rộng cuộn trong vùng bảng, nút trên màn hình nhỏ có chiều cao tối thiểu 44px. Không thực hiện thao tác ghi với dữ liệu thật trong kiểm tra trình duyệt.

## 7. Tải mẫu Excel sinh viên và giảng viên

Đưa liên kết tải mẫu lên trước vùng chọn tệp ở cả hai trang, bổ sung hướng dẫn cột/dòng bắt đầu nhập và bảng ví dụ thu gọn. Làm lại hai mẫu: vùng dữ liệu trống, sheet `Huong dan` chứa ví dụ giả và quy tắc; mẫu sinh viên không còn chứa dữ liệu người thật của mẫu cũ. Giữ cấu trúc mà FE/BE đang đọc: Students từ dòng 3, các cột B–F/I–J; Mentors từ dòng 2, Mentor/Email ở dòng 1. Giữ các cột phụ của mẫu sinh viên ở đúng vị trí. Thêm hướng dẫn tạo/import giảng viên trước để mã GV trong dữ liệu sinh viên được đối chiếu.

Hai mẫu đã được render và kiểm tra trực quan cả sheet dữ liệu lẫn hướng dẫn; kiểm thử dùng chính tệp public xác nhận ví dụ đọc được và hướng dẫn không thành dữ liệu import. Chromium đã tải thật cả hai tệp qua liên kết, đối chiếu byte với file public, kiểm tra VI/EN và bố cục desktop/mobile bằng fixture; không gọi thao tác ghi backend thật. Xem [chi tiết cấu trúc mẫu](../frontend/10-import-va-danh-muc-nganh.md#mẫu-excel-trên-giao-diện-admin).

Kiểm tra sau cập nhật: 22/22 ca mẫu/parser/import/Admin UX đạt; build và lint đạt, còn các cảnh báo đã nêu ở mục 3.

**Điều chỉnh theo ảnh tham chiếu:** Đơn giản hóa hai tệp còn một sheet mỗi tệp; bỏ sheet hướng dẫn, nền xanh và vùng nhập tô màu. Sinh viên dùng tiêu đề lớn, hàng cột vàng A–K và hướng dẫn nhóm tại K1; giảng viên dùng bảng trắng với hai ô tiêu đề Mentor/Email. Cả hai để trống bản ghi, hướng dẫn/ví dụ giữ trên trang import; cập nhật nội dung VI/EN tương ứng. 18/18 ca mẫu/parser/Admin UX đạt, build thành công. Kiểm tra trực quan hai tệp bằng ảnh render và kiểm tra bộ lọc Excel trong cấu trúc XLSX.
