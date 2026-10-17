# Kế hoạch Thiết kế & Triển khai: Hệ thống Gợi ý Nhóm Thông minh & Mô tả Bản thân Sinh viên

> Tài liệu này đặc tả chi tiết kiến trúc dữ liệu, thuật toán gợi ý (matching algorithm), thiết kế giao diện (UI/UX hover popover & suggestions), và lộ trình triển khai chức năng **Gợi ý thành viên cho nhóm**, **Gợi ý nhóm cho sinh viên**, cùng tính năng **Mô tả bản thân (Self-Description / Bio)** cho sinh viên.

---

## 1. Mục tiêu & Luồng Nghiệp vụ (Business Requirements)

### 1.1. Tính năng Mô tả bản thân (Student Self-Description / Bio)
1. **Quản lý mô tả cá nhân:**
   - Mỗi sinh viên khi vào trang Chọn nhóm (`/student/groups/select` hoặc Dashboard) có thể viết một đoạn mô tả ngắn về bản thân:
     - Thế mạnh kỹ năng (Frontend, Backend, Design, BA, AI, Database,...).
     - Định hướng vai trò mong muốn (Leader, Member, Researcher,...).
     - Thời gian làm việc, phong cách làm việc, thông tin liên lạc (Zalo/Discord/Phone nếu muốn).
   - Bản thân sinh viên có quyền: **Thêm mới**, **Chỉnh sửa (Edit)**, và **Xóa (Delete/Clear)** mô tả bất kỳ lúc nào.
2. **Hiển thị tương tác Hover (Hover Popover / Card):**
   - Khi sinh viên khác, trưởng nhóm hoặc giảng viên rê chuột (**Hover**) vào:
     - Tên/Avatar của sinh viên trong danh sách "Sinh viên chưa có nhóm" (Drawer/List).
     - Danh sách thành viên trong thẻ nhóm (`GroupCard`, `MyGroupCard`).
     - Danh sách thành viên gợi ý.
   - Sẽ lập tức hiển thị một **Popover Card** sang trọng với:
     - Avatar + Tên đầy đủ + Mã số sinh viên (MSSV) + Mã sinh viên.
     - Badge chuyên ngành (SE, GD, IA, IB,...) nổi bật.
     - Khung trích dẫn mô tả bản thân (Bio). Nếu chưa viết mô tả, hiển thị placeholder nhẹ nhàng: *"Chưa có mô tả bản thân"*.

---

### 1.2. Tính năng Gợi ý Sinh viên cho Nhóm chưa đủ thành viên (Group -> Candidate Students)
1. **Điều kiện kích hoạt:**
   - Nhóm đang ở trạng thái `DRAFT` (hoặc Giảng viên đang phân công nhóm).
   - Nhóm chưa đủ thành viên tối đa (`members.size() < maxMembers`).
2. **Logic Phân tích & Đề xuất Thông minh (Matching Criteria):**
   - **Ưu tiên 1 - Bù đắp quy tắc bắt buộc (Hard Rules):**
     - Nhóm thiếu điều kiện `MIN_SE_MEMBERS_PER_GROUP` (ví dụ: cần ít nhất 1 SE mà nhóm chưa có) -> Hệ thống lập tức đẩy các sinh viên ngành SE chưa có nhóm lên đầu danh sách đề xuất với nhãn: **"Khắc phục thiếu SE"**.
   - **Ưu tiên 2 - Tăng độ đa dạng chuyên ngành (Diversity Rules):**
     - Nhóm chưa đạt `MIN_MAJORS_PER_GROUP` -> Ưu tiên đề xuất sinh viên có chuyên ngành khác với tất cả các thành viên hiện tại trong nhóm.
   - **Ưu tiên 3 - Không vi phạm trần tối đa:**
     - Loại bỏ hoặc cảnh báo những sinh viên mà nếu thêm vào sẽ khiến nhóm vi phạm `MAX_MAJORS_PER_GROUP` hoặc `MAX_MEMBERS_PER_GROUP`.
   - **Ưu tiên 4 - Độ tích cực & Kỹ năng:**
     - Sinh viên đã có mô tả bản thân (Bio) rõ ràng sẽ được cộng thêm điểm ưu tiên đề xuất (Match Score cao hơn).
3. **Trải nghiệm phía Trưởng nhóm / Giảng viên:**
   - Ngay trên thẻ nhóm của mình (`MyGroupCard` hoặc không gian giảng viên `LecturerGroupWorkspacePage`), xuất hiện nút/tab **"Gợi ý thành viên" (Recommended Members)**.
   - Mỗi ứng viên gợi ý hiển thị: Tỷ lệ phù hợp (Match %), Lý do gợi ý cụ thể (ví dụ: *"Bổ sung ngành SE còn thiếu"*, *"Chuyên ngành Thiết kế giúp nhóm đa dạng"*), nút hover xem Bio, và nút "Mời vào nhóm" / "Kéo vào nhóm".

---

### 1.3. Tính năng Gợi ý Nhóm cho Sinh viên chưa có nhóm (Unassigned Student -> Eligible Groups)
1. **Điều kiện kích hoạt:**
   - Sinh viên chưa gia nhập bất kỳ nhóm nào trong đợt deadline của lớp học.
