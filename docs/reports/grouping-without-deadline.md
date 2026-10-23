# Sắp nhóm không phụ thuộc thời gian sinh viên chọn nhóm

Giảng viên phụ trách lớp và admin sử dụng được cả sắp tay nâng cao và sắp tự động khi lớp chưa đặt hạn, sắp mở, đang mở hoặc đã hết hạn. Các nhóm đang chờ duyệt/đã duyệt vẫn giữ quy trình bảo vệ và mở khóa hiện có.

## Lưu trữ và quyền

- Nhóm vẫn thuộc một đợt xếp nhóm của lớp. Trước khi đặt lịch, đợt có trạng thái `UNSCHEDULED`, `start_time` và `end_time` là `NULL`; không gán một khoảng thời gian giả.
- `PUT /api/school-classes/{classId}/grouping-session?termId=...` trả về đợt hiện có hoặc tạo đợt chưa đặt hạn. Kiểm tra giảng viên phụ trách/admin và kỳ học trước khi ghi. Khóa bản ghi lớp để hai tab mở đồng thời nhận cùng một đợt.
- Sinh viên xem được nhóm được phân công, nhưng không được tự tạo, tham gia, rời hoặc sửa nhóm khi chưa mở thời gian chọn nhóm. Cả hai hàm kiểm tra quyền ghi của sinh viên đều chặn trạng thái chưa đặt hạn.
- Tạo đợt chưa đặt hạn không phát email thông báo mở chọn nhóm và không tạo bộ hẹn giờ. Scheduler bỏ qua đợt chưa có thời gian cả khi khởi động lại.

## Giao diện và đặt lịch sau đó

- Cả màn hình nâng cao và tự động tự lấy đợt hiện có; nếu chưa có thì gọi API chuẩn bị workspace. Trang nhóm của lớp admin cũng cho mở trực tiếp hai công cụ khi chưa có đợt.
- Danh sách deadline, màn hình sắp tay, tự động và sinh viên có nhãn **Chưa đặt hạn**; ngày chưa đặt hiển thị trống/`—`.
- Trong danh sách deadline, chọn **Đặt thời gian chọn nhóm** để mở thời gian trên chính đợt đó. API tạo deadline cho một lớp đã có đợt chưa đặt hạn cũng tái sử dụng đợt cũ. Nhóm, thành viên, ID và lịch sử được giữ; phương án tự động dựa trên ảnh chụp trước khi thay lịch cần tính lại theo kiểm tra chống dữ liệu cũ hiện có.
- Giới hạn quyền theo lớp, quy định sĩ số/ngành và xử lý lớp có nhiều đợt lịch sử tiếp tục áp dụng.

## Database và kiểm tra

Migration: `docs/sql/20261023_unscheduled_grouping_session.sql`. Script chỉ cho phép trống ở hai cột thời gian, giữ nguyên kiểu TIMESTAMP/DATETIME và độ chính xác đang có; chạy lại được.

Đã kiểm tra script hai lần trên bảng MySQL tạm với cả TIMESTAMP và DATETIME(6), xác nhận giữ giá trị cũ và chấp nhận thời gian trống. Đã áp dụng trên database local `fgroup-making`, giữ nguyên ba bản ghi deadline hiện có.

Kiểm thử bao gồm mở hai tab đồng thời không sinh đợt trùng; quyền giảng viên/sinh viên; sắp tay khi chưa đặt hạn; đặt lịch bằng tạo/sửa giữ nguyên nhóm; và xem trước/áp dụng tự động ở cả bốn trạng thái thời gian. Frontend kiểm tra luồng mở workspace không có deadline, kéo thả và biểu mẫu đặt hạn trên ID đợt cũ.
