# Báo cáo phản biện và đề xuất cải thiện UX/UI toàn bộ phân hệ Admin

Ngày đánh giá: 21/10/2026. Dự án: F-Group Making. Mã nguồn đối chiếu: commit `29ab7af` và working tree tại thời điểm rà soát.

Đây là báo cáo đề xuất, không triển khai hoặc sửa mã ứng dụng. Góc nhìn đánh giá: cán bộ vận hành sử dụng hệ thống hằng ngày và tester kiểm tra khả năng hoàn thành công việc, phòng tránh nhầm lẫn, phục hồi khi lỗi.

**Cập nhật triển khai:** Theo yêu cầu thực hiện tiếp theo, các thay đổi FE được làm trên nhánh `feat/admin-ux-improvements`. Xem [kết quả triển khai và các phần còn phụ thuộc](admin-ux-implementation.md). Nội dung đánh giá bên dưới giữ nguyên bối cảnh trước khi sửa; không dùng làm mô tả giao diện sau triển khai.

## 1. Kết luận đánh giá báo cáo được cung cấp

Báo cáo ban đầu có hướng đi tốt: nhìn theo nghiệp vụ, nhận ra Dashboard quá tập trung vào kích hoạt sinh viên, cần làm rõ điều hướng, đơn giản hóa phân công giảng viên và đưa nhóm học tập về gần lớp học. Tuy nhiên, chưa nên dùng nguyên văn làm đặc tả triển khai. Một số nhận định sai với phiên bản hiện tại; một số cải tiến đã có; nhiều đề xuất mở rộng nghiệp vụ nhưng chưa chỉ ra điều kiện dữ liệu, quyền và API. Phần luồng lỗi, chọn hàng loạt, mất ngữ cảnh và tiêu chí nghiệm thu còn thiếu.

Ưu tiên nên là **đúng đối tượng, đúng học kỳ, đúng tác động và có cách phục hồi**, sau đó mới đến rút gọn bố cục, biểu đồ, chuông thông báo hoặc phím tắt.

### 1.1. Phương pháp và giới hạn bằng chứng

- Đã đọc báo cáo đính kèm, cả chín màn hình `/admin`, router, khung bố cục, component, form, hộp thoại, bộ lọc, parser và lớp gọi API liên quan.
- Đã lần theo đường Admin → Hạn chót → Chi tiết → Quản lý nhóm; rà soát thêm bảng nhóm, duyệt nhóm, xuất kết quả và màn hình phân nhóm tự động dùng chung mà tài khoản admin được phép truy cập ở frontend.
- Đọc thêm các đoạn backend liên quan để xác minh phạm vi kích hoạt, xóa tài khoản giảng viên, dữ liệu lớp của sinh viên và cách import tạo lớp. Không sửa backend.
- Đây là đánh giá tĩnh từ mã nguồn, chưa đăng nhập và kiểm thử trực tiếp với dữ liệu trên trình duyệt. Các kết luận về cấu trúc và đường gọi có bằng chứng nguồn; cảm nhận chật/rộng, thời gian hoàn thành, lỗi trên thiết bị, quyền thực tế ở môi trường triển khai cần được kiểm chứng qua phiên sử dụng.
- Không coi số dòng component là bằng chứng giao diện khó dùng; không khẳng định phần trăm cải thiện khi chưa đo. Ví dụ dữ liệu và mục tiêu kiểm thử trong báo cáo là giả định minh họa, không phải số liệu người dùng thật.

### 1.2. Những nhận định cần sửa trước

| Nhận định/đề xuất trong báo cáo cũ | Đối chiếu mã nguồn hiện tại | Cách sửa báo cáo |
| --- | --- | --- |
| Cả hai trang import thiếu nút tải mẫu | `FileDropzone` đã có nút tải `/sample-students.xlsx`; file tồn tại trong `Client/public`. Hai trang cùng dùng component này. [E02] | Sinh viên đã có tải mẫu. Giảng viên đang bị cung cấp mẫu sinh viên; cần tách đúng mẫu theo đối tượng và xác minh cấu trúc mẫu. |
| Admin hoàn toàn không có cách xem/quản lý nhóm | Chi tiết hạn chót có liên kết quản lý nhóm đến `/lecturer/group-review/advanced`; `RoleRoute` cho phép admin vào vùng giảng viên. Quyền sửa cụ thể vẫn do dữ liệu server quyết định. [E03] | Trang chi tiết lớp thiếu lối vào nhóm trực tiếp; đường hiện có khó tìm và đổi khung vai trò. Cần tích hợp lại, tái sử dụng bảng nhóm đã có. |
| Cần bổ sung nút thêm một sinh viên, thêm giảng viên | Hai trang danh sách đã có nút và modal tạo tương ứng. [E04] | Kiểm tra và cải thiện luồng hiện có, đặc biệt học kỳ mặc định và kết quả sau tạo. |
| Cần bổ sung các mục Hợp lệ/Lỗi trong preview | Cả hai bảng preview đã có lọc tất cả/hợp lệ/lỗi. [E05] | Giữ lại; cải thiện định vị ô lỗi, tải danh sách lỗi, giải thích dữ liệu chỉ mới được kiểm tra cục bộ. |
| Cần thêm “Import tệp khác” và “Đi đến danh sách” sau import sinh viên | `ImportSuccessSummary` đã có cả hai hành động và hướng dẫn kích hoạt. [E05] | Giữ hai lựa chọn; cải thiện phạm vi danh sách mở ra sau import. |
| Có cơ chế khóa kỳ học nên kỳ cũ là chỉ xem | `TermScope` chờ kỳ hợp lệ và dựng lại nội dung khi đổi kỳ; `isLocked` ngăn đổi kỳ khi đang xử lý. `Term` hiện chỉ có id, tên và cờ kỳ hiện tại. [E06] | Tách “khóa chuyển ngữ cảnh khi đang xử lý” khỏi “đóng/lưu trữ học kỳ”. Chính sách chỉ xem kỳ cũ là nghiệp vụ mới cần xác nhận. |
| Tạo deadline chưa có tìm lớp/chọn tất cả | Form đã có tìm kiếm khi danh sách hơn sáu lớp, chọn tất cả hoặc chọn tất cả kết quả lọc và đếm số lớp đã chọn. [E07] | Vấn đề là khả năng kiểm tra danh sách đã chọn, vùng cuộn 200px, độ đầy đủ danh sách và bố cục form. |
| Năm API Dashboard chỉ để lấy số đếm | Bốn request lấy số đếm, một request lấy năm sinh viên gần đây. Một lỗi có thể thay toàn màn hình bằng ErrorState. [E08] | Nêu đúng mục đích request; ưu tiên mỗi khối tải/lỗi độc lập. Chưa có đo hiệu năng để kết luận năm request là chậm. |
| Đổi nút nhập sinh viên thành “Tạo lớp mới” là sửa FE nhỏ | Import sinh viên hiện là một đường tạo lớp theo dữ liệu tệp. `classApi` hiện không có thao tác tạo/xóa lớp. [E09] | Trước mắt sửa mô tả đường nhập dữ liệu; tạo lớp thủ công là mở rộng khả năng, không chỉ đổi nhãn nút. |
| File mẫu sinh viên chỉ cần các cột RollNumber, FullName, Email, MajorCode, ClassName | Parser đang đọc sheet đầu, bỏ hai dòng đầu, lấy vị trí cột cố định, có MemberCode, dữ liệu ngành, GroupName và GV. [E10] | Mẫu phải tuân theo hợp đồng hiện hành; không cung cấp tệp năm cột mới khi chưa đổi parser/server. |
| Bảo đảm tránh 100% lỗi, giảm 60% click, loại bỏ hoàn toàn chọn nhầm | Chưa có dữ liệu đo trước/sau hoặc thử nghiệm người dùng | Viết “kỳ vọng giảm”; dùng cùng kịch bản kiểm thử và cùng quy mô dữ liệu để đo. |
| Một ngành có huy hiệu “tối thiểu 2 SV/nhóm” | Quy tắc đang cấu hình theo lớp, gồm bảy giá trị và trạng thái bật/tắt; không phải thuộc tính cố định của ngành. [E11] | Hiển thị quy tắc tại lớp hoặc ghi rõ lớp/phạm vi đang xem; không gắn một con số chung cho ngành toàn hệ thống. |
| Modal xác nhận xóa lớp có thể nói sẽ xóa toàn bộ nhóm | Chưa chứng minh hợp đồng xóa lớp và tác động dây chuyền đó | Chỉ mô tả hệ quả đã được xác minh; nếu là thiết kế tương lai, nêu là yêu cầu cần chốt. |

### 1.3. Các đề xuất đáng giữ và các đề xuất cần tiết chế

**Nên giữ:** Dashboard theo việc cần xử lý; học kỳ luôn dễ nhìn; nhãn nhập dữ liệu rõ đối tượng; lớp là điểm vào sinh viên/nhóm/quy tắc/giảng viên; tìm giảng viên bằng một bộ chọn có tìm kiếm; bảng deadline thể hiện lớp áp dụng; thông báo xác nhận nêu đúng đối tượng và hệ quả; kiểm thử bàn phím, trạng thái trống và lỗi.

**Cần điều chỉnh:** không bắt buộc mọi form dùng wizard, mọi bảng dùng menu ba chấm, mọi loading dùng skeleton hoặc mọi ô trống có hình minh họa. Chọn cách giúp hoàn thành công việc với ít gián đoạn. Giữ hành động thường dùng hiện rõ; đưa thao tác hiếm/nguy hiểm vào menu. Với form ngắn, một màn hình có nhóm trường và phần tóm tắt có thể hiệu quả hơn nhiều bước.

**Nên làm sau:** chuông thông báo toàn cục, biểu đồ nâng cao, checklist động trong sidebar, tạo/xóa/chuyển lớp hàng loạt, reset mật khẩu do admin và lịch sử tác vụ bền vững. Các mục này cần làm rõ nhu cầu, quyền, nguồn dữ liệu và khả năng backend trước khi đưa nút lên giao diện.

## 2. Phạm vi màn hình và mô hình trải nghiệm đề xuất

### 2.1. Danh mục phủ phạm vi