2. **Logic Đề xuất Nhóm phù hợp:**
   - Lọc tất cả các nhóm `DRAFT` trong lớp:
     - Còn vị trí trống (`currentMembers < maxMembers`).
     - Việc sinh viên tham gia nhóm **KHÔNG** làm vi phạm quy tắc lớp (không vượt trần `MAX_MAJORS_PER_GROUP`).
   - Sắp xếp độ ưu tiên:
     - Nhóm nào đang **rất cần chuyên ngành của sinh viên này** (ví dụ sinh viên là SE và nhóm đang thiếu SE; hoặc nhóm đang thiếu ngành để đủ `MIN_MAJORS_PER_GROUP`) sẽ được chấm điểm **Best Match (95% - 100%)**.
     - Nhóm sắp đủ người (`currentMembers` tiệm cận `minMembers`) được ưu tiên để nhóm nhanh chóng hoàn thiện nộp duyệt.
3. **Trải nghiệm phía Sinh viên:**
   - Tại trang chọn nhóm, xuất hiện bộ lọc/khung nổi bật: **"Nhóm được đề xuất cho bạn" (Recommended For You)**.
   - Nhóm đề xuất hiển thị nhãn nổi bật: *"Nhóm này đang cần chuyên ngành [Tên ngành] của bạn để hoàn tất điều kiện!"*, kèm nút "Gia nhập ngay".

---

## 2. Thiết kế Cơ sở dữ liệu (Database Schema)

Thêm trường `self_description` (VARCHAR(500)) vào bảng `students`:

```sql
-- Thêm cột mô tả bản thân vào bảng students
ALTER TABLE students 
ADD COLUMN self_description VARCHAR(500) NULL DEFAULT NULL 
COMMENT 'Mô tả ngắn của sinh viên khi tìm nhóm (kỹ năng, vai trò mong muốn, liên hệ)';
```

---

## 3. Thiết kế Backend API & Thuật toán Đề xuất

### 3.1. Các Endpoints REST API
| Phương thức | Endpoint | Vai trò | Mô tả |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/students/me/bio` | Student | Lấy thông tin mô tả bản thân hiện tại |
| `PUT` | `/api/students/me/bio` | Student | Cập nhật mô tả bản thân (`{ "bio": "..." }`) |
| `DELETE` | `/api/students/me/bio` | Student | Xóa mô tả bản thân |
| `GET` | `/api/groups/{groupId}/recommended-students` | Leader / Lecturer | Lấy danh sách gợi ý sinh viên phù hợp cho nhóm |
| `GET` | `/api/groups/workspace` | All | Trả về `selfDescription` trong `GroupMemberDTO` và thông tin đề xuất |

### 3.2. Thuật toán Tính điểm Phù hợp (Match Scoring Engine)
- **Gợi ý Sinh viên cho Nhóm ($S \rightarrow G$):**
  - **+40đ**: Nhóm thiếu SE mà SV là SE (`MIN_SE_MEMBERS_PER_GROUP`).
  - **+30đ**: SV mang chuyên ngành mới giúp nhóm đạt `MIN_MAJORS_PER_GROUP`.
  - **+20đ**: Nhóm chưa đủ `MIN_MEMBERS_PER_GROUP`.
  - **+10đ**: Sinh viên đã cập nhật Bio chi tiết.
  - **0đ (Loại trừ)**: Nhóm đã đủ `maxMembers` hoặc vi phạm `MAX_MAJORS_PER_GROUP`.
- **Gợi ý Nhóm cho Sinh viên ($G \rightarrow S$):**
  - Nhóm cần ngành của SV nhất và gần đủ người nhất -> Điểm match cao nhất, ghim lên đầu danh sách.

---

## 4. Thiết kế Giao diện Người dùng (Frontend UI/UX)
1. **Khung cập nhật Bio của Sinh viên:**
   - Banner trực quan tại đầu trang chọn nhóm & Widget Dashboard.
   - Nút "Thêm mô tả" / "Sửa" / "Xóa" với Modal có bộ đếm ký tự (0/500) và quick tags (`#Frontend`, `#Backend`, `#Tester`, `#DesignUIUX`).
2. **Popover Hover xem Bio:**
   - Sử dụng Ant Design `Popover` hiển thị mượt mà khi hover vào sinh viên ở bất kỳ đâu (Drawer, Member list, Suggestion card).
   - Hiển thị Avatar, Tên, MSSV, Badge chuyên ngành và trích dẫn Bio.
3. **Gợi ý thành viên trong thẻ nhóm (`MyGroupCard`):**
   - Mục "💡 Gợi ý thành viên phù hợp" cho Leader với điểm match % và lý do chi tiết.
4. **Gợi ý nhóm cho sinh viên chưa có nhóm:**
   - Tab "🌟 Đề xuất cho bạn" nổi bật trong `SelectGroupPage.tsx`.

---

## 5. Lộ trình Triển khai (Roadmap)
- [ ] **Giai đoạn 1**: Database migration thêm `self_description` & Backend API CRUD Bio sinh viên.
- [ ] **Giai đoạn 2**: `GroupRecommendationService` tính điểm đề xuất 2 chiều (SV -> Nhóm, Nhóm -> SV).
- [ ] **Giai đoạn 3**: UI Component cập nhật Bio + Tooltip/Popover khi hover sinh viên.
- [ ] **Giai đoạn 4**: UI Gợi ý thành viên cho Trưởng nhóm / Giảng viên + Gợi ý nhóm cho Sinh viên.
- [ ] **Giai đoạn 5**: Song ngữ VI/EN, Responsive Mobile/Tablet và Testing.
