# F-Group Making — Đề cương & Nội dung Slide Thuyết trình MVP (EXE101)

> **Dự án:** F-Group Making — Nền tảng Quản lý & Hỗ trợ Phân nhóm Sinh viên Tự động  
> **Môn học:** Khởi nghiệp Đổi mới Sáng tạo (EXE101) — Đại học FPT  
> **Bộ nhận diện thiết kế gợi ý:** Phong cách FPT University (Màu chủ đạo: **Xanh dương đậm** `#1D4ED8` & **Cam năng động** `#EA580C`, nền **Trắng** `#FFFFFF` & ghi xám thanh lịch).  
> **Mục tiêu slide:** Trực quan, súc tích, hướng đến trải nghiệm người dùng và giải quyết bài toán thực tế; **tuyệt đối không đưa mã nguồn, thuật toán phức tạp hay thuật ngữ kỹ thuật khô khan vào slide.**

---

## TỔNG QUAN CẤU TRÚC BỘ SLIDE (12 SLIDES)

| Slide | Tiêu đề slide | Trọng tâm nội dung | Thời lượng dự kiến |
| :---: | :--- | :--- | :---: |
| **01** | **Trang bìa — F-Group Making** | Định vị sản phẩm & Tinh thần dự án | 30s |
| **02** | **Nỗi đau thực tế khi chia nhóm** | Bất cập của sinh viên & giảng viên truyền thống | 45s |
| **03** | **Giải pháp đột phá từ F-Group Making** | Số hóa toàn diện quy trình thành lập nhóm | 45s |
| **04** | **Đối tượng sử dụng & Vai trò** | Admin — Giảng viên — Sinh viên gắn kết | 45s |
| **05** | **Bức tranh chức năng MVP hiện tại** | Những gì hệ thống đã xây dựng và vận hành | 60s |
| **06** | **Hành trình hoạt động từ đầu đến cuối** | 4 giai đoạn từ Nhập lớp đến Hoàn tất | 45s |
| **07** | **Sinh viên chủ động & Giảng viên kiểm duyệt** | Tự ghép nhóm thông minh & Duyệt nhóm chuẩn hóa | 60s |
| **08** | **Linh hoạt can thiệp: Bảng Sắp nhóm Nâng cao** | Trực quan hóa kéo - thả sinh viên dạng Kanban | 45s |
| **09** | **Trái tim sản phẩm: Phân bổ Tự động Thông minh** | Xếp nhóm công bằng, cân bằng sĩ số, bảo vệ nhóm chuẩn | 60s |
| **10** | **Tình huống thực tế: Lớp học 36 sinh viên** | Minh họa trước và sau khi chạy phân bổ tự động | 60s |
| **11** | **Báo cáo tiến độ & Độ hoàn thiện MVP** | Đánh giá khách quan các phân hệ đã hoàn thành | 45s |
| **12** | **Giá trị mang lại & Hướng đi tương lai** | Tác động thực tế và tầm nhìn phát triển | 45s |

---

## CHI TIẾT NỘI DUNG TỪNG SLIDE

---

### SLIDE 01: TRANG BÌA — F-GROUP MAKING

* **Tiêu đề slide:** **F-GROUP MAKING**
* **Phụ đề:** Nền tảng Quản lý Lớp học & Hỗ trợ Phân nhóm Sinh viên Tự động
* **Thông điệp chính:** Giải phóng giảng viên, trao quyền sinh viên — Chấm dứt nỗi ám ảnh chia nhóm đầu kỳ.
* **Nội dung hiển thị trên slide:**
  * Dự án Khởi nghiệp Đổi mới Sáng tạo **EXE101** — Đại học FPT
  * Đơn vị thực hiện: **Nhóm dự án F-Group Making**
  * Giá trị cốt lõi: **Chủ động • Công bằng • Tối ưu • Tức thời**
* **Gợi ý thiết kế & Hình ảnh:**
  * Logo F-Group Making nổi bật với tone màu Cam FPT và Xanh dương.
  * Đồ họa vector các sinh viên nhiều chuyên ngành đang kết nối thành một vòng tròn nhóm thống nhất.
