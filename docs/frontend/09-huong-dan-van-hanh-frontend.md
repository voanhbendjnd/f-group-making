# 09 — Báo cáo triển khai và Hướng dẫn vận hành Frontend React

[Về mục lục](README.md)

Tài liệu này ghi nhận hiện trạng triển khai thực tế của ứng dụng **Frontend React** cho hệ thống F-Group Making, đồng bộ 100% với Backend Spring Boot.

---

## 1. Cấu trúc kiến trúc Frontend đã triển khai

Ứng dụng được khởi tạo tại thư mục `frontend/` ở gốc repository:
- **Build tool:** Vite 8.3
- **Framework & UI:** React 19 + TypeScript
- **Routing:** React Router DOM (Data Router)
- **Data & Cache:** TanStack React Query v5
- **HTTP Client:** Axios (tập trung với interceptor tự động đính kèm Bearer token, bóc tách `ResFormatResponse` và chuẩn hóa lỗi)
- **Form:** React Hook Form
- **Excel Preview:** SheetJS (`xlsx`) đọc và kiểm tra trước dữ liệu ở phía client
- **Icons & Micro-interactions:** Lucide React, Canvas Confetti
- **Testing:** Vitest + React Testing Library + `@testing-library/jest-dom`

### Cây thư mục thực tế (`frontend/src/`):

```text
src/
├── app/
│   ├── providers/
│   │   ├── AuthContext.tsx           # Quản lý phiên, đăng nhập, phân quyền role
│   │   ├── ToastContext.tsx          # Hệ thống toast thông báo người dùng
│   │   └── QueryProvider.tsx         # TanStack Query client cấu hình chung
│   └── router/
│       ├── ProtectedRoute.tsx        # Chặn truy cập khi chưa đăng nhập
│       ├── RoleRoute.tsx             # Chặn truy cập khi sai quyền (ADMIN vs STUDENT)
│       ├── PublicRoute.tsx           # Chuyển hướng người đã đăng nhập vào dashboard
│       └── routes.tsx                # Khai báo toàn bộ route ứng dụng
├── components/
│   ├── common/
│   │   ├── Button.tsx                # Button với loading spinner, variants, icons
│   │   ├── Input.tsx                 # Input form kèm toggle hiển thị mật khẩu
│   │   ├── Select.tsx                # Select input tùy biến
│   │   ├── Modal.tsx                 # Hộp thoại modal hỗ trợ phím Esc và backdrop
│   │   ├── ConfirmDialog.tsx         # Hộp thoại xác nhận thao tác quan trọng
│   │   ├── StatusBadge.tsx           # Huy hiệu trạng thái trực quan, có text & icon
│   │   ├── EmptyState.tsx            # Trạng thái rỗng kèm gợi ý thao tác
│   │   ├── ErrorState.tsx            # Trạng thái lỗi kèm nút thử lại
│   │   ├── LoadingSpinner.tsx        # Vòng xoay tiến trình mượt mà
│   │   ├── PageHeader.tsx            # Tiêu đề trang chuẩn, breadcrumb, nút hành động
│   │   └── Pagination.tsx            # Phân trang tương thích Spring Data 1-indexed
│   └── layout/
│       ├── AdminLayout.tsx           # Layout dành cho Quản trị viên
│       ├── StudentLayout.tsx         # Layout dành cho Sinh viên
│       ├── AuthLayout.tsx            # Layout căn giữa cho Login & Kích hoạt
│       ├── Sidebar.tsx               # Menu thanh bên với phân quyền và hồ sơ
│       └── TopNavbar.tsx             # Thanh điều hướng phía trên, nút đăng xuất
├── features/
│   ├── auth/
│   │   ├── api/authApi.ts            # Gọi POST /api/login
│   │   ├── components/LoginForm.tsx  # Form đăng nhập & lưu ý cấm đăng ký tự do
│   │   └── types.ts
│   ├── students/
│   │   ├── api/studentApi.ts         # GET /api/students, POST /api/activate...
│   │   ├── components/
│   │   │   ├── StudentFilterBar.tsx  # Tìm kiếm, lọc theo ngành, trạng thái, key
│   │   │   ├── StudentTable.tsx      # Bảng sinh viên, chọn checkbox, badge
│   │   │   ├── BulkActionToolbar.tsx # Thanh tác vụ chọn 1, nhiều, hoặc toàn bộ bộ lọc
│   │   │   ├── BatchActivationModal.tsx # Xác nhận gửi hàng loạt & báo cáo kết quả
│   │   │   └── SingleActivationModal.tsx # Gửi thư kích hoạt cho 1 sinh viên
│   │   └── types.ts
│   ├── import/
│   │   ├── api/importApi.ts          # Gọi POST /api/students/import (multipart)
│   │   ├── utils/excelParser.ts      # Đọc và kiểm tra Excel client-side
│   │   ├── components/
│   │   │   ├── FileDropzone.tsx      # Kéo thả tệp, kiểm tra .xlsx, nút tải mẫu
│   │   │   ├── ImportPreviewTable.tsx# Bảng xem trước dữ liệu & dòng hợp lệ/lỗi
│   │   │   ├── ImportErrorList.tsx   # Danh sách lỗi chi tiết theo dòng từ server
│   │   │   └── ImportSuccessSummary.tsx # Báo cáo kết quả nhập thành công
│   │   └── types.ts
│   └── activation/
│       ├── api/activationApi.ts      # GET verify key & POST hoàn tất kích hoạt
│       └── types.ts
├── pages/
│   ├── auth/LoginPage.tsx
│   ├── activation/ActivateAccountPage.tsx
│   ├── admin/
│   │   ├── AdminDashboardPage.tsx    # Bảng tổng quan số liệu thực tế từ API
│   │   ├── StudentListPage.tsx       # Quản lý danh sách sinh viên
│   │   └── StudentImportPage.tsx     # Nhập dữ liệu sinh viên từ Excel
│   ├── student/StudentDashboardPage.tsx
│   └── errors/
│       ├── NotFoundPage.tsx          # Lỗi 404
│       └── UnauthorizedPage.tsx      # Lỗi 403
├── services/api/
│   ├── client.ts                     # Axios client + interceptor unwrap & auth
│   ├── errorTranslator.ts            # Chuyển đổi mã lỗi kỹ thuật sang tiếng Việt thân thiện
│   └── types.ts
├── styles/
│   └── index.css                     # Design system CSS biến chuẩn, responsive
└── test/                             # Bộ kiểm thử đơn vị và tích hợp Vitest
```