| Màn hình/khu vực | Phạm vi thao tác đã rà soát |
| --- | --- |
| Khung Admin | Menu, thu gọn/mở trên điện thoại, chọn/tạo kỳ, tài khoản, ngôn ngữ, đăng xuất, breadcrumb |
| Dashboard | Thẻ thống kê, đường vào danh sách, đường import, thao tác kích hoạt, dữ liệu gần đây, loading/lỗi |
| Sinh viên | Tìm kiếm, ngành, trạng thái tài khoản/liên kết, chọn dòng/trang/toàn bộ, phân trang, tạo mới, gửi đơn/gửi hàng loạt |
| Import sinh viên | Chọn/kéo/thay/xóa tệp, tải mẫu, chọn kỳ, preview, lọc lỗi, xác nhận ngành mới, nhập dữ liệu, kết quả |
| Giảng viên | Phạm vi theo kỳ/toàn hệ thống, bộ lọc, chọn dòng/trang, phân trang, tạo mới, gửi đơn/hàng loạt, chờ gửi lại, xóa đơn/hàng loạt |
| Import giảng viên | Chọn mẫu/tệp/sheet, preview, lỗi cục bộ/server, xác nhận nhập, modal thành công và bước tiếp theo |
| Chuyên ngành | Tìm/lọc tên tạm, phân trang, tạo, xem, sửa, xóa, lỗi dữ liệu đang được sử dụng |
| Lớp học | Tìm kiếm, số lượng, phân trang, đường import, mở chi tiết |
| Chi tiết lớp | Thông tin lớp, tìm sinh viên, gán/đổi giảng viên, bảy quy tắc, bật/tắt, lưu/hủy/tải lại |
| Hạn chót | Danh sách, phân trang, tạo, xem, chỉnh lịch/gia hạn/mở lại, chọn phạm vi lớp, đóng, lỗi/xung đột |
| Quản lý nhóm dùng chung | Chọn lớp/đợt, tìm nhóm/SV, nhóm chưa phân, tạo/chuyển/gỡ thành viên, nhóm trưởng, nộp/duyệt/trả lại/mở khóa/giải tán, xuất |
| Phân nhóm tự động dùng chung | Chọn lớp, mục tiêu, xem phương án, tạo lại, so sánh, áp dụng, lịch sử phương án/lịch sử áp dụng và kết quả chưa xác định |

Luồng đăng nhập, quên mật khẩu, hết phiên và thiếu quyền được xem là điểm vào/ra dùng chung cần kiểm thử với admin; không đề xuất thiết kế lại toàn bộ giao diện riêng của sinh viên hoặc giảng viên.

### 2.2. Một trục ngữ cảnh xuyên suốt

Mọi tác vụ có dữ liệu theo kỳ cần trả lời được: **đang ở vai trò nào → học kỳ nào → lớp nào → đợt ghép nhóm nào → tác động lên ai**.

Ví dụ: “Quản trị viên · SP27 · EXE101_G01 · Đợt đăng ký nhóm 1”. Ví dụ này chỉ minh họa, không phải dữ liệu thật.

Chuyên ngành và tài khoản giảng viên toàn hệ thống phải được ghi rõ là dữ liệu dùng chung. Việc người dùng đang chọn SP27 không có nghĩa thao tác xóa giảng viên chỉ ảnh hưởng SP27.

### 2.3. Cấu trúc điều hướng đề xuất

| Nhóm | Mục chính | Ghi chú |
| --- | --- | --- |
| Điều hành | Tổng quan; Hạn chót | Đưa cảnh báo cần xử lý về Tổng quan |
| Lớp và nhóm | Lớp học | Nhóm, quy tắc, giảng viên, phân nhóm tự động đi từ lớp; có thể bổ sung “Duyệt nhóm” nếu admin thực sự dùng thường xuyên |
| Danh sách | Sinh viên; Giảng viên | Nút “Nhập Excel” hiện rõ tại từng danh sách; không nhất thiết mở tất cả thành submenu |
| Danh mục | Chuyên ngành; chức năng tạo học kỳ dễ tìm | Chức năng tạo kỳ đã có; cần chuyển khỏi vị trí chỉ dễ thấy khi nhập sinh viên |

Không dùng thứ tự menu để ép người dùng đi tuần tự. Quy trình thiết lập đầu kỳ nên nằm trên Dashboard hoặc trong hướng dẫn có thể thu gọn, thay vì chiếm sidebar mọi lúc. Sidebar ưu tiên đường đến công việc lặp lại.

## 3. Những vấn đề bổ sung có tác động lớn

Quy ước: **P1** cần ưu tiên vì có thể gây sai đối tượng, mất ngữ cảnh hoặc sai hiểu biết về kết quả; **P2** cải thiện hiệu quả công việc; **P3** hoàn thiện. Mức ưu tiên là đánh giá rủi ro từ nguồn, chưa phải tần suất lỗi đo trong production.

| ID | Vấn đề và bằng chứng | Tác động | Đề xuất/tiêu chí chấp nhận |
| --- | --- | --- | --- |
| UX-01, P1 | “Chọn toàn bộ phù hợp bộ lọc” gửi search/ngành/kỳ nhưng không gửi bộ lọc trạng thái tài khoản và liên kết; backend tự lấy người chưa kích hoạt và không áp dụng trạng thái liên kết. [E12] | Lọc “chưa gửi” nhưng có thể gửi lại cho cả người đã có liên kết; lọc “đã kích hoạt” cũng không tương ứng với tập người nhận | Phạm vi xác nhận phải đúng tập gửi. Nếu hợp đồng chưa hỗ trợ bộ lọc, nêu rõ phạm vi thực tế hoặc chỉ cho gửi tập ID được xác định; không giữ nhãn “toàn bộ phù hợp” gây hiểu sai. |
| UX-02, P1 | Chọn sinh viên qua nhiều trang được giữ bằng ID, nhưng số đủ điều kiện/bỏ qua chỉ tính trên dữ liệu trang hiện tại. [E13] | Có thể hiện số gửi sai hoặc khóa nút gửi khi các lựa chọn đủ điều kiện nằm ở trang trước | Thống kê toàn tập đã chọn, tách “đã chọn/đủ điều kiện/bỏ qua”; kiểm tra trên server trước gửi khi cần. |
| UX-03, P1 | Form thêm sinh viên mặc định kỳ hiện tại của hệ thống, không lấy kỳ đang xem. [E04] | Admin đang chuẩn bị kỳ mới có thể tạo sinh viên vào kỳ khác | Mặc định kỳ đang chọn; nếu cho chọn kỳ đích khác, ghi rõ và hỏi xác nhận phạm vi khi lưu. Sau lưu có cách mở đúng sinh viên vừa tạo. |
| UX-04, P1 | Trang import giảng viên dùng `FileDropzone` tải mẫu sinh viên. [E02] | Người dùng được hướng dẫn tạo tệp sai đối tượng | Tải đúng mẫu giảng viên; tên nút và tên file rõ đối tượng; kiểm chứng mẫu đi qua cả preview và kiểm tra server. |
| UX-05, P1 | `TermScope` dựng lại trang khi đổi kỳ; nhiều bản nháp chưa có cảnh báo rời ngữ cảnh. Khóa hiện tại chủ yếu áp dụng khi request đang chạy. [E06] | Mất tệp đã chọn, dữ liệu nhập hoặc quy tắc chưa lưu | Đổi kỳ/rời trang khi có bản nháp phải có “Ở lại” và “Bỏ thay đổi”; không hỏi khi chưa sửa. Không lưu nội dung tệp hoặc thông tin cá nhân vào storage để giải quyết việc này. |
| UX-06, P1 | Tạo deadline không dùng khóa kỳ như các mutation khác; truyền `onClose` trực tiếp cho Modal, trong khi Modal cho đóng bằng X, nền và Escape. [E07] | Có thể đóng/đổi ngữ cảnh khi request chưa hoàn tất; người dùng khó biết deadline đã tạo hay chưa | Giữ ngữ cảnh trong lúc gửi; xử lý thống nhất các đường đóng; nếu mất kết quả chuyển sang “Chưa xác nhận”, cho tra cứu trước khi gửi lại. |
| UX-07, P1 | Danh sách lớp cho tạo deadline chỉ lấy trang 1 với size 200; lỗi tải lớp không được biểu diễn riêng. [E14] | “Tất cả” có thể chỉ là tập được tải; lỗi tải dễ bị hiểu là không có lớp | Có loading/lỗi/thử lại cho lớp; tải hoặc phân trang đầy đủ; chỉ dùng “tất cả trong kỳ” khi thực sự bao phủ toàn kỳ. |
| UX-08, P1 | Xóa giảng viên trong danh sách theo kỳ vẫn là xóa tài khoản toàn hệ thống; backend xóa Lecturer và User. [E15] | Dễ hiểu nhầm là bỏ phân công trong kỳ; hệ quả rộng hơn màn hình đang lọc | Dùng nhãn “Xóa tài khoản toàn hệ thống”; nêu phạm vi và phụ thuộc đã xác minh. “Bỏ phân công” phải là thao tác riêng nếu nghiệp vụ hỗ trợ. |
| UX-09, P2 | Admin mở nhóm từ deadline bị chuyển sang layout giảng viên, breadcrumb quay về vùng giảng viên. [E03] | Đứt hành trình và khó quay lại danh sách đang làm | Giữ khung Admin, kỳ/lớp/đợt và điểm quay về; dùng lại chức năng nhóm hiện có. |
| UX-10, P2 | Preview xuất dùng dữ liệu đã lọc để hiển thị, nhưng nút xuất truyền toàn bộ `allRows`. [E16] | File tải về có thể chứa nhiều người hơn người dùng đang nhìn | Đổi nhãn “Xuất toàn bộ lớp (N)” hoặc cho hai phạm vi “Kết quả đang lọc (M)” và “Toàn lớp (N)”. |
| UX-11, P2 | Sau tạo giảng viên, màn danh sách theo kỳ có thể không chứa người mới vì chưa có phân công; sau import đã có đường đến `scope=all`. [E04] | Người dùng nghĩ tạo thất bại và dễ tạo lại | Sau tạo mở đúng phạm vi toàn hệ thống hoặc khối kết quả có người vừa tạo; giải thích “chưa được phân công trong kỳ đang xem”. |
| UX-12, P2 | Dashboard và bộ lọc dùng có/không có activation key để diễn đạt trạng thái gửi thư. [E08, E12] | Có key không chứng minh email đã đến; key hết hạn không có nghĩa chưa từng gửi | Tách tài khoản, liên kết và kết quả gửi. Không hiển thị % tiến độ gửi thực nếu server chưa cung cấp dữ liệu đó. |

## 4. Đề xuất khung bố cục, điều hướng và quy tắc dùng chung

### 4.1. Bố cục tổng thể