* **Speaker Notes (30 giây):**
  > *"Kính chào thầy cô Ban Giám khảo và các bạn! Đầu mỗi học kỳ, đặc biệt là các môn học dự án như EXE101 hay Đồ án Tốt nghiệp, bài toán chia nhóm luôn là cơn đau đầu kéo dài cho cả giảng viên lẫn sinh viên. Hôm nay, nhóm chúng em xin được giới thiệu **F-Group Making** — giải pháp toàn diện giúp chuyển đổi số quy trình phân nhóm, đảm bảo 100% công bằng, chuẩn quy chế và chỉ mất vài phút để hoàn tất."*

---

### SLIDE 02: NỖI ĐAU THỰC TẾ KHI CHIA NHÓM TRUYỀN THỐNG

* **Tiêu đề slide:** **BÀI TOÁN CŨ — NHIỀU NỖI ĐAU**
* **Thông điệp chính:** Cách làm thủ công qua Excel và nhóm chat đang gây lãng phí thời gian và bất bình đẳng cho người học.
* **Nội dung hiển thị trên slide:**
  * 🔴 **Sinh viên "bơ vơ":** Khó tìm bạn liên ngành (SE, Kinh doanh, Đồ họa); sinh viên học lại/trái lớp dễ bị cô lập.
  * 🔴 **Nhóm tự phát sai quy chế:** Đến sát ngày nộp mới biết thiếu người, thiếu chuyên ngành bắt buộc.
  * 🔴 **Giảng viên quá tải:** Mất nhiều ngày dò từng dòng Excel, đếm tay từng sinh viên để ghép nhóm dư.
  * 🔴 **Xung đột & Khiếu nại:** Xếp nhóm cưỡng ép tạo tâm lý bất mãn, giảm chất lượng học tập cả kỳ.
* **Gợi ý thiết kế & Hình ảnh:**
  * Chia đôi bố cục: Một bên là hình ảnh file Excel chằng chịt các màu đánh dấu kèm đồng hồ đếm ngược; một bên là biểu tượng các bạn sinh viên đứng lẻ loi với dấu chấm hỏi đỏ.
* **Speaker Notes (45 giây):**
  > *"Thực tế tại các lớp EXE101, sinh viên khối ngành Kinh tế rất khó tìm được các bạn Kỹ thuật phần mềm (SE) để lập trình sản phẩm. Nhiều bạn ít mối quan hệ đành chấp nhận bị bỏ lại đến phút chót. Về phía giảng viên, thầy cô phải mất hàng giờ đồng hồ căng mắt dò file Excel, vừa phải nhớ luật sĩ số 4–6 bạn, vừa phải kiểm tra từng nhóm có đủ bạn IT không. Cách làm thủ công này không chỉ tốn công sức mà còn dễ gây sai sót và ức chế cho sinh viên."*

---

### SLIDE 03: GIẢI PHÁP ĐỘT PHÁ TỪ F-GROUP MAKING

* **Tiêu đề slide:** **GIẢI PHÁP F-GROUP MAKING**
* **Thông điệp chính:** Cân bằng hoàn hảo giữa tính chủ động của sinh viên và sự kiểm soát chuẩn mực của giảng viên.
* **Nội dung hiển thị trên slide:**
  * 💡 **Sinh viên tự do có định hướng:** Tự tạo nhóm theo ý tưởng, nhận gợi ý thành viên theo **Điểm tương thích**.
  * 💡 **Giảng viên kiểm soát toàn diện:** Tùy biến quy chế nhóm từng lớp, duyệt nhóm và điều chỉnh trực quan.
  * 💡 **Phân nhóm tự động 1-Click:** Tự động sắp xếp 100% sinh viên còn lẻ đạt chuẩn quy chế trong vài giây.
  * 💡 **Đồng bộ thời gian thực:** Cập nhật trạng thái nhóm, deadline và kết quả tức thì trên mọi thiết bị.
* **Gợi ý thiết kế & Hình ảnh:**
  * Sơ đồ mũi tên 3 bước: **Tự ghép nhóm thông minh** ➔ **Giảng viên kiểm duyệt** ➔ **Thuật toán tự động hoàn tất**.
  * Icon chiếc khiên bảo vệ (đại diện cho việc bảo vệ nhóm hợp lệ) và tia sét (tốc độ xử lý tức thời).
