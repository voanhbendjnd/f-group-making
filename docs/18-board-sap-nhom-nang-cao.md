# Board sắp nhóm nâng cao

## Đánh giá flow

Đưa sắp nhóm vào ngữ cảnh Duyệt nhóm phù hợp hơn việc giữ một tab độc lập: giáo viên chọn lớp một lần, đi từ kiểm tra nhóm sang điều chỉnh thành viên, rồi quay về đúng bộ lọc cũ. Board phục vụ thao tác thành viên; bảng Duyệt nhóm tiếp tục phục vụ kiểm tra và duyệt.

Luồng chính: **Duyệt nhóm → chọn lớp → Sắp nhóm nâng cao → thao tác trên board → breadcrumb quay về Duyệt nhóm**.

- Nếu giáo viên chỉ có một lớp trong học kỳ, nút dùng lớp đó để giảm thao tác.
- Nếu có nhiều lớp và đang xem tất cả, nút yêu cầu chọn lớp, không tự đoán lớp từ dòng đầu tiên.
- Board hiển thị toàn bộ nhóm của lớp và deadline đã chọn. Bộ lọc trạng thái/từ khóa của trang Duyệt nhóm chỉ được giữ để quay lại, không làm ẩn nhóm trên board.
- URL giữ lớp, deadline và ngữ cảnh bộ lọc. Breadcrumb và nút quay lại khôi phục lớp, trạng thái, từ khóa và trang của danh sách.
- Bỏ mục Xếp nhóm & Phân công khỏi sidebar. Các liên kết từ chi tiết lớp và chi tiết deadline dẫn tới board mới; URL cũ vẫn mở được khi có lớp cụ thể.

## Giao diện và thao tác

- Route chính: `/lecturer/group-review/advanced?classId=...&deadlineId=...`.
- Mỗi nhóm là một cột có chiều rộng cố định. Board cuộn ngang, nội dung sinh viên trong cột cuộn dọc; trang dùng thêm không gian ở hai bên.
- Đầu cột chỉ giữ tên, số thành viên và trạng thái. Quy tắc và lý do từ chối mở khi cần xem. Quy định chung xem từ nút Quy định nhóm trên thanh công cụ.
- Khay sinh viên chưa có nhóm có ba chế độ: mở, thu gọn, ẩn. Tìm theo tên, MSSV, email, mã thành viên hoặc ngành; lọc chuyên ngành. Bộ lọc vẫn được giữ khi ẩn/thu gọn khay.
- Có tìm nhóm hoặc sinh viên trên board. Kết quả khớp sinh viên vẫn hiển thị nguyên cột nhóm đó để giữ ngữ cảnh.
- Kéo sinh viên từ khay vào nhóm; kéo giữa hai nhóm; kéo về khay để đưa ra khỏi nhóm. Thả sinh viên chưa có nhóm vào cột tạo mới sẽ mở form đã chọn sinh viên, chờ xác nhận trước khi lưu.
- Menu sinh viên hỗ trợ chuyển nhóm, đưa ra khỏi nhóm và chỉ định trưởng nhóm. Đây cũng là đường thao tác cho bàn phím và thiết bị cảm ứng.
- Giữ tạo nhóm, lý do ngoại lệ khi tạo, gửi duyệt, duyệt/từ chối, mở khóa, giải tán và xem quy tắc.
- Tự cuộn bằng animation frame theo khoảng cách tới mép: ngang cho board, dọc cho danh sách đang trỏ tới. Ngừng khi thả, kết thúc kéo, Esc, mất focus hoặc rời trang. Tắt cuộn ngang native trong lúc kéo để tránh hai cơ chế cuộn chồng nhau.
- Màn hình nhỏ mặc định thu gọn khay sinh viên; khay mở dạng phủ lên board. Ô tìm kiếm có hàng riêng.
- Toàn bộ nội dung mới có VI/EN và giữ nguyên thuật ngữ deadline.

## Tính chính xác và realtime

- Quyền quản lý lấy từ workspace của server. Nhóm OPEN/REVOKED được sửa; PENDING phải được trả về, ACCEPTED phải mở khóa. Deadline không chặn giáo viên được phân quyền.
- Nhóm đầy/khóa và dữ liệu kéo từ lớp hoặc deadline khác không nhận sinh viên. Backend tiếp tục kiểm tra quyền, thành viên và quy tắc cho mọi thao tác.
- Chuyển giữa hai nhóm dùng API chuyển nguyên tử, không tách thành xóa rồi thêm. Kéo thành viên cuối về khay yêu cầu xác nhận giải tán.
- Hiển thị ngay vị trí mới khi chuyển sinh viên; tạm khóa thao tác tiếp theo và báo đang lưu/kiểm tra. Nếu lỗi thì khôi phục dữ liệu và đọc lại server. Kết quả quy tắc sau cùng luôn lấy từ server.
- Không tự chọn deadline của lớp khác. Nếu chưa truyền deadline, tìm đúng lớp qua toàn bộ các trang danh sách. Không có deadline thì hướng dẫn tạo; có nhiều deadline thì yêu cầu mở từ chi tiết deadline tương ứng.
- Dùng chung subscription, cache và invalidation realtime hiện có với Duyệt nhóm và màn hình sinh viên. Giữ trạng thái Live/Offline và đọc lại mỗi 30 giây khi đang mở board.
- Khóa đổi học kỳ trong khi ghi và đồng bộ kết quả. Board luôn có ngữ cảnh lớp riêng từ URL; đổi học kỳ không tự chuyển dữ liệu board sang lớp khác.

## Kiểm chứng

- Build TypeScript/Vite thành công; lint không có lỗi, còn các warning cũ của dự án. Bộ kiểm thử frontend: **310/310 test đạt**.
- Kiểm thử tự động cho chuyển nguyên tử, cập nhật ngay/khôi phục sau lỗi, nhóm khóa/đầy, dữ liệu lớp khác, tạo nhóm cần xác nhận, quyền duyệt/mở khóa, bộ lọc khay, tìm deadline qua nhiều trang và khôi phục ngữ cảnh Duyệt nhóm.
- Kiểm tra Chrome với API giả lập, 10 cột nhóm, desktop 1600×960 và mobile 390×844, VI/EN: kéo thật bằng chuột, tự cuộn trái/phải khi giữ ở mép, Esc dừng và không ghi, thả chỉ gửi một yêu cầu, chuyển bằng menu, breadcrumb giữ bộ lọc và không tràn ngang toàn trang.
- Kiểm tra trình duyệt dùng API giả lập để không ghi vào dữ liệu thật. Kết nối websocket thực với backend chưa được kiểm tra lại trong đợt thay đổi giao diện này; tích hợp realtime tiếp tục dùng cơ chế hiện có.

Không thêm thư viện hoặc thay đổi schema/API/backend trong đợt này.