- Header: nút mở menu, bộ chọn “Học kỳ đang xem”, nhãn phạm vi và khu tài khoản/ngôn ngữ. Giữ chiều cao gọn, tránh nhồi thêm biểu đồ hoặc checklist vào header.
- Tiêu đề trang: tên công việc, một câu mô tả nếu cần, một hành động chính. Breadcrumb đặt nhất quán phía trên tiêu đề; không cần chuyển mọi breadcrumb vào header nếu làm header chật.
- Nội dung: cảnh báo liên quan → bộ lọc → thanh chọn hàng loạt khi có lựa chọn → bảng/nội dung → phân trang.
- Trên laptop, mục tiêu thiết kế là thấy tiêu đề, thao tác chính, bộ lọc và những dòng đầu tiên mà không cuộn qua nhiều card giới thiệu. Cần kiểm tra ở 1366×768, không khẳng định số dòng phù hợp khi chưa render.
- Trên màn nhỏ, ưu tiên tên đối tượng, trạng thái và thao tác; dữ liệu phụ mở theo dòng hoặc cuộn trong vùng bảng. Không thu chữ nhỏ chỉ để nhét hết cột.

### 4.2. Quy định từng nhóm nút toàn cục

| Nút/thành phần | Hành vi đề xuất |
| --- | --- |
| Mở/thu menu | Có tên truy cập và trạng thái mở; trên điện thoại đóng được bằng Escape, trả focus về nút mở. Khi menu desktop ẩn hoàn toàn, kỳ đang xem vẫn nhìn thấy. |
| Mục menu | Chỉ một mục tương ứng trang hiện tại nổi bật. Hiện trạng dùng NavLink cha có thể cùng active khi đang ở đường import; cần kiểm tra và làm rõ mục cha/mục con. |
| Bộ chọn kỳ | Nhãn “Đang xem: SP27”; tách nhãn “Kỳ hiện tại của hệ thống: …” nếu khác. Đổi kỳ cập nhật toàn bộ nội dung nhất quán, hủy chọn hàng loạt và xử lý bản nháp. |
| Tạo kỳ | Đặt ở nơi dễ tìm trong quản trị, không chỉ ở biến thể bộ chọn trên trang import. Chọn mùa và năm minh bạch; cho thấy tên kỳ sắp tạo. Không mặc định năm sau mà không giải thích. |
| Tài khoản | Bấm/chạm mở được; có danh tính và vai trò. Nếu chuyển Logout vào menu tài khoản, phải thực sự thiết kế menu tương tác; `AccountPopover` hiện là popover thông tin, chưa phải menu chức năng. |
| Đăng xuất | Một vị trí nhất quán, có thể tìm bằng bàn phím và trên điện thoại. Chỉ hỏi về thay đổi chưa lưu khi có bản nháp cần bảo toàn. |
| Ngôn ngữ | Toàn bộ nhãn, tiêu đề, lỗi và modal chuyển đồng bộ. Giảng viên/import/tạo kỳ còn nhiều chuỗi tiếng Việt viết trực tiếp; cần kiểm tra ở cả hai ngôn ngữ. |
| Quay lại/breadcrumb | Trở về đúng kỳ, bộ lọc, trang và vị trí trước đó. Không chỉ điều hướng về danh sách mặc định làm người dùng tìm lại. |

### 4.3. Học kỳ cũ và phạm vi toàn hệ thống

Chưa có căn cứ để mặc định “kỳ khác kỳ hiện tại = đã lưu trữ = cấm sửa”. Nếu muốn thêm khóa học kỳ, cần xác định trạng thái thật, ai được đóng/mở, những thao tác nào được phép và quy tắc backend. Trước mắt hiển thị đúng kỳ đang xem và xác nhận đúng kỳ đích khi ghi dữ liệu.

Với giảng viên/chuyên ngành toàn hệ thống, ghi rõ phạm vi ngay cạnh tiêu đề và ở xác nhận xóa/sửa. Có thể giữ lựa chọn kỳ để chuyển sang các màn hình khác, nhưng phải giải thích kỳ không giới hạn danh mục đang xem.

## 5. Đề xuất chi tiết theo từng màn hình và thao tác

### 5.1. Dashboard — `/admin/dashboard`

**Hiện trạng:** bốn thẻ về sinh viên/kích hoạt; hai khối hướng dẫn nhập và kích hoạt; bảng năm sinh viên gần đây. Nhiều vị trí cùng dẫn về hai công việc. Lỗi một query có thể che toàn Dashboard. [E08]

**Bố cục đề xuất:** tiêu đề kèm kỳ → “Việc cần xử lý” tối đa một số mục quan trọng → bốn chỉ số nghiệp vụ → danh sách tình huống cần mở chi tiết. Hướng dẫn thiết lập đầu kỳ có thể thu gọn khi đã quen sử dụng.

| Thành phần/action | Sửa đổi đề xuất | Kết quả/ngoại lệ cần có |
| --- | --- | --- |
| Chỉ số sinh viên | Tổng sinh viên; số chưa kích hoạt là thông tin phụ | Nhấp số chưa kích hoạt mở danh sách đúng bộ lọc, không tự gửi thư |
| Chỉ số lớp | Tổng lớp, lớp chưa có giảng viên | Mở danh sách đúng kỳ và bộ lọc được hỗ trợ; ghi điều kiện API nếu chưa có |
| Chỉ số nhóm | Sinh viên chưa có nhóm; nhóm chờ duyệt/vi phạm quy tắc | Có định nghĩa theo kỳ/lớp/đợt, tránh cộng trùng giữa các đợt |
| Hạn gần nhất | Tên hạn, giờ kết thúc chính xác, số lớp áp dụng | Nếu từng lớp có giờ khác nhau, hiển thị “Lịch theo lớp”; không gộp thành một countdown sai |
| Việc cần xử lý | Các hàng có đối tượng, số lượng, nguyên nhân, nút “Xem …” | Không đặt “Gửi tất cả” một chạm làm hành động nổi bật mặc định |
| Nhập sinh viên | Một đường vào rõ ràng | Giữ kỳ đích khi mở import |
| Tạo nhanh | Chỉ liệt kê chức năng đã có và có quyền | Không thêm “Tạo lớp” khi chưa có khả năng tạo lớp thủ công |
| Tải/lỗi | Mỗi khối có loading/lỗi/thử lại riêng | Số liệu chưa tải không hiện 0; không che dữ liệu khối đang hoạt động |

Chỉ bổ sung số liệu khi nguồn dữ liệu và định nghĩa đếm được thống nhất. Có thể triển khai Dashboard gọn với chỉ số đã xác minh trước; chưa cần biểu đồ nhiều màu hoặc bảng hoạt động giả định có lịch sử backend.

### 5.2. Danh sách sinh viên — `/admin/students`

**Giữ:** tìm kiếm trễ 350ms và Enter áp dụng ngay, lọc ngành, hai chiều trạng thái, phân trang và chọn hàng loạt. Cần nâng chất lượng hiển thị và tính đúng của phạm vi chọn trước khi thêm nhiều nút. [E12, E13]

**Bố cục đề xuất:** “Sinh viên · kỳ đang xem” → “Thêm sinh viên” và “Nhập Excel” → tìm kiếm/lớp/ngành/trạng thái → chip bộ lọc và tổng kết quả → thanh chọn → bảng.

| Thành phần/action | Đề xuất chi tiết |
| --- | --- |
| Tìm kiếm | Ghi đúng các trường có thể tìm; giữ nội dung và con trỏ khi tải. Sau áp dụng về trang đầu. |
| Lọc lớp | Nên bổ sung. Backend DTO đã có `schoolClassId` và `groupName`, nhưng kiểu Student FE hiện chưa thể hiện; lọc server cần hợp đồng bổ sung. Không lọc chỉ trang hiện tại rồi gọi là toàn danh sách. [E21] |
| Lọc nhóm | Nếu bổ sung phải gắn đợt ghép nhóm; “chưa có nhóm” không được suy từ chỉ riêng trạng thái tài khoản. |
| Trạng thái | Tách “Tài khoản: đã/chưa kích hoạt” và “Liên kết: còn hạn/hết hạn/chưa có”. Chỉ gọi “email đã gửi/thất bại” khi có bằng chứng kết quả gửi. |
| Xóa bộ lọc | Xóa tất cả điều kiện, về trang đầu, bỏ chọn và cập nhật số lượng. Khi chỉ lọc trạng thái liên kết mà không có kết quả, phải hiện hướng xóa lọc; hiện trạng nhánh EmptyState chưa xét đủ điều kiện này. |
| Bảng | Ưu tiên MSSV, họ tên, lớp, ngành, trạng thái, thao tác. Email vẫn dễ truy cập; MemberCode có thể là cột tùy chọn nếu ít dùng. Nhóm gắn với đợt khi nguồn hỗ trợ. |
| Chọn một dòng | Tăng/giảm đúng tổng trên mọi trang; có trạng thái chọn một phần trên checkbox tiêu đề. |
| Chọn trang | Nhãn “Chọn N sinh viên trên trang này”. Chọn toàn bộ kết quả là hành động thứ hai với phạm vi nhìn thấy rõ. |
| Chọn toàn bộ kết quả | Hiển thị kỳ và toàn bộ điều kiện có hiệu lực. Khi bộ lọc thay đổi phải bỏ chọn hoặc yêu cầu chọn lại. |
| Gửi đơn | Giữ modal tên/MSSV/email; nút “Gửi liên kết kích hoạt”. Kết quả: “Đã tiếp nhận yêu cầu”, không hứa đã đến hộp thư. |
| Gửi hàng loạt | Cho biết N đã chọn, M đủ điều kiện, K bỏ qua; xem danh sách người nhận có phân trang/tìm kiếm nếu lớn. Nút “Gửi cho M sinh viên”. Dữ liệu xác nhận khớp tập gửi thực tế. |
| Phân trang | Giữ lựa chọn theo quy tắc rõ; không tính số hợp lệ chỉ từ trang đang nhìn. Có tổng chọn và “Bỏ chọn tất cả”. |
| Hồ sơ | Đề xuất Drawer cho thông tin liên quan lớp/nhóm/liên kết nếu hợp đồng truy cập đủ. Giữ đường quay lại đúng hàng. |
| Sửa/chuyển lớp/xóa/reset mật khẩu | Ghi là mở rộng nghiệp vụ có điều kiện; xác định quyền và ảnh hưởng nhóm/đợt/tài khoản. Không đưa vào cùng đợt chỉnh bố cục khi chưa có hợp đồng. |
| Xuất danh sách | Phải ghi rõ xuất đang lọc/toàn kỳ/các dòng đã chọn; không suy ra từ chức năng xuất kết quả nhóm theo lớp đang có. |