* **Speaker Notes (45 giây):**
  > *"F-Group Making không phải là công cụ ép buộc sinh viên vào nhóm ngẫu nhiên, mà tôn trọng tối đa sự tự do của các bạn trong giai đoạn đầu thông qua hệ thống gợi ý tương thích. Sau khi hết hạn, hệ thống trao cho giảng viên quyền lực tối ưu: tự động gom toàn bộ các bạn còn lại, xếp vào các nhóm đạt 100% quy chế mà vẫn giữ nguyên những nhóm các bạn đã dày công tự xây dựng."*

---

### SLIDE 04: ĐỐI TƯỢNG SỬ DỤNG & VAI TRÒ HỆ THỐNG

* **Tiêu đề slide:** **HỆ SINH THÁI 3 VAI TRÒ GẮN KẾT**
* **Thông điệp chính:** Mỗi đối tượng đều có không gian làm việc chuyên biệt, tiện ích và bảo mật.
* **Nội dung hiển thị trên slide:**
  * 🎓 **Sinh viên (Student):**
    * Xem hạn chót chọn nhóm, tạo nhóm, mời thành viên.
    * Xem điểm tương thích để chọn nhóm phù hợp, nộp nhóm duyệt.
  * 👨‍🏫 **Giảng viên (Lecturer):**
    * Cấu hình 7 quy định nhóm và quản lý thời hạn (Deadline).
    * Duyệt/từ chối nhóm, kéo thả sắp nhóm thủ công và chạy phân bổ tự động.
  * ⚙️ **Quản trị viên (Admin):**
    * Quản lý học kỳ, ngành học, lớp học.
    * Nhập danh sách lớp từ file Excel, phân công giảng viên.
* **Gợi ý thiết kế & Hình ảnh:**
  * 3 thẻ tròn/hình hộp đại diện cho 3 vai trò với 3 màu sắc nhận diện: Xanh dương (Admin), Cam (Giảng viên), Xanh ngọc (Sinh viên).
* **Speaker Notes (45 giây):**
  > *"Hệ thống được thiết kế phân quyền chặt chẽ. Quản trị viên chỉ cần vài giây để nạp danh sách lớp từ file Excel. Giảng viên sở hữu trung tâm điều khiển riêng để thiết lập luật chơi và giám sát lớp học. Còn sinh viên có một không gian tương tác thân thiện như một mạng xã hội thu nhỏ để tìm kiếm đồng đội phù hợp với năng lực của mình."*

---

### SLIDE 05: BỨC TRANH CHỨC NĂNG MVP HIỆN TẠI

* **Tiêu đề slide:** **TỔNG QUAN TÍNH NĂNG MVP**
* **Thông điệp chính:** Hệ thống đã hoàn thiện các phân hệ cốt lõi, sẵn sàng phục vụ một chu kỳ phân nhóm trọn vẹn.
* **Nội dung hiển thị trên slide:**
  * ✅ **Đã hoàn thiện & Sẵn sàng Demo:**
    * Quản lý lớp, học kỳ, phân công giảng viên & Import Excel.
    * Cấu hình 7 quy định nhóm theo từng lớp học.
    * Quản lý thời hạn (Deadline) và gia hạn theo từng lớp.
    * Sinh viên chọn nhóm, gợi ý tương thích, nộp duyệt.
    * Giảng viên duyệt nhóm & Bảng sắp nhóm nâng cao (Kéo thả).
  * ⚡ **Đã triển khai đầy đủ & Sẵn sàng thử nghiệm:**
    * Phân nhóm tự động: Dự đoán số nhóm, Xem trước phương án, Áp dụng nguyên tử.
* **Gợi ý thiết kế & Hình ảnh:**
  * Bảng ma trận chức năng đơn giản, kèm các huy hiệu trạng thái xanh lá **Ready to Demo** chuyên nghiệp.
