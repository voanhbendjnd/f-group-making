# Rule cảnh báo trong luồng gửi và duyệt nhóm của giáo viên

Cập nhật 29/10/2026 trên backend Spring và giao diện VI/EN.

- Giáo viên có quyền quản lý lớp và Admin được gửi nhóm nháp `OPEN/REVOKED` sang
  `PENDING`, và duyệt nhóm `PENDING` sang `ACCEPTED`, kể cả khi còn rule chưa đạt.
- Rule về sĩ số, số ngành, số sinh viên SE và số nhóm của lớp được đánh giá lại
  tại mỗi lần gửi/duyệt. Chúng trở thành cảnh báo trong hai thao tác của giáo viên.
  Không thay giá trị rule hay ghi kết quả giả là đạt.
- Response vẫn trả `ruleEvaluations`, `allRulesPassed` và `hasHardRuleViolations`.
  Snapshot lưu các kết quả hiện tại; lịch sử gửi/duyệt ghi các mã rule chưa đạt.
- Trong danh sách duyệt, `eligible` vẫn mô tả nhóm đạt rule và cấu trúc hợp lệ.
  `canReview` kiểm tra trạng thái, phiên và cấu trúc thành viên; nó có thể là `true`
  khi `eligible=false` do thiếu rule. FE không khóa nút chỉ vì `eligible=false`.
- Không hiển thị banner cảnh báo cố định trên thẻ nhóm. Khi bấm Gửi duyệt hoặc
  Phê duyệt mà nhóm chưa đạt rule, mở hộp thoại liệt kê các rule chưa đạt và các giá
  trị thực tế/yêu cầu. Chỉ gọi API sau khi bấm Xác nhận gửi duyệt/Xác nhận duyệt;
  bấm Hủy không thay đổi nhóm. Trang Duyệt nhóm dùng cùng nội dung cảnh báo trong
  hộp thoại xác nhận duyệt hiện có. Nội dung và nút xác nhận có đủ VI/EN.
- Nhóm rỗng, sai lớp/phiên, trùng thành viên hoặc sai trưởng nhóm vẫn bị chặn.
  Không thay kiểm tra quyền, khóa nhóm đang chờ/đã duyệt hay giới hạn sửa thành viên.
- Sinh viên vẫn phải là trưởng nhóm, trong phiên đang mở, ở trạng thái được nộp
  và đạt đầy đủ rule đang bật để gọi API `/submit`. Sinh viên không có quyền gọi
  `/submit-review` hoặc `/accept` của giáo viên.
- Chức năng áp dụng sắp nhóm tự động vẫn kiểm tra đủ rule trước khi gửi/duyệt tự động.

Không thay schema, migration hoặc dữ liệu ứng dụng để triển khai thay đổi này.