**Luồng gửi đề xuất:** chọn kỳ → lọc → chọn phạm vi → kiểm tra người nhận và số bỏ qua → gửi → ghi nhận yêu cầu → xem kết quả đã xác nhận. Khi timeout: giữ phạm vi, báo “Chưa xác nhận được kết quả”, hướng kiểm tra lại; không tự gửi lại.

### 5.3. Modal thêm sinh viên

Form hiện có thông tin cá nhân, ngành, kỳ, lớp, giảng viên liên quan; MemberCode được gợi ý tự động; chặn lưu khi lớp chưa có giảng viên hợp lệ; có xử lý kết quả chưa rõ. Đây là nền tảng đáng giữ. [E04]

| Trường/action | Đề xuất |
| --- | --- |
| Học kỳ | Mặc định kỳ đang xem. Đổi kỳ đích làm xóa lựa chọn lớp đã mất hiệu lực và giải thích ngay. |
| Ngành | Tìm theo mã/tên; khi thiếu danh mục, nêu việc cần làm trước. Không dùng quy trình tạo ngành ngầm không có xác nhận. |
| Lớp | Danh sách phụ thuộc kỳ; cho thấy giảng viên kèm lớp để tránh phải thử nhiều lớp mới biết hợp lệ. |
| Lớp chưa có giảng viên | Nêu rõ lý do không lưu và đường thực hiện “Phân công giảng viên”; bảo toàn bản nháp trong phiên khi điều hướng phù hợp. |
| MemberCode | Phân biệt “Tạo tự động” và “Đã sửa thủ công”; giữ nút tạo lại có tên rõ, giải thích khi giá trị bị thay đổi. |
| Lưu | Một thao tác gửi; khóa trường/nút cần thiết khi đang xử lý. Kết quả có MSSV, lớp, kỳ. |
| Hủy/X/Escape/bấm ngoài | Thống nhất quy tắc; khi đã sửa hỏi bỏ bản nháp, khi đang gửi không đóng mất tiến trình. |
| Kết quả chưa rõ | Giữ thông báo hiện tại nhưng bổ sung bước phục hồi cụ thể “Kiểm tra danh sách” với đúng MSSV/kỳ. Không để chỉ có nút lưu bị khóa và yêu cầu đóng/mở lại. |

Sau tạo, nên có “Xem sinh viên vừa tạo” và “Thêm tiếp”; việc tự đóng như hiện tại vẫn chấp nhận nếu danh sách cập nhật và có thể tìm ngay bản ghi mới.

### 5.4. Import sinh viên — `/admin/students/import`

**Không thiết kế lại cấu trúc tệp một cách độc lập.** Parser hiện lấy sheet đầu, dữ liệu từ dòng Excel số 3, cột B–F và I–J. Ngành được suy ra từ chuỗi có dấu gạch dưới; `GroupName` ở đây là tên lớp, khác nhóm học tập của sinh viên. Kiểm tra email hiện là định dạng tổng quát, không có căn cứ bắt buộc miền FPT trong đề xuất. [E10]

**Bố cục đề xuất:** tiến trình ba giai đoạn trên một trang: Chọn tệp → Kiểm tra → Kết quả. Không bắt buộc ba màn hình riêng. Header giữ kỳ đích, tên tệp và tổng dòng dễ nhìn.

| Giai đoạn/action | Sửa đổi đề xuất và hành vi |
| --- | --- |
| Tải mẫu | Giữ nút đã có, đổi tên rõ “Tải mẫu nhập sinh viên”; hướng dẫn đúng sheet, dòng dữ liệu, vị trí cột và ví dụ dữ liệu ngành/lớp/GV. |
| Chọn/kéo tệp | Ghi `.xlsx`, tối đa 5MB, một tệp; có nút chọn bằng bàn phím, lỗi gần vùng nhập. Thả nhiều tệp cần báo chỉ xử lý tệp nào. |
| Thay tệp | Nút hiện có mang nhãn “Hủy” nhưng lại mở chọn tệp. Đổi thành “Chọn tệp khác”. Nút X mang nhãn “Bỏ tệp đã chọn”. [E02] |
| Chọn lại tệp đã sửa | Phải nhận được thay đổi kể cả cùng tên tệp; xóa cảnh báo cũ khi tệp mới hợp lệ. Đây là ca cần kiểm thử trực tiếp. |
| Học kỳ | Dùng một nguồn chọn kỳ; trên khu nhập thể hiện “Nhập vào kỳ …”. Đổi kỳ khi có preview phải cảnh báo sẽ bỏ dữ liệu kiểm tra trước đó. |
| Kiểm tra cục bộ | Ghi “Hợp lệ bước kiểm tra tệp”, tránh làm người dùng hiểu chắc chắn nhập được. Trùng dữ liệu server hoặc mã giảng viên không tồn tại có thể chỉ phát hiện ở bước gửi. |
| Xem lỗi | Giữ ba bộ lọc hiện có; thể hiện dòng Excel thật, tên cột, giá trị và hướng sửa. Có lựa chọn tải danh sách lỗi nếu nhu cầu thường xuyên. |
| Ngành mới | Hiện danh sách mã mới và giải thích sẽ tạo tên tạm; cho hủy để sửa tệp hoặc xác nhận. Sau thành công có đường đến bộ lọc ngành tên tạm. Nếu muốn đặt tên ngay phải chốt hợp đồng mới. |
| Xác nhận nhập | Một vùng hành động chính cố định trong phạm vi form, ghi số sinh viên và kỳ; phần tóm tắt nêu lớp mới có thể được tạo và giảng viên liên quan nếu server có dữ liệu xác nhận. |
| Có dòng lỗi | Giữ quy tắc hiện tại “Sửa tệp trước khi nhập”. Chỉ thêm “Bỏ qua dòng lỗi” khi backend hỗ trợ nhập một phần và có kết quả đối soát rõ. |
| Đang nhập | Không hứa tác vụ tiếp tục chạy nền sau chuyển trang nếu không có cơ chế theo dõi; giữ người dùng và ngữ cảnh trong thời gian gửi. |
| Lỗi server | Giữ tệp và preview; hiển thị lỗi theo dòng/trường, thông tin chưa ghi/đã ghi dựa kết quả thật. Không tự retry. |
| Thành công | Giữ “Nhập tệp khác” và “Đi đến danh sách sinh viên”; nếu có định danh đợt nhập thì mở đúng những sinh viên vừa nhập. Không ghi số cập nhật khi contract không cung cấp. |

Không tự động chuyển trang sau thành công: người dùng cần đọc tổng kết, xử lý ngành tên tạm hoặc tiếp tục nhập. Có nút bước tiếp theo rõ ràng là đủ.

### 5.5. Danh sách giảng viên — `/admin/lecturers`

**Bố cục:** gộp phạm vi vào bộ lọc, nhưng giữ thông báo “Dữ liệu toàn hệ thống” dễ thấy. Phạm vi toàn hệ thống và trạng thái kích hoạt là hai chiều khác nhau; không đặt hai bộ nút chuyển ngang gần giống nhau khiến người dùng nhầm.

| Action | Đề xuất |
| --- | --- |
| Theo kỳ/Toàn hệ thống | Ghi “Có phân công trong kỳ SP27” và “Toàn bộ tài khoản”; giải thích giảng viên mới chưa phân công chỉ xuất hiện ở phạm vi toàn hệ thống. |
| Thêm giảng viên | Giữ nút và modal code/email; giải thích chưa cần thông tin hồ sơ đầy đủ, chưa tự gán lớp. |
| Sau tạo | Mở bản ghi trong phạm vi toàn hệ thống hoặc khối kết quả; tránh báo thành công nhưng danh sách không đổi vì đang lọc theo kỳ. |
| Tìm/lọc | Mô tả đúng các trường có thể tìm; có Enter áp dụng và xóa bộ lọc nhất quán. Ngôn ngữ chuyển đồng bộ. |
| Chọn dòng/trang | Checkbox có tên truy cập gắn mã GV/email; tổng chọn qua trang chính xác. Nếu giữ lựa chọn qua trang phải nói rõ. |
| Gửi đơn | Không nhất thiết thêm một modal cho mọi lần gửi; thể hiện người nhận rõ tại dòng. Gửi hàng loạt cần bước kiểm tra phạm vi. |
| Gửi hàng loạt | Hiện tại bấm là gửi trực tiếp. Bổ sung kiểm tra người nhận đủ điều kiện và lý do bỏ qua, giống quy ước sinh viên. |
| Chờ gửi lại 60 giây | Chữ đếm ngược hiện có đã hữu ích; giữ lý do chờ và số giây. Chưa cần vòng tiến trình trang trí. Một người còn cooldown không nên làm người dùng tưởng mọi người đều không thể gửi; nêu rõ tập bị chặn. |
| Xóa đơn/hàng loạt | Tách khỏi gửi; nhãn rõ xóa tài khoản toàn hệ thống. Xác nhận nêu đúng mã/email và phạm vi; phụ thuộc đang có cần báo trước khi xóa nếu hệ thống cung cấp. |
| Lớp phụ trách | Có thể hiện một vài lớp và “+N lớp”; bấm xem danh sách, không để hàng bảng cao theo hàng chục lớp. Cần nguồn dữ liệu phù hợp. |
| Xem/sửa/gán nhanh | Đưa vào danh sách cải tiến có điều kiện; gán lại phải cho thấy giảng viên hiện tại và người thay thế. Không mở rộng quyền chỉ vì có nút thuận tiện. |
| Không có kết quả | Phân biệt chưa có tài khoản, chưa có phân công trong kỳ, bộ lọc không khớp và trang vượt phạm vi sau xóa. Nút tương ứng là thêm/đổi phạm vi/xóa lọc/về trang trước. |

STT hiện bắt đầu lại từ 1 ở từng trang; nên đánh số toàn danh sách hoặc bỏ STT nếu mã giảng viên đã đủ định danh. Không đặt xóa tài khoản thành nút nổi bật cạnh thao tác gửi được dùng thường xuyên.

### 5.6. Import giảng viên — `/admin/lecturers/import`

Đây là nhập tài khoản toàn hệ thống, không gắn giảng viên vào kỳ chỉ vì đang chọn kỳ ở sidebar. Sau nhập hiện đã có đường đến `/admin/lecturers?scope=all`, nên giữ nguyên ngữ nghĩa đó. [E04]

