# Số thứ tự nhóm

Mỗi cặp `(school_class_id, deadline_id)` có dãy `sequence_no` liên tục từ 1.
API GroupDTO trả `sequenceNo` và `groupCode` (G01, G02, …, G100).
Đây là số thứ tự hiện tại, còn `id` là định danh cố định dùng cho mọi liên kết.
Tên nhóm do người dùng đặt được giữ riêng.

Tạo nhóm cấp số cuối tiếp theo. Giải tán nhóm đặt số thành NULL và dồn số các
nhóm còn lại trong cùng transaction, dưới khóa ghi của lớp. Áp dụng cho cả sinh
viên, giảng viên, leader cuối cùng rời nhóm và giải tán khi áp dụng phân nhóm tự
động. Submit, duyệt, từ chối, mở khóa và chuyển thành viên không đổi thứ tự,
trừ khi một nhóm được giải tán. Khi giải tán, cả nhóm đang chờ duyệt hoặc đã
duyệt đứng sau cũng được dồn số; trạng thái và thành viên của chúng giữ nguyên.

Bảng xếp nâng cao sắp xếp bằng `sequenceNo`, không theo trạng thái. Tìm kiếm
không đánh lại số. React và thao tác kéo thả tiếp tục dùng `id`.
Excel và màn hình xem trước có thêm cột `Group Code` / Mã nhóm; cột STT vẫn
là số thứ tự sinh viên. Các cột gốc, tên nhóm trong Group Mentor và cách sắp xếp
sinh viên theo mã sinh viên được giữ nguyên.

## Cập nhật database hiện có

1. Dừng backend để tránh ghi đồng thời trong lúc migration.
2. Chạy `docs/sql/20261020_group_sequence.sql` trên database ứng dụng (MySQL 8+).
3. Khởi động backend mới.

Script chạy lại được, kể cả khi Hibernate đã tạo cột/ràng buộc. Dữ liệu cũ
được đánh số theo ID trong từng lớp/đợt; nhóm DISBANDED không chiếm số.
`ddl-auto=update` chỉ cập nhật schema, không thay thế bước backfill này.

Số nhóm có thể đổi sau khi giải tán nhóm khác. File Excel đã xuất trước đó giữ
nguyên số tại lúc xuất; đối chiếu lịch sử phải dựa trên ID nhóm, không dựa duy
nhất vào G01/G02.