* **Speaker Notes (60 giây):**
  > *"Nhìn vào bức tranh sản phẩm MVP, toàn bộ luồng nghiệp vụ từ bước khởi tạo lớp, import danh sách, cấu hình quy định, sinh viên tương tác lập nhóm cho đến bảng kéo thả thủ công của giảng viên đều đã hoàn thiện 100% và sẵn sàng demo trực tiếp. Phân hệ Phân bổ tự động đã được lập trình đầy đủ cả giao diện lẫn thuật toán xử lý, hỗ trợ đầy đủ các bước từ gợi ý, xem trước đến áp dụng chính thức."*

---

### SLIDE 06: HÀNH TRÌNH HOẠT ĐỘNG TỪ ĐẦU ĐẾN CUỐI

* **Tiêu đề slide:** **QUY TRÌNH VẬN HÀNH 4 BƯỚC**
* **Thông điệp chính:** Quy trình khép kín, minh bạch, không bỏ sót bất kỳ sinh viên nào.
* **Nội dung hiển thị trên slide:**
  * **Bước 1: Thiết lập lớp & Quy chế (Admin & Giảng viên)**
    * Import danh sách, đặt quy định nhóm (sĩ số, ngành, SE) và mở hạn chót.
  * **Bước 2: Sinh viên tự do tìm nhóm (Student)**
    * Sinh viên tự ghép nhóm, xem điểm tương thích, nộp nhóm trước deadline.
  * **Bước 3: Đánh giá & Duyệt nhóm (Giảng viên)**
    * Giảng viên duyệt các nhóm đạt chuẩn để khóa bảo vệ nhóm.
  * **Bước 4: Tự động hoàn tất phân bổ (Hệ thống)**
    * Xếp tự động toàn bộ sinh viên còn lại, chốt danh sách chính thức cho lớp.
* **Gợi ý thiết kế & Hình ảnh:**
  * Sơ đồ thanh tiến trình ngang (Horizontal Process Stepper) với 4 mốc đánh số 1, 2, 3, 4 hiện đại.
* **Speaker Notes (45 giây):**
  > *"Toàn bộ hành trình của một lớp học diễn ra qua 4 bước mạch lạc: Bắt đầu từ khi giảng viên thiết lập quy chế, đến khoảng thời gian vàng để sinh viên tự tìm hiểu và ghép nhóm. Sau khi hết hạn, thầy cô duyệt các nhóm tốt, và cuối cùng chỉ cần một cú nhấp chuột, hệ thống sẽ tự động giải quyết tất cả những trường hợp còn lại để lớp học chính thức ổn định bước vào kỳ học."*

---

### SLIDE 07: SINH VIÊN TỰ LẬP NHÓM & GIẢNG VIÊN DUYỆT NHÓM

* **Tiêu đề slide:** **GIAI ĐOẠN 1: TỰ CHỦ CÓ ĐỊNH HƯỚNG**
* **Thông điệp chính:** Sinh viên dễ dàng tìm thấy đồng đội lý tưởng nhờ gợi ý tương thích thông minh.
* **Nội dung hiển thị trên slide:**
  * 🎯 **Điểm tương thích (Compatibility Score 10–100):** Tự động phát hiện nhu cầu của nhóm (thiếu SE, thiếu ngành) để gợi ý đúng người.
  * 📝 **Mô tả bản thân (Student Bio):** Sinh viên chia sẻ thế mạnh, kỹ năng để tăng cơ hội tìm nhóm.
  * 🛡️ **Kiểm tra luật tức thì:** Nhóm chỉ có thể nộp duyệt khi đạt đủ 100% điều kiện của lớp.
  * ⚖️ **Quyền lực giảng viên:** Duyệt để **bảo vệ nhóm**; hoặc Từ chối kèm lý do phản hồi rõ ràng về email nhóm.
* **Gợi ý thiết kế & Hình ảnh:**
  * Ảnh chụp màn hình giao diện Sinh viên chọn nhóm với thẻ gợi ý Điểm tương thích 95% nổi bật.