- Sửa mẫu trước: nút tải mẫu giảng viên phải tải đúng tệp, ví dụ cột được hợp đồng chấp nhận như `Mentor` và `Email`.
- Parser hiện tự chọn sheet theo tên hoặc vị trí. Hiển thị “Đang đọc sheet …”, các cột đã nhận diện và số dòng. Nếu chọn sai sheet, người dùng có cách đổi hoặc được hướng dẫn chỉnh tệp; tùy chọn đổi sheet cần frontend và backend đọc thống nhất. [E10]
- Giữ lọc tất cả/hợp lệ/lỗi; đổi các từ “Ổn”, “không ổn” thành “Hợp lệ”, “Cần sửa”. Không gọi hợp lệ cục bộ là chắc chắn đã được server chấp nhận.
- Dùng cùng quy tắc nút chọn/thay/bỏ tệp, lỗi và kết quả chưa xác định như import sinh viên.
- Thay modal thành công cộng toast bằng khối tổng kết bền trên trang; có “Xem giảng viên vừa nhập” hoặc “Xem toàn bộ giảng viên” đúng khả năng dữ liệu, và “Nhập tệp khác”. Không bỏ lựa chọn nhập tiếp chỉ để còn một nút.
- Nội dung cho người dùng ghi “Tài khoản giảng viên đang chờ kích hoạt”; không cần hiện mã kỹ thuật `ROLE_LECTURE`.
- Sau nhập chưa tự gửi email. Người dùng cần chủ động chọn người nhận và xác nhận tác vụ gửi.

### 5.7. Chuyên ngành — `/admin/majors`

Trang hiện đã có xem, thêm, sửa, xóa, lọc ngành dùng tên tạm, lỗi trong dialog và xử lý về trang trước khi xóa phần tử cuối. Đây là mẫu tốt để thống nhất các trang danh sách khác. [E17]

| Action | Đề xuất |
| --- | --- |
| Phạm vi trang | Ghi “Danh mục dùng chung”; nếu có số sinh viên theo kỳ thì tên cột phải nêu kỳ áp dụng. |
| Lọc tên tạm | Giữ, đổi thành công việc dễ hiểu “Cần bổ sung tên ngành”; hiển thị mã và tên hiện tại, tránh dùng tên bằng mã mà không giải thích. |
| Thêm | Giữ form ngắn mã/tên; quy tắc nhập rõ, lỗi đúng trường, không xóa dữ liệu người dùng khi trùng. |
| Xem | Drawer/modal gọn; có sửa, đóng, thử lại; có thể gom xem vào bấm mã ngành và giữ tên truy cập. |
| Sửa | Nhắc ảnh hưởng của đổi mã/tên trên dữ liệu dùng chung đã được xác minh. Hủy có bảo vệ bản nháp khi cần. |
| Xóa | Nếu biết ngành đang được tham chiếu, hiện lý do chặn và hướng sửa; nếu chỉ biết qua lỗi server, giữ dialog và chỉ rõ lỗi như hiện tại. Không bịa số sinh viên hoặc hứa chuyển ngành có sẵn. |
| Số liệu liên quan | Đề xuất số sinh viên và đường mở danh sách đúng ngành khi có dữ liệu; tránh nhét mọi quy tắc lớp vào bảng danh mục. |

Không cần mở rộng trang này thành dashboard riêng; ưu tiên hoàn thiện tên tạm, tính nhất quán và phòng xóa nhầm.

### 5.8. Danh sách lớp — `/admin/classes`

**Hiện trạng:** tìm kiếm, danh sách có giảng viên/sĩ số, phân trang, nút “Xem sinh viên” và nút nhập sinh viên. Import sinh viên có thể tạo lớp từ dữ liệu tệp. [E09]

| Action | Đề xuất |
| --- | --- |
| Nhập dữ liệu | Trước mắt giữ đường hiện có với nhãn “Nhập sinh viên từ Excel”; mô tả “Lớp được tạo từ thông tin trong tệp” và hướng dẫn cột GroupName. Không dùng chữ “cập nhật” khi chưa có hợp đồng cập nhật dữ liệu đã tồn tại. |
| Tạo lớp thủ công | Đề xuất riêng, cần hợp đồng tạo lớp, trùng tên trong kỳ, chọn GV và lớp trống; chưa gộp thành sửa label đơn giản. |
| Tìm kiếm | Tìm theo trường server hỗ trợ; phản hồi đang tải và Enter nhất quán. |
| Lọc | Ưu tiên “Chưa phân công GV”, “Đã phân công GV”, “Lớp chưa có sinh viên”. Nếu cần hỗ trợ server, ghi rõ phụ thuộc. |
| Xem sinh viên | Đổi thành “Chi tiết lớp” vì trang đích còn có giảng viên và quy tắc. Tên lớp là liên kết thao tác được bằng bàn phím; bấm cả hàng chỉ là hỗ trợ bổ sung. |
| Gán GV nhanh | Nút hiện tại không có; có thể mở bộ chọn cho chính lớp đó và dùng khả năng gán đơn hiện có. Tóm tắt tên lớp, kỳ, GV mới trước lưu. |
| Gán hàng loạt | Giai đoạn sau; cần danh sách lớp đích, phát hiện lớp đã có GV, chính sách ghi đè, kết quả thành công/thất bại từng lớp và phục hồi khi một phần lỗi. |
| Xóa lớp | Chưa đề xuất hiển thị cho đến khi rõ nghiệp vụ, điều kiện và tác động lên SV/nhóm/hạn. |
| Không có lớp | Nếu không lọc: hướng nhập tệp sinh viên với đúng kỳ. Nếu có lọc: xóa bộ lọc. |

Đếm nhóm tại danh sách chỉ hiển thị khi biết đợt đang được tính; không viết “6/6 nhóm” nếu mẫu số chỉ được suy từ sĩ số chia cho kích thước nhóm.

### 5.9. Chi tiết lớp — `/admin/classes/:id`

**Bố cục đề xuất:** breadcrumb → header gọn tên lớp/kỳ/GV/sĩ số → bốn tab **Sinh viên | Nhóm | Hạn chót | Cài đặt**. Có thể dùng ba tab và đưa hạn chót vào tab Nhóm nếu dữ liệu đơn giản; tiêu chí quyết định là không bắt người dùng rời lớp để tìm đợt liên quan.

Đây là đề xuất tổ chức lại và kết nối chức năng hiện có; không xây bảng nhóm thứ hai có hành vi khác.

| Tab/action | Quy định chi tiết |
| --- | --- |
| Sinh viên | Tìm tên/MSSV/email; số “đang hiển thị/tổng”; trạng thái tài khoản; lớp hiện tại đã rõ nên không lặp cột lớp. Thêm nhóm theo đợt nếu dữ liệu có. |
| Mở nhóm từ sinh viên | Đi đúng nhóm, lớp và đợt, có đường quay lại đúng tìm kiếm cũ. |
| Nhóm | Chọn đợt khi có nhiều đợt; hiển thị tổng nhóm, chờ duyệt, cần sửa, SV chưa có nhóm; cho mở bảng quản lý đã tồn tại trong khung Admin. |
| Hạn chót | Tên đợt, thời gian chính xác của lớp này, trạng thái, xem/chỉnh/gia hạn theo quyền. |
| Cài đặt: giảng viên | Thay form tìm → phân trang → select bằng bộ chọn có tìm kiếm và tải thêm. Kết quả gồm mã, tên, email để phân biệt người trùng tên. |
| Lưu giảng viên | Nêu GV trước → sau; giữ kiểm soát xung đột hiện có; lỗi không xóa lựa chọn. Nếu có người khác thay đổi, cho xem dữ liệu mới trước lưu lại. |
| Cài đặt: quy tắc | Giữ đủ bảy giá trị: min/max thành viên, min/max nhóm/lớp, min/max ngành/nhóm và min SV SE. Giữ trạng thái bật/tắt, giá trị gợi ý, cảnh báo và version. [E11] |
| Bật/tắt quy tắc | Thể hiện rõ “không áp dụng”, không hiển thị giá trị như vẫn bắt buộc. Khi cặp min/max có trạng thái khác nhau, không âm thầm thay cả hai chỉ vì người dùng chưa hiểu cặp. |
| Lưu quy tắc | Một vùng nút Lưu/Hủy thay đổi; nêu có thay đổi chưa lưu; lỗi gần trường. Không auto-save cho loạt thay đổi có thể ảnh hưởng ghép nhóm. |
| Tải lại do xung đột | Cảnh báo bản nháp có thể bị thay; cho kiểm tra thay đổi hiện tại trước quyết định. |
| Chuyển tab/quay lại/đổi kỳ | Bảo vệ bản nháp; tab hiện tại có thể được lưu trong URL cùng ngữ cảnh cần quay lại. |

Các nút mở cấu hình hiện là hai disclosure trực tiếp, chưa có căn cứ gọi “nhiều tầng sâu”. Có thể giữ disclosure nếu ít sử dụng; vấn đề cần giải quyết là khả năng tìm thấy và chiều cao trang khi mở cả hai.

### 5.10. Hạn chót — `/admin/deadlines`

**Danh sách đề xuất:** tên đợt, lớp áp dụng, trạng thái, khoảng thời gian hoặc “Lịch theo lớp”, tác vụ. Có bộ lọc trạng thái/lớp/tìm tên khi quy mô đủ lớn và nguồn dữ liệu hỗ trợ.

