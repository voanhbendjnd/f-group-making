# 11 — Academic Term Filter đã triển khai

[Về mục lục](README.md)

Ngày cập nhật: 12/10/2026. Đối chiếu source Backend và kiểm thử Frontend bằng Vitest; chưa kiểm thử trình duyệt với MySQL/SMTP thực tế. Nội dung này bổ sung các tài liệu 01/05/07 có phần mô tả từ thời điểm trước khi API danh sách được triển khai.

## State và giao diện

- `src/app/providers/TermContext.tsx` giữ Selected Term cho các route Admin, phân biệt với Current Term trả từ Backend.
- Gọi `GET /api/terms/current`, sau đó `GET /api/terms?currentAndFutureOnly=false` để lấy cả học kỳ cũ. Không tính lịch kỳ ở Frontend.
- Lựa chọn được lưu dưới khóa `f_group_selected_term_<userId>`. Sau refresh, chỉ phục hồi ID có trong danh sách API; ID sai/mất được thay bằng Current Term. Nếu không xác định được kỳ hợp lệ, các trang theo kỳ hiển thị loading/error/empty và không gửi request toàn hệ thống.
- Sidebar và dropdown Student Import dùng cùng `TermSelect`. `TermScope` remount nội dung trang khi đổi kỳ, xóa phân trang, tìm kiếm, lựa chọn hàng, modal và preview/import confirmation cũ.
- Khóa chọn kỳ trong lúc parse Excel, import, activation hoặc delete đang chờ. Thao tác đã gửi giữ nguyên phạm vi của nó; không tự gửi lại khi đổi kỳ hoặc đăng nhập lại.
- Major, Account, Login và Student Dashboard không bị lọc bằng Selected Term.

## API và cache

| Màn hình/thao tác | Endpoint | Cách truyền Term |
| --- | --- | --- |
| Dashboard, Student List | `GET /api/students` | Query `termId`, giữ các filter/pagination hiện có; thống kê dùng `meta.total` |
| Class List | `GET /api/school-classes` | Query `termId`; bỏ dropdown riêng "tất cả kỳ" |
| Lecturer List theo kỳ | `GET /api/lecturers` | Query `termId` |
| Lecturer toàn hệ thống | `GET /api/lecturers` | Không truyền `termId`; lựa chọn phạm vi nằm trong URL `?scope=all` |
| Email đơn/batch | `POST /api/activate`, `POST /api/activate/mul` | Query `termId`; body vẫn là userId/email hoặc userIds |
| Activate-all Student/Lecturer | `POST /api/students/activate/all`, `POST /api/lecturers/activate-all` | Query `termId` khi theo kỳ |
| Xóa batch Lecturer | `POST /api/lecturers/batch-delete` | Query `termId` khi theo kỳ; body vẫn là danh sách ID |
| Import Student | `POST /api/students/import` | FormData `termId` bắt buộc ở UI, cùng file và confirmedMajorCodes |
| Import Lecturer | `POST /api/lecturers/import` | Chỉ file; import là danh mục toàn hệ thống, không gán kỳ/lớp |

- Query Key danh sách chứa Selected Term và filter, ví dụ `['students', termId, filters]`. Dashboard dùng `['admin-dashboard', termId, statistic]`; Lecturer toàn hệ thống dùng phạm vi `'all'`.
- Không dùng `keepPreviousData` ở các danh sách theo kỳ. Response chậm của kỳ trước chỉ cập nhật cache kỳ trước, không xuất hiện dưới nhãn kỳ mới.
- Import Student làm stale cache Student, Major, Class, Class Detail, Class Students, Lecturer và Dashboard. Activation làm stale dữ liệu tài khoản liên quan và thống kê Dashboard.
- Class Detail kiểm tra `classDetail.termId === selectedTermId` trước khi fetch sinh viên. Nếu sai kỳ, ẩn nội dung và hướng dẫn về Class List. Endpoint detail chưa nhận termId; đây là kiểm tra UI, không thay thế security Backend.
- Khi xem Lecturer theo kỳ, xóa đơn dùng batch-delete với một ID để tận dụng kiểm tra scope Backend. Xóa vẫn là xóa tài khoản toàn hệ thống, không phải bỏ phân công trong một kỳ; dialog hiện có nói rõ điều này.
- HTTP thành công của activation chỉ xác nhận tiếp nhận/xử lý yêu cầu, không xác nhận SMTP hoặc email đã tới hộp thư.

## Nghiệm thu

1. Chọn Current Term rồi kỳ cũ; kiểm tra danh sách, tổng, query params và phân trang.
2. Refresh và chuyển route: Selected Term được giữ; Major/Login không nhận termId.
3. Catalog rỗng/lỗi hoặc ID đã lưu không hợp lệ: không gửi Student/Class request không có termId.
4. Đổi kỳ khi trang cũ chưa trả response: không thấy dữ liệu cũ; reset hàng đã chọn và modal.
5. Email đơn, batch, activate-all và delete batch gửi đúng termId; dropdown bị khóa trong lúc request chờ.
6. Class Detail khác kỳ không fetch sinh viên của lớp; Lecturer toàn hệ thống vẫn có giảng viên chưa phân công.
7. Student Import dùng kỳ chung và giữ kỳ cho cả bước xác nhận Major; Lecturer Import không gửi/gán termId.

Chạy `npm run build`, `npm test`, `npm run lint`. Test dùng fixture và mock chỉ trong `src/test`; giao diện thực tế luôn gọi API.