* **Speaker Notes (60 giây):**
  > *"Ở màn hình sinh viên, các bạn không còn phải đi rải tin nhắn khắp nơi để tìm đồng đội. Hệ thống sẽ tính toán Điểm tương thích dựa trên quy chế lớp: ví dụ nhóm kinh doanh đang thiếu bạn lập trình, hệ thống sẽ đẩy các bạn SE lên đầu kèm lý do rất rõ ràng. Khi trưởng nhóm nộp duyệt, giảng viên xem xét và duyệt nhóm. Nhóm được duyệt sẽ được gắn nhãn bảo vệ, giúp các bạn an tâm tuyệt đối rằng cơ cấu nhóm mình sẽ không bị xáo trộn."*

---

### SLIDE 08: LINH HOẠT CAN THIỆP: BẢNG SẮP NHÓM NÂNG CAO

* **Tiêu đề slide:** **GIAI ĐOẠN 2: ĐIỀU CHỈNH TRỰC QUAN**
* **Thông điệp chính:** Giảng viên làm chủ lớp học bằng bảng kéo — thả thành viên dạng Kanban mượt mà.
* **Nội dung hiển thị trên slide:**
  * 📋 **Trực quan hóa dạng cột:** Mỗi nhóm là một cột, hiển thị rõ sĩ số và tình trạng thành viên.
  * 👥 **Khay sinh viên chưa có nhóm:** Dễ dàng tìm kiếm theo tên, mã số, lọc nhanh theo chuyên ngành.
  * 🖱️ **Kéo thả thông minh:**
    * Kéo sinh viên từ khay vào nhóm hoặc chuyển đổi trực tiếp giữa hai nhóm.
    * Kéo thả tạo nhóm mới nhanh chóng chỉ trong 1 thao tác.
  * 🔒 **Cơ chế an toàn:** Khóa nhóm đã duyệt để tránh kéo nhầm, tự động cảnh báo vi phạm quy chế.
* **Gợi ý thiết kế & Hình ảnh:**
  * Ảnh chụp màn hình thực tế của Bảng sắp nhóm nâng cao (`Advanced Board`), minh họa hành động kéo thả thẻ sinh viên giữa các cột nhóm.
* **Speaker Notes (45 giây):**
  > *"Đối với những tình huống giảng viên muốn chủ động điều chỉnh theo ý muốn, hệ thống cung cấp Bảng sắp nhóm nâng cao theo phong cách Kanban hiện đại. Thầy cô có thể kéo một bạn từ khay sinh viên chưa có nhóm thả vào nhóm đang thiếu, hoặc đổi chỗ giữa hai nhóm vô cùng dễ dàng. Mọi thao tác đều được kiểm tra tính hợp lệ tức thời, giúp giảng viên xử lý các tình huống đặc biệt nhanh gấp 10 lần so với việc cắt dán trên Excel."*

---

### SLIDE 09: TRÁI TIM SẢN PHẨM: PHÂN BỔ TỰ ĐỘNG THÔNG MINH

* **Tiêu đề slide:** **GIAI ĐOẠN 3: PHÂN BỔ TỰ ĐỘNG THÔNG MINH**
* **Thông điệp chính:** Giải thuật tối ưu hóa khách quan, cân bằng hoàn hảo và bảo vệ quyền lợi sinh viên.
* **Nội dung hiển thị trên slide:**
  * 🧮 **Tự động đề xuất số nhóm:** Tính toán khoảng số nhóm khả thi và đề xuất con số lý tưởng cho lớp.
  * ⚖️ **Cân bằng sĩ số tuyệt đối:** Đảm bảo độ lệch sĩ số giữa các nhóm trong toàn lớp **không quá 1 sinh viên**.
  * 🛡️ **Bảo vệ nhóm đã duyệt:** Tuyệt đối giữ nguyên cơ cấu và trưởng nhóm của các nhóm đã được phê duyệt.
  * 🔍 **Xem trước minh bạch (Preview):** Cung cấp Báo cáo Trước/Sau (Before/After), chỉ ghi dữ liệu thật khi bấm Áp dụng (Apply).
* **Gợi ý thiết kế & Hình ảnh:**
  * Sơ đồ khối trực quan: Dữ liệu đầu vào (Quy chế + Sinh viên lẻ) ➔ Hộp xử lý thông minh ➔ Kết quả (Các nhóm cân bằng, đạt chuẩn 100%).