| Action | Đề xuất |
| --- | --- |
| Tạo hạn | Form có các nhóm thông tin, thời gian, lớp áp dụng và tóm tắt. Với nhiều lớp nên dùng trang rộng/drawer rộng; chỉ dùng hai bước nếu kiểm thử cho thấy dễ hơn. |
| Tên/mô tả | Tên phục vụ tìm lại; mô tả hướng dẫn cho người chịu tác động; giới hạn ký tự hiển thị rõ. |
| Thời gian | Ghi múi giờ nghiệp vụ, ví dụ “Giờ Việt Nam (UTC+7)” nếu hệ thống thống nhất cách lưu/hiển thị đó; hiển thị ngày giờ chính xác bên cạnh thời lượng tương đối. Không chỉ dựa trên múi giờ máy người dùng. |
| Chọn nhanh 3/7/14/30 ngày | Giữ khả năng hiện có; nêu rõ tính từ thời điểm bắt đầu đang chọn. |
| Danh sách lớp | Loading/lỗi/thử lại riêng; tìm kiếm; chọn/bỏ chọn theo kết quả lọc; khu “Đã chọn” dễ rà soát và bỏ từng lớp. Hiển thị tổng kỳ và tổng đã tải khác nhau nếu có phân trang. |
| Chọn tất cả | Phân biệt “N lớp đang hiển thị”, “M lớp phù hợp”, “Tất cả lớp trong kỳ”. Không hứa bao phủ toàn kỳ từ trang 200 phần tử. |
| Xác nhận tạo | Ghi kỳ, N lớp, khoảng giờ và thông báo email nào sẽ được yêu cầu. Sau tạo cho “Xem chi tiết”, tránh chỉ toast. |
| Xem chi tiết | Giữ thông tin từng lớp, giờ riêng, trạng thái hỗn hợp, tải mới và thử lại; nút đến nhóm giữ vai trò Admin. |
| Sửa lịch chưa bắt đầu | Nêu phạm vi toàn bộ hay các lớp được chọn. Có tóm tắt trước/sau; không sửa nhầm lịch lớp khác. |
| Gia hạn | Nút “Gia hạn cho N lớp”; hiển thị giờ cũ → mới cho từng lớp. Giải thích tại sao một số lớp không thể chỉnh. |
| Mở lại | Tách ý nghĩa với mở khóa nhóm. Mở lại hạn không có nghĩa nhóm đã duyệt được tự do sửa. |
| Đóng sớm | Ghi tên đợt và danh sách lớp bị ảnh hưởng; giữ xác nhận nguy hiểm. Có thể đề xuất lý do, nhưng lưu lý do/gửi nội dung mail cần backend hỗ trợ. |
| Xung đột phiên bản | Giữ bản nháp, nêu lịch đã được người khác cập nhật, có tải dữ liệu mới để kiểm tra; không tự ghi đè. |
| Đang gửi/timeout | Khóa ngữ cảnh, một request, không đóng form ngoài ý muốn. Nếu chưa biết kết quả, tra cứu deadline trước khi tạo lại. |
| Phân trang | Khi đổi kích thước về trang đầu; khi trang không còn dữ liệu có đường về trang hợp lệ. |

Không bổ sung hành động “Xóa deadline” như trong wireframe cũ khi khả năng hiện tại là đóng. Cần dùng đúng các trạng thái đang có, bao gồm khác biệt giữa từng lớp trong một deadline.

## 6. Khu vực nhóm và phân nhóm tự động mà Admin có thể sử dụng

### 6.1. Tích hợp về đúng hành trình Admin

Đường hiện tại có thể là Admin → Hạn chót → Xem → Quản lý nhóm → khung Giảng viên. Bảng nhóm sau đó có breadcrumb về duyệt nhóm và các menu dẫn sang những màn hình dùng chung khác. Đây là vấn đề tổ chức điều hướng, không phải hoàn toàn thiếu tính năng nhóm. [E03]

Đề xuất cho admin truy cập cùng chức năng từ Chi tiết lớp → Nhóm và Hạn chót → Chi tiết → Nhóm của lớp; giữ vai trò, học kỳ, lớp, đợt và nguồn quay lại. Quyền nút lấy từ khả năng thực tế do server trả về, không bật mọi action chỉ vì đang dùng khung Admin.

### 6.2. Bảng nhóm và sinh viên chưa phân

| Action | Đề xuất UX |
| --- | --- |
| Chọn đợt | Nếu nhiều đợt, có bộ chọn minh bạch; không dừng ở lỗi “nhiều phiên” rồi bắt người dùng tự tìm đường khác. |
| Tìm nhóm/SV | Giữ hai phạm vi tìm riêng nhưng có nhãn rõ; số kết quả đang lọc và tổng đối tượng không lẫn nhau. |
| Hiện/ẩn vùng SV chưa phân | Giữ trạng thái và số lượng; khi ẩn vẫn có nút khôi phục dễ thấy. |
| Tạo nhóm | Một điểm tạo chính; vùng kéo để tạo là cách hỗ trợ. Cho biết tên, thành viên, quy tắc thiếu và trạng thái sau tạo. |
| Thêm/chuyển SV | Giữ cả kéo thả và thao tác bằng nút/menu đã có; không thiết kế chỉ kéo thả. Hiển thị nhóm đích, sức chứa và lý do không thể chuyển. |
| Chuyển nhóm trưởng | Nêu rõ trưởng nhóm mới và hệ quả với nhóm cũ; kiểm thử trường hợp chuyển người là trưởng nhóm sang nhóm khác vì có thể thay trưởng nhóm cũ. |
| Gỡ thành viên | Dùng nhãn “Đưa về danh sách chưa có nhóm”; phân biệt với xóa SV khỏi hệ thống. Nếu là thành viên cuối, hệ quả giải tán phải được giải thích. |
| Nộp nhóm | Hiển thị quy tắc đủ/chưa đủ, khóa gì sau nộp và ai có quyền duyệt. |
| Duyệt/trả lại | Trạng thái và điều kiện rõ; trả lại có lý do. Giữ yêu cầu xác nhận đối với chuyển trạng thái quan trọng. |
| Mở khóa nhóm | Giải thích khác mở lại deadline; sau mở nhóm chuyển về trạng thái nào và ai được sửa. |
| Giải tán | Nêu tên nhóm, số thành viên chuyển về danh sách chưa phân và tác động được server xác nhận; không gọi chung “Xóa”. |
| Cập nhật trực tiếp | Kết nối gián đoạn không đồng nghĩa không thể đọc; ghi dữ liệu có thể chưa mới và có Làm mới. Đang ghi phải thể hiện chờ server xác nhận. |
| Xuất kết quả | Cho chọn rõ toàn lớp/kết quả đang lọc nếu cả hai được hỗ trợ; tên file và thông tin bên trong đúng lớp/kỳ/đợt. |

Không thay toàn bộ board bằng các thẻ nhóm mới trước khi thử nghiệm; board hiện có nhiều khả năng quản lý, tìm, kéo thả, duyệt và xuất. Cần sửa sự nhất quán và lối vào trước.

### 6.3. Duyệt nhóm

- Rút gọn khối thẻ chọn lớp nếu có nhiều lớp; bộ chọn lớp có tìm kiếm và một tóm tắt lớp được chọn sẽ giảm cuộn.
- Giữ trạng thái đủ điều kiện tách khỏi trạng thái “đã nộp/đã duyệt”; nhóm đủ thành viên chưa chắc đạt tất cả quy tắc.
- Các thẻ tổng hợp hiện đếm trên trang đang tải và đã có nhãn theo trang. Nếu muốn thành số toàn kỳ, cần số liệu tổng phù hợp; không chỉ đổi nhãn.
- Giảm trùng lặp nút xem trước/xuất giữa banner và đầu bảng; một nhóm hành động có phạm vi rõ.
- Sau bấm xem nhóm, nên cho duyệt/trả lại từ vùng chi tiết nếu quyền hợp lệ, tránh phải đóng modal và tìm lại hàng. Đây là sắp xếp lại thao tác đã có.
- Khi xuất ở vai trò admin, thông tin GV phải lấy từ lớp phụ trách, không suy từ tên/email người đang đăng nhập. Có đoạn gọi xuất đang truyền danh tính người dùng vào `lecturerCode`; cần kiểm thử kết quả file trước kết luận hệ quả cuối cùng. [E18]

### 6.4. Phân nhóm tự động

Màn hình dùng chung đã có chọn lớp, cấu hình mục tiêu, xem trước, tạo lại, so sánh trước/sau, xác nhận áp dụng và hai nhóm lịch sử. Có kiểm soát phương án cũ và trạng thái chưa xác nhận. Nên tái sử dụng thay vì đề xuất một tính năng mới song song. [E19]

| Bước/tab/action | Đề xuất |
| --- | --- |
| Chọn lớp | Có bộ chọn lớp/đợt trong ngữ cảnh Admin; lớp đã chọn từ trước không cần chọn lại. |
| Tổng quan | Số nhóm đạt/chưa đạt, SV chưa phân, nhóm được bảo vệ; ghi định nghĩa “được bảo vệ”. |
| Nhập số nhóm mục tiêu | Phân biệt số nhóm tổng và số nhóm sẽ tạo mới; gợi ý chỉ là gợi ý, giải thích vì sao khoảng không khả thi. |
| Tạo phương án | Nhãn “Tạo phương án xem trước”; khẳng định dữ liệu chưa thay đổi ở bước này nếu đúng hợp đồng. |
| Xem trước | Tổng SV chuyển, nhóm giữ/giải tán, thay nhóm trưởng và số chưa phân còn lại hiển thị trước phần chi tiết. |
| Tạo lại | Ghi “Tạo phương án khác”; có cách phân biệt và mở lại phương án đã lưu trong phạm vi hỗ trợ. |
| Áp dụng | Nút ghi rõ áp dụng cho lớp/đợt; xác nhận tác động và không hoàn tác nếu đúng hợp đồng hiện tại. Không quảng bá khả năng undo khi chưa có. |
| Phương án hết hiệu lực | Nêu nguyên nhân dữ liệu đổi và cách tạo lại; không cho áp dụng phương án cũ. |
| Kết quả chưa xác định | Giữ cơ chế tra cứu/thử lại cùng yêu cầu hiện có; không cho người dùng tạo ý định áp dụng mới chỉ vì request timeout. |
| Tab Dữ liệu hiện tại | Phân biệt dữ liệu đã lưu với phương án xem trước. |
| Tab Lịch sử phương án | Xem, mở, áp dụng chỉ khi còn hiệu lực; trạng thái và lý do vô hiệu rõ. |
| Tab Lịch sử áp dụng | Người thực hiện, lúc áp dụng và tác động nếu dữ liệu cung cấp; có chi tiết và cách quay về lớp. |

## 7. Chuẩn hóa trạng thái, phản hồi và khả năng tiếp cận

### 7.1. Bảng trạng thái bắt buộc cho mọi luồng

| Trạng thái | Cách trình bày | Action tiếp theo |
| --- | --- | --- |
| Chưa có dữ liệu | Nói đúng “chưa có SV/lớp/phân công trong kỳ” | Tạo/nhập/đổi phạm vi phù hợp khả năng |
| Không khớp bộ lọc | Giữ bộ lọc và nói không có kết quả | Xóa một hoặc tất cả điều kiện |
| Đang tải lần đầu | Khung chờ đúng cấu trúc khi phù hợp | Giữ tiêu đề và ngữ cảnh |
| Đang làm mới | Giữ dữ liệu cũ có nhãn đang cập nhật | Chặn action dùng dữ liệu cũ khi có rủi ro |
| Đang ghi | Hiện đối tượng và việc đang xử lý; một thao tác gửi | Không đóng/đổi ngữ cảnh làm mất kết quả |
| Thành công | Ghi đúng kết quả đã biết, lưu trên trang với tác vụ quan trọng | Xem bản ghi hoặc làm việc kế tiếp |
| Lỗi sửa được | Lỗi gần trường/dòng; giữ dữ liệu | Sửa và chủ động gửi lại |
| Kết quả chưa xác định | “Yêu cầu đã gửi nhưng chưa xác nhận kết quả” | Kiểm tra trạng thái/danh sách, không tự gửi lại |
| Hết phiên | Giải thích cần đăng nhập lại, không hiện dữ liệu người trước | Đăng nhập; không tự thực hiện lại tác vụ ghi |
| Thiếu quyền | Nêu thao tác không được phép, giữ đường về | Quay lại/xem ở chế độ được phép |
| Dữ liệu thay đổi | Nêu xung đột, giữ bản nháp an toàn | Xem bản mới, kiểm tra rồi chủ động lưu |