---

## 2. Danh mục API Backend đã tích hợp đầy đủ

| Chức năng | Phương thức & URL | Payload / Params | Phản hồi Backend | Tích hợp Frontend |
|---|---|---|---|---|
| **Đăng nhập** | `POST /api/login` | `{ username, password }` | `ResLoginDTO` (`accessToken`, `user`) | `authApi.login` |
| **Danh sách sinh viên** | `GET /api/students` | `search`, `majorCode`, `activated`, `hasActivationKey`, `page`, `size` | `ResultPaginationDTO` | `studentApi.getStudents` |
| **Chi tiết sinh viên** | `GET /api/students/{userId}` | `userId` | `StudentDTO` | `studentApi.getStudentByUserId` |
| **Nhập Excel sinh viên** | `POST /api/students/import` | `MultipartFile file` | `ImportResultDTO` (`success`, `totalImported`, `errors`) | `importApi.importExcel` |
| **Gửi kích hoạt 1 SV** | `POST /api/activate` | `{ userId, email }` | `void` (200 OK) | `studentApi.sendSingleActivation` |
| **Gửi kích hoạt nhiều SV** | `POST /api/activate/mul` | `{ userIds: [1, 2, ...] }` | `BatchActivationResultDTO` (`totalRequested`, `totalProcessed`, `totalSkippedAlreadyActive`, `sentEmails`) | `studentApi.sendBatchActivation` |
| **Gửi kích hoạt toàn bộ theo bộ lọc** | `POST /api/students/activate/all` | `search`, `majorCode` | `BatchActivationResultDTO` | `studentApi.sendActivateAllMatching` |
| **Xác thực mã kích hoạt** | `GET /api/account/activate/verify` | `key` | `ActivationKeyVerifyDTO` (`valid`, `email`, `name`) | `activationApi.verifyKey` |
| **Thiết lập MK & Kích hoạt** | `POST /api/account/activate` | `{ key, password }` | `void` (204 No Content) | `activationApi.activateAccount` |

---

## 3. Các Flow nghiệp vụ bắt buộc

### Flow 1: KHÔNG CÓ PUBLIC REGISTER
- Tuyệt đối không có trang `/register`, không có nút "Tạo tài khoản" công khai.
- Sinh viên nhận thông tin tài khoản qua email kích hoạt do Admin gửi.
- Trang Login có thông báo hướng dẫn rõ ràng: *"Chưa có tài khoản? Tài khoản sinh viên do Quản trị viên cấp qua thư kích hoạt. Hệ thống không cho phép tự đăng ký."*