* **Speaker Notes (60 giây):**
  > *"Và đây chính là tính năng đắt giá nhất của F-Group Making: Phân bổ tự động thông minh. Hệ thống tự động phân tích sĩ số lớp để đưa ra số lượng nhóm hợp lý nhất. Điểm đặc biệt là hệ thống tuân thủ nguyên tắc cân bằng nghiêm ngặt: không bao giờ có chuyện nhóm 4 người nhóm 6 người trong cùng một lớp, mà chênh lệch tối đa chỉ là 1 bạn. Thầy cô được quyền xem trước toàn bộ phương án, thử nhiều phương án ngẫu nhiên khác nhau trước khi đưa ra quyết định áp dụng chính thức."*

---

### SLIDE 10: TÌNH HUỐNG THỰC TẾ: LỚP HỌC 36 SINH VIÊN

* **Tiêu đề slide:** **TÌNH HUỐNG THỰC TẾ TRONG LỚP HỌC**
* **Thông điệp chính:** Giải quyết bài toán hóc búa nhất chỉ trong chưa đầy 10 giây.
* **Nội dung hiển thị trên slide:**
  * 📊 **Đầu vào lớp học:**
    * Sĩ số: **36 sinh viên** (thuộc 3 chuyên ngành: SE, Kinh doanh quốc tế, Thiết kế đồ họa).
    * Quy chế lớp: Mỗi nhóm **4 – 6 bạn**, tối thiểu **2 chuyên ngành**, có ít nhất **1 bạn SE**.
    * Thực tế sau deadline: 4 nhóm tự lập đã duyệt (18 bạn), còn lại **18 bạn chưa có nhóm** (trong đó có 2 bạn SE).
  * 🎯 **Hệ thống tự động giải quyết:**
    * Đề xuất mục tiêu: **6 nhóm** cho toàn lớp (mỗi nhóm đúng 6 bạn).
    * Bảo vệ nguyên vẹn 4 nhóm ban đầu.
    * Tự động lập thêm 2 nhóm mới từ 18 bạn còn lại, chia đều mỗi nhóm mới 1 bạn SE và đảm bảo đa ngành.
    * **Kết quả:** 100% sinh viên có nhóm, đạt chuẩn quy chế, lớp sẵn sàng học tập ngay!
* **Gợi ý thiết kế & Hình ảnh:**
  * Bảng so sánh Trước (Before: 4 nhóm màu xanh + 1 đám mây sinh viên lẻ màu đỏ) và Sau (After: 6 nhóm xếp hàng ngay ngắn, xanh lá 100%).
* **Speaker Notes (60 giây):**
  > *"Hãy nhìn vào một ví dụ thực tế: Lớp EXE101 có 36 sinh viên. Khi hết hạn tạo nhóm, có 4 nhóm tự tạo hợp lệ đã được thầy cô duyệt với 18 bạn, còn lại 18 bạn chưa có nhóm đang rất hoang mang. Nếu làm tay, thầy cô sẽ mất cả tiếng đồng hồ để chia. Với F-Group Making, hệ thống tính toán ngay: cả lớp nên có 6 nhóm, mỗi nhóm đúng 6 bạn. 4 nhóm cũ được giữ nguyên, 18 bạn còn lại được tự động gom thành 2 nhóm mới, chia đều 2 bạn SE và đáp ứng đủ đa ngành. Tất cả diễn ra chỉ trong vài giây!"*

---

### SLIDE 11: BÁO CÁO TIẾN ĐỘ & ĐỘ HOÀN THIỆN MVP

* **Tiêu đề slide:** **BÁO CÁO KẾT QUẢ TRIỂN KHAI MVP**
* **Thông điệp chính:** Sản phẩm được xây dựng bài bản, kiến trúc vững chắc, kiểm thử nghiêm ngặt.
* **Nội dung hiển thị trên slide:**
  * 💻 **Công nghệ nền tảng:**
    * Frontend: React, TypeScript, Ant Design, Vite (Giao diện chuẩn hiện đại).
    * Backend: Spring Boot 3, Java 21, MySQL, Redis, STOMP WebSocket.
  * 📈 **Chất lượng kiểm thử mã nguồn:**
    * **Backend:** 384 bài kiểm thử tự động (Unit & Integration Tests) đạt 100% tỷ lệ thành công.
    * **Frontend:** 357 bài kiểm thử giao diện & luồng người dùng đạt 100% pass.
  * 🔍 **Trạng thái thực tế:** Sẵn sàng cho việc chạy thử nghiệm thực tế tại các lớp học kỳ tới.