Không biến mọi kết quả thành toast hoặc mọi thành công thành popup. Lỗi người dùng cần sửa phải còn trên trang; thông báo nhỏ dùng toast; xác nhận dùng cho hệ quả quan trọng hoặc nguy hiểm.

### 7.2. Nội dung và hệ thống nút

- Dùng động từ và đối tượng: “Nhập 120 sinh viên”, “Gửi cho 35 người”, “Gia hạn cho 3 lớp”, “Bỏ tệp”. Tránh “Xác nhận/OK/Hủy” nếu có thể nói rõ hơn.
- Một hành động chính nổi bật cho mỗi vùng công việc. Nút xóa không cùng độ nổi với tác vụ thường dùng.
- Không dùng icon đơn độc thiếu tên truy cập. Hành động chính giữ chữ; menu ba chấm cho hành động ít dùng.
- Nút bị vô hiệu cần lý do nhìn thấy, không chỉ tooltip; người dùng bàn phím/chạm cũng đọc được.
- Không dùng “đã gửi mail” thay cho “đã tạo liên kết” hoặc “đã tiếp nhận yêu cầu”. Tiến độ thật chỉ có khi nguồn dữ liệu cung cấp.
- Không dùng thuật ngữ kỹ thuật role, ID, version hoặc endpoint trong hướng dẫn vận hành thông thường.

### 7.3. Modal, bàn phím và thiết bị

- Modal chung hiện đã có Escape, đóng bằng nền/X và khóa cuộn trang, nhưng chưa tập trung đầy đủ xử lý focus dùng chung. Một số form tạo đã tự xử lý riêng; cần thống nhất và kiểm thử việc Tab có thoát ra nền hay không. [E20]
- Khi mở form, focus ở trường hợp lý; modal nguy hiểm ưu tiên nơi giúp đọc tác động/thoát an toàn. Khi đóng trả focus về nút mở.
- Tab/Shift+Tab đi theo thứ tự; Enter không kích hoạt hai request; Escape không tự bỏ bản nháp hoặc đóng trong lúc ghi.
- Phím `/` để tìm chỉ là tùy chọn sau khi bảo đảm bàn phím cơ bản; không bắt phím khi đang nhập, soạn tiếng Việt hoặc đang trong modal khác.
- Màu trạng thái đi kèm chữ/biểu tượng. Đo tương phản, vùng bấm, zoom 200%, chuỗi dài và trình đọc màn hình trước khi tuyên bố đạt chuẩn tiếp cận.
- Kiểm tra 1366×768, 1024×768, màn điện thoại khoảng 390px, menu thu gọn và chiều ngang. Không đẩy hướng dẫn quan trọng vào hover-only.

## 8. Phân loại khả năng triển khai

Các nhóm dưới đây phục vụ lập kế hoạch; vẫn cần kiểm chứng API trên môi trường mục tiêu trước triển khai.

| Nhóm | Nội dung |
| --- | --- |
| Chủ yếu sửa FE/nội dung với khả năng hiện có | Sửa nhãn sai của nút chọn tệp; giữ khung Admin khi mở chức năng nhóm; làm rõ phạm vi kỳ/toàn hệ thống; gộp bộ lọc giảng viên; giảm nút trùng; nhất quán empty/error/focus; kỳ mặc định form sinh viên; kết quả sau tạo giảng viên; khôi phục ngữ cảnh danh sách. |
| FE và xác minh hợp đồng hiện có | Mẫu đúng cho từng import; bổ sung cột lớp vì server đã có trường; chọn và đếm qua trang; xử lý phạm vi gửi hiện tại; lớp đầy đủ trong tạo deadline; ngăn đóng/đổi kỳ trong lúc ghi; nhãn/phạm vi xuất Excel; tái sử dụng gán GV đơn. |
| Cần mở rộng dữ liệu/API hoặc quyết định nghiệp vụ | Bộ lọc lớp/nhóm phía server; lọc theo trạng thái gửi thật; KPI tổng toàn kỳ; theo dõi tác vụ nền và chuông thông báo; tạo/xóa lớp thủ công; sửa/chuyển/xóa SV; đặt lại mật khẩu bởi admin; phân công hàng loạt; import một phần; vòng đời khóa/lưu trữ kỳ; lý do đóng hạn được lưu và gửi email. |

Không gọi các mục nhóm cuối là “chỉ cải thiện FE”. Chúng vẫn có giá trị đề xuất nhưng cần được chốt riêng về nghiệp vụ, dữ liệu, quyền và kiểm thử tích hợp.

## 9. Lộ trình ưu tiên đề xuất

| Đợt | Mục tiêu | Hạng mục | Điều kiện hoàn tất |
| --- | --- | --- | --- |
| 1 | Ngăn sai đối tượng và mất ngữ cảnh | UX-01 đến UX-08; nhãn xuất đúng phạm vi; chỉ dẫn sau kết quả chưa rõ | Kiểm chứng phạm vi chọn/gửi, kỳ đích, mẫu, đóng form, danh sách lớp đầy đủ và ý nghĩa xóa |
| 2 | Làm trơn công việc thường xuyên | Điều hướng nhóm giữ Admin; chi tiết lớp thành trung tâm; phân công GV; bộ lọc/empty/pagination; sau tạo/import | Người dùng hoàn thành luồng không phải đổi vai trò hoặc tìm lại cùng đối tượng |
| 3 | Tăng khả năng theo dõi | Dashboard theo công việc; chỉ số có định nghĩa; tìm/lọc lớp/nhóm; xuất có phạm vi; truy vết tác vụ khi có nguồn | Dữ liệu đúng kỳ/lớp/đợt; không số liệu giả; loading/lỗi từng khối |
| 4 | Mở rộng có kiểm chứng | Batch assignment, nhập một phần, CRUD còn thiếu, thông báo nền, khóa kỳ | Có quyết định nghiệp vụ, contract và ca nghiệm thu trước khi mở nút cho người dùng |

Khả năng tiếp cận, nội dung song ngữ và trạng thái lỗi là tiêu chí xuyên suốt từng đợt, không dồn hết vào cuối. Bỏ Logout trùng là việc nhỏ có thể làm sớm, nhưng không được xếp cao hơn sai phạm vi gửi hoặc sai kỳ đích chỉ vì sửa dễ.

## 10. Hành trình mục tiêu để thiết kế và tester cùng đối chiếu

| Công việc | Hành trình mục tiêu | Điểm kiểm tra quan trọng |
| --- | --- | --- |
| Chuẩn bị kỳ mới | Chọn/tạo kỳ → chuẩn bị tài khoản GV → nhập SV tạo lớp theo tệp → kiểm tra lớp/GV/quy tắc → thiết lập hạn | Nêu rõ bước tạo tài khoản toàn hệ thống và bước có dữ liệu theo kỳ; không giả định có tạo lớp thủ công |
| Gửi kích hoạt | Danh sách → lọc → chọn → xem người nhận và số bỏ qua → gửi → nhận trạng thái đã xác nhận | Tập gửi đúng toàn bộ điều kiện có hiệu lực; không cộng sai qua trang |
| Sửa tệp import | Tải mẫu đúng → chọn tệp → kiểm tra lỗi → sửa trong Excel → chọn lại tệp đã sửa → nhập → xem tổng kết | Đúng dòng/cột/sheet; giữ kỳ; không tự nhập một phần |
| Phân công GV | Lớp → chọn gán/đổi → tìm GV → kiểm tra lớp và người mới → lưu → thấy kết quả | Xung đột không tự ghi đè; không cần truy qua nhiều trang để chọn một người |
| Xử lý SV chưa có nhóm | Lớp → Nhóm → chọn đợt → danh sách chưa phân → xem quy tắc → thêm/chuyển hoặc tạo nhóm → kiểm tra kết quả | Đúng vai trò/kỳ/lớp/đợt; trạng thái nhóm có thể chỉnh; không chỉ dựa đủ số người |
| Gia hạn một số lớp | Hạn → xem → chọn lớp → đối chiếu giờ cũ/mới → xác nhận → xem trạng thái riêng từng lớp | Lớp không chọn không đổi; nhóm đã duyệt không tự mở khóa |
| Phân nhóm tự động | Lớp/đợt → mục tiêu → phương án → so sánh → xác nhận áp dụng → đối soát | Phương án mới nhất, nhóm bảo vệ, thay nhóm trưởng, không tự gửi lại khi timeout |
| Xuất báo cáo | Chọn lớp/đợt → xem trước → chọn rõ phạm vi → xuất → đối chiếu tổng | Nội dung file, lớp/kỳ/GV và số dòng khớp phạm vi được nêu |

Không đánh giá luồng chỉ bằng số click. Một bước xác nhận giúp tránh gửi nhầm hoặc áp dụng nhầm có giá trị hơn việc giảm một click.

## 11. Tiêu chí nghiệm thu và kế hoạch kiểm thử UX

### 11.1. Các ca trọng yếu