### Flow 2: Nhập sinh viên từ Excel
1. Admin truy cập `/admin/students/import`.
2. Kéo thả tệp `.xlsx` hoặc bấm chọn tệp (có nút "Tải tệp mẫu" `sample-students.xlsx`).
3. Client đọc trước sheet 1 (bắt đầu từ dòng 3): kiểm tra mã sinh viên, email, mã ngành, mã thành viên.
4. Hiển thị bảng Xem trước dữ liệu: số dòng hợp lệ và các dòng cảnh báo lỗi.
5. Admin bấm "Xác nhận nhập N sinh viên vào hệ thống" -> Gọi `POST /api/students/import`.
6. Nếu Backend trả `success === true`: Hiển thị trang chúc mừng, số sinh viên đã tạo, và nút chuyển nhanh đến Danh sách sinh viên.
7. Nếu Backend trả `success === false`: Hiển thị danh sách chi tiết các dòng Excel bị lỗi (được dịch sang tiếng Việt: Tên trường, Dòng lỗi, Lý do cần chỉnh sửa).

### Flow 3: Quản lý sinh viên & Gửi email kích hoạt
1. Admin truy cập `/admin/students`.
2. Tìm kiếm theo mã SV, tên, email; lọc theo ngành, trạng thái tài khoản ("Đã kích hoạt" / "Chờ kích hoạt"), trạng thái thư mời ("Đã gửi" / "Chưa gửi").
3. Hỗ trợ 3 hình thức chọn:
   - Chọn 1 sinh viên -> Bấm "Gửi kích hoạt" tại cột thao tác.
   - Chọn nhiều sinh viên trên trang qua checkbox.
   - Chọn **toàn bộ sinh viên phù hợp với bộ lọc** (ví dụ: đã chọn 50/trang -> bấm "Chọn toàn bộ 326 sinh viên theo bộ lọc hiện tại").
4. **Loại trừ tài khoản đã kích hoạt:**
   - Sinh viên có `activated === true` được gắn huy hiệu xanh "Đã kích hoạt" và hiển thị ghi chú "Không cần gửi lại".
   - Trong modal xác nhận gửi hàng loạt, hệ thống tự động trừ đi số tài khoản đã kích hoạt và chỉ gửi thư cho số tài khoản đủ điều kiện (`activated === false`).
5. **Theo dõi kết quả:**
   - Sau khi gửi hàng loạt, hiển thị hộp thoại kết quả chi tiết: Tổng yêu cầu, Số email gửi thành công, Số tài khoản bỏ qua, và danh sách các địa chỉ email đã được gửi.

### Flow 4: Sinh viên nhận email & Kích hoạt tài khoản
1. Sinh viên mở đường dẫn trong email (hỗ trợ cả `/account/activate?key=...` và `/activate?key=...` hoặc `?token=...`).
2. Màn hình tự động gọi `GET /api/account/activate/verify?key=...`.
3. Nếu liên kết hết hạn hoặc không hợp lệ: Hiển thị thông báo thân thiện và nút "Về trang đăng nhập".
4. Nếu hợp lệ: Hiện lời chào *"Xin chào, [Tên sinh viên]!"*, form đặt mật khẩu mới với checklist kiểm tra thời gian thực (tối thiểu 4 ký tự, khớp xác nhận).
5. Sinh viên bấm "Hoàn tất kích hoạt tài khoản" -> Gọi `POST /api/account/activate`.
6. Backend mã hóa mật khẩu, cập nhật `activated = true`, gán `ROLE_STUDENT` và vô hiệu hóa key.
7. Hiệu ứng ăn mừng (confetti) hiển thị cùng thông báo thành công và nút chuyển sang trang Đăng nhập.

---

## 4. Hướng dẫn chạy và Kiểm thử

Tại thư mục `frontend/`:

### Chạy môi trường phát triển:
```bash
npm run dev
```
Truy cập: `http://localhost:3000` (được cấu hình proxy tự động sang Backend Spring Boot tại `http://localhost:8080`).

### Chạy kiểm thử đơn vị:
```bash
npm test
```
Toàn bộ 14 bài kiểm thử trong 4 bộ test (`auth`, `errorTranslator`, `statusBadge`, `excelParser`) đã vượt qua 100%.

### Build sản phẩm production:
```bash
npm run build
```
Biên dịch thành công với 0 lỗi TypeScript, gói sản phẩm được tối ưu trong thư mục `dist/`.