* **Gợi ý thiết kế & Hình ảnh:**
  * Biểu đồ tròn tỷ lệ kiểm thử thành công (100% Pass), logo công nghệ React + Spring Boot sắc nét.
* **Speaker Notes (45 giây):**
  > *"Để có được trải nghiệm mượt mà này, nhóm đã xây dựng hệ thống trên nền tảng Spring Boot và React mới nhất. Toàn bộ mã nguồn đã vượt qua hơn 700 bài kiểm thử tự động ở cả phía máy chủ lẫn giao diện người dùng. Chúng em không dừng lại ở mức bản vẽ giao diện, mà mọi logic từ kiểm tra quy định, tính điểm đến bảo vệ giao dịch phân bổ đều đã được hiện thực hóa bằng mã nguồn thực tế."*

---

### SLIDE 12: GIÁ TRỊ MANG LẠI & HƯỚNG ĐI TƯƠNG LAI

* **Tiêu đề slide:** **GIÁ TRỊ TẠO RA & ĐỊNH HƯỚNG TƯƠNG LAI**
* **Thông điệp chính:** Tiết kiệm thời gian, nâng cao chất lượng đào tạo và mở rộng ứng dụng toàn trường.
* **Nội dung hiển thị trên slide:**
  * 🚀 **Giá trị mang lại cho Nhà trường:**
    * **Tiết kiệm 95% thời gian** phân nhóm đầu kỳ cho giảng viên và bộ môn.
    * **Minh bạch 100%:** Loại bỏ hoàn toàn cảm giác thiên vị, xếp nhóm cảm tính.
    * **Nâng cao chất lượng đề tài:** Đảm bảo nhóm nào cũng đủ năng lực đa ngành và nhân sự kỹ thuật.
  * 🔮 **Hướng phát triển tiếp theo:**
    * Tính năng Hoàn tác phân nhóm (Undo Allocation).
    * Tích hợp sâu hơn vào Cổng thông tin đào tạo (FAP / Flm) của Đại học FPT.
    * Thuật toán phân bổ nâng cao dựa trên lịch rảnh và tính cách làm việc nhóm.
* **Gợi ý thiết kế & Hình ảnh:**
  * 3 biểu tượng đòn bẩy giá trị: Đồng hồ tiết kiệm thời gian, Cán cân công bằng, Mũ cử nhân giáo dục. Lời cảm ơn trang trọng ở cuối slide.
* **Speaker Notes (45 giây):**
  > *"F-Group Making không chỉ là một bài tập môn EXE101, mà là một sản phẩm có tính ứng dụng thực tiễn cao cho Đại học FPT. Hệ thống giúp nhà trường tiết kiệm hàng trăm giờ lao động thủ công mỗi kỳ, mang lại sự công bằng và hứng khởi cho sinh viên ngay từ ngày đầu tiên bước vào môn học. Nhóm chúng em rất mong nhận được những góp ý quý báu từ thầy cô để tiếp tục hoàn thiện sản phẩm. Xin trân trọng cảm ơn!"*

---

## HƯỚNG DẪN THIẾT KẾ & THUYẾT TRÌNH CHO DIỄN GIẢ

1. **Phong cách trình bày:** Tự tin, nhiệt huyết, sử dụng ngôn ngữ đời thường, giàu hình ảnh ví von (như "mảnh ghép hoàn hảo", "luật chơi công bằng", "trợ lý đắc lực").
2. **Tương tác trực quan:** Khi nói về Slide 10 (Tình huống thực tế), hãy dừng lại vài giây để giám khảo kịp nhìn sự khác biệt giữa trước và sau phân bổ.
3. **Phối hợp Demo:** Slide 06 và Slide 09 là hai thời điểm vàng để người thuyết trình chuyển màn hình sang phần Live Demo thực tế theo Kịch bản đã chuẩn bị trong tài liệu `docs/20-exe101-mvp-presentation.md`.