| Ca | Tình huống | Kết quả mong đợi |
| --- | --- | --- |
| AT-01 | Đang xem kỳ khác kỳ hiện tại, mở thêm sinh viên | Kỳ đích mặc định là kỳ đang xem hoặc được nêu rõ trước khi nhập/lưu; không âm thầm đổi kỳ |
| AT-02 | Chọn SV chưa kích hoạt ở trang 1 rồi sang trang 2 | Số chọn/đủ điều kiện/bỏ qua vẫn đúng; không khóa gửi vì chỉ tính dữ liệu trang 2 |
| AT-03 | Lọc “chưa có liên kết”, chọn toàn bộ rồi gửi | Tập xác nhận và tập gửi đúng cùng phạm vi; nếu chưa hỗ trợ phải giải thích giới hạn trước khi gửi |
| AT-04 | Đang lọc tài khoản đã kích hoạt, dùng gửi toàn bộ | Không phát sinh gửi cho nhóm chưa kích hoạt nằm ngoài bộ lọc dưới nhãn hiện tại |
| AT-05 | Đổi bộ lọc sau khi đã chọn | Không vô tình mang tập chọn cũ sang ý định gửi mới |
| AT-06 | Tải mẫu ở hai trang import | Mỗi trang tải đúng mẫu; mẫu hợp lệ đi qua được preview và kiểm tra server với dữ liệu giả hợp lệ |
| AT-07 | Sửa tệp rồi chọn lại đúng tên cũ | Preview và lỗi cập nhật theo nội dung mới; kỳ đích giữ nguyên |
| AT-08 | Tệp có dòng lỗi/ngành mới/giảng viên không tồn tại | Hiển thị đúng giai đoạn phát hiện, dòng/trường và hướng sửa; không báo tất cả đã nhập khi chỉ kiểm tra cục bộ |
| AT-09 | Có bản nháp quy tắc hoặc tệp đã chọn rồi đổi kỳ/quay lại | Cảnh báo đúng lúc; ở lại giữ dữ liệu, bỏ thay đổi chuyển đúng kỳ và bỏ chọn cũ |
| AT-10 | Tạo deadline khi lớp đang tải hoặc tải lỗi | Phân biệt đang tải/lỗi/không có lớp, có thử lại; không tạo từ danh sách thiếu mà không biết |
| AT-11 | Kỳ có trên 200 lớp | Mọi lớp cần chọn đều tìm/đến được; “toàn bộ” có ngữ nghĩa đúng |
| AT-12 | Đang tạo deadline, bấm X/nền/Escape/đổi kỳ | Không mất trạng thái đang gửi hoặc tạo nhầm dưới kỳ khác; có kết quả hoặc phục hồi rõ |
| AT-13 | Deadline có lịch khác nhau theo lớp | Danh sách và chi tiết không đưa một ngày/countdown gây hiểu sai; gia hạn đúng lớp được chọn |
| AT-14 | Admin vào bảng nhóm từ hạn/lớp rồi quay lại | Giữ khung vai trò và ngữ cảnh; về đúng danh sách/bộ lọc/trang |
| AT-15 | Người dùng chỉ dùng bàn phím để nhập, chọn, gán GV, quản lý nhóm | Có thể hoàn thành; focus không rơi nền; không yêu cầu kéo thả |
| AT-16 | Timeout sau gửi mail/import/lưu cấu hình/áp dụng phương án | Không báo chắc chắn thất bại/thành công khi chưa biết; không tự gửi lại; có cách tra cứu |
| AT-17 | Hai admin cùng sửa GV/quy tắc/deadline | Phát hiện xung đột theo khả năng server; giữ thông tin để kiểm tra, không tự ghi đè |
| AT-18 | Tạo giảng viên khi đang xem phạm vi theo kỳ | Thấy kết quả và mở được tài khoản vừa tạo ở đúng phạm vi, không nghĩ tạo thất bại |
| AT-19 | Xóa giảng viên từ danh sách theo kỳ | Xác nhận nói rõ tài khoản toàn hệ thống và hệ quả đã xác minh; không gọi là chỉ bỏ khỏi kỳ |
| AT-20 | Lọc còn M SV trong preview xuất rồi bấm xuất | Nút nêu rõ phạm vi; số dòng file khớp M hoặc toàn lớp theo lựa chọn công khai |
| AT-21 | Admin xuất kết quả cho lớp của GV khác | Thông tin GV trong file đúng lớp, không lấy danh tính admin làm GV |
| AT-22 | Chỉ một khối Dashboard lỗi | Các khối khác dùng được; khối lỗi có thử lại, không hiển thị 0 thay dữ liệu chưa tải |
| AT-23 | Chỉ bộ lọc liên kết làm danh sách trống; xóa phần tử cuối trang | Có hướng xóa lọc/về trang hợp lệ, không hướng nhầm sang import hoặc tạo mới |
| AT-24 | Đổi ngôn ngữ, zoom 200%, màn nhỏ và chữ dài | Nội dung quan trọng/nút tiếp cận được; không trộn ngôn ngữ hoặc mất thông báo lý do bị khóa |
| AT-25 | Hết phiên hoặc thiếu quyền trong lúc ghi | Không tự replay tác vụ sau đăng nhập; thông báo đúng và chỉ hiện dữ liệu của phiên hợp lệ |

### 11.2. Đo trước và sau bằng cùng công việc

Nên mời một nhóm nhỏ người có nghiệp vụ admin, gồm người mới và người quen hệ thống, thực hiện các hành trình ở mục 10 bằng dữ liệu giả. Ghi thời gian hoàn thành, tỷ lệ hoàn thành không trợ giúp, số lần đi nhầm trang, lỗi chọn sai phạm vi, mức tự tin về kết quả và đánh giá độ dễ sau từng nhiệm vụ.

Đặt mục tiêu sau khi có số đo ban đầu. Riêng độ đúng phạm vi có tiêu chí bắt buộc: mọi ca nghiệm thu về kỳ, người nhận, lớp đích và nội dung xuất phải khớp đặc tả. Đây là tiêu chí đạt/không đạt, không phải lời hứa “loại bỏ 100% lỗi người dùng”.

## 12. Danh mục bằng chứng mã nguồn

Các đường dẫn dưới đây là bằng chứng của nhận định tĩnh tại phiên bản đã nêu. Đường dẫn số dòng có thể đổi khi ứng dụng được chỉnh sửa sau báo cáo.

| Mã | Nguồn đối chiếu |
| --- | --- |
| E01 | `Client/src/app/router/routes.tsx`: chín route Admin và các route dùng chung trong vùng lecturer. |
| E02 | `Client/src/features/import/components/FileDropzone.tsx:248`: tải mẫu sinh viên; cùng file có nút “Hủy” mở chọn tệp; `Client/public/sample-students.xlsx` tồn tại. Cả hai trang import dùng component này. |
| E03 | `Client/src/features/deadline/components/DeadlineDetailModal.tsx:79`; `Client/src/features/group/navigation.ts:1`; `Client/src/app/router/RoleRoute.tsx:30`; `Client/src/pages/lecturer/LecturerGroupWorkspacePage.tsx`; `Client/src/features/group/hooks/useGroupBoard.ts:67`. |
| E04 | `Client/src/pages/admin/StudentListPage.tsx`; `Client/src/features/students/components/CreateStudentModal.tsx:56`; `Client/src/pages/admin/LecturerListPage.tsx`; `Client/src/features/lecturers/components/CreateLecturerModal.tsx`; `Client/src/pages/admin/LecturerImportPage.tsx`. |
| E05 | `Client/src/features/import/components/ImportPreviewTable.tsx`; `Client/src/features/lecturers/components/LecturerImportPreviewTable.tsx`; `Client/src/features/import/components/ImportSuccessSummary.tsx`. |
| E06 | `Client/src/features/terms/components/TermScope.tsx:22`; `Client/src/app/providers/TermContext.tsx`; `Client/src/features/terms/types.ts`; `Client/src/features/terms/components/TermSelect.tsx:336`. |
| E07 | `Client/src/features/deadline/components/CreateDeadlineModal.tsx:187`, `:225`, `:403`, `:430`; `Client/src/components/common/Modal.tsx`. |
| E08 | `Client/src/pages/admin/AdminDashboardPage.tsx:67`; `Client/src/locales/vi.json:435`. |
| E09 | `Client/src/pages/admin/ClassListPage.tsx`; `Client/src/features/classes/api/classApi.ts`; `Server/src/main/java/com/fmaking/service/StudentService.java:224`. |
| E10 | `Client/src/features/import/utils/excelParser.ts:35`; `Client/src/features/lecturers/utils/lecturerExcelParser.ts:11`; `Client/src/features/import/api/importApi.ts`. |
| E11 | `Client/src/features/rules/types.ts`; `Client/src/features/rules/components/ClassRulesForm.tsx`; `Client/src/features/classes/components/ClassManagementControls.tsx`; `Client/src/features/classes/components/ClassLecturerAssignment.tsx`. |
| E12 | `Client/src/features/students/components/BatchActivationModal.tsx:52`; `Client/src/features/students/api/studentApi.ts`; `Server/src/main/java/com/fmaking/web/rest/StudentResource.java:95`; `Server/src/main/java/com/fmaking/service/StudentService.java:418`. |
| E13 | `Client/src/pages/admin/StudentListPage.tsx:60`; `Client/src/features/students/components/BulkActionToolbar.tsx`; `Client/src/features/students/components/BatchActivationModal.tsx:39`. |
| E14 | `Client/src/pages/admin/AdminDeadlinePage.tsx:55`: lấy danh sách lớp trang đầu size 200, truyền vào form tạo deadline. |
| E15 | `Client/src/pages/admin/LecturerListPage.tsx`; `Client/src/features/lecturers/api/lecturerApi.ts`; `Server/src/main/java/com/fmaking/service/LecturerService.java:489`. |
| E16 | `Client/src/features/group/components/GroupPreviewExportModal.tsx:75` và `:108`: dữ liệu xem đã lọc nhưng xuất toàn bộ. |
| E17 | `Client/src/pages/admin/MajorListPage.tsx`; các component `MajorFilterBar`, `MajorFormModal`, `MajorDetailsModal`, `MajorTable` trong `Client/src/features/majors/components`. |
| E18 | `Client/src/pages/lecturer/LecturerGroupReviewPage.tsx:124`; `Client/src/features/group/utils/exportGroupResultExcel.ts`. Cần kiểm thử file cuối để xác định thông tin metadata nào thực sự dùng. |
| E19 | `Client/src/pages/lecturer/LecturerAllocationPage.tsx`; `Client/src/features/allocation/hooks/useAllocationFlow.ts`; các component báo cáo/lịch sử trong `Client/src/features/allocation/components`. |
| E20 | `Client/src/components/common/Modal.tsx`; `Client/src/components/layout/ManagementLayout.tsx`; `Client/src/components/layout/Sidebar.tsx`; `Client/src/components/layout/TopNavbar.tsx`; `Client/src/components/layout/AccountPopover.tsx`; `Client/src/styles/index.css`. |
| E21 | `Server/src/main/java/com/fmaking/service/dto/StudentDTO.java`: có `schoolClassId`, `groupName`, `lecturerCode`; `Client/src/features/students/types.ts` chưa khai báo các trường đó. |

Tài liệu nội bộ được tham khảo về nguyên tắc: `docs/frontend/08-quy-tac-cho-nguoi-va-agent.md`, đặc biệt phân biệt kết quả đã biết/chưa biết, không bịa API hoặc số liệu, không mất ngữ cảnh khi lỗi và nút có động từ/đối tượng rõ.
