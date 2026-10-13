# 10 — Hỗ trợ đa ngôn ngữ (i18n) — Tiếng Việt và Tiếng Anh

> Tài liệu này đặc tả kiến trúc, luồng hoạt động, cấu trúc từ điển và quy tắc triển khai tính năng đa ngôn ngữ (Internationalization - i18n) cho hệ thống **F-Group Making**.

---

## 1. Mục tiêu và Quyết định Thiết kế

1. **Hỗ trợ 2 ngôn ngữ song hành:**
   - **Tiếng Việt (`vi`):** Ngôn ngữ mặc định của toàn hệ thống, tối ưu cho sinh viên và cán bộ giảng viên FPT.
   - **Tiếng Anh (`en`):** Ngôn ngữ quốc tế cho sinh viên quốc tế hoặc người dùng có thói quen sử dụng tiếng Anh.
2. **Một ứng dụng duy nhất (Single Frontend App):**
   - Không chia 2 bản build hay 2 domain khác nhau.
   - Chuyển đổi ngôn ngữ tức thì tại runtime qua React State mà **không cần reload lại trang** (Zero reload).
3. **Lưu trữ và duy trì phiên chọn ngôn ngữ (Persistence):**
   - Lưu lựa chọn vào `localStorage` với key: `f_group_lang`.
   - Tự động đồng bộ thuộc tính `<html lang="...">` trên tài liệu DOM để phục vụ Accessibility và SEO.
4. **Đồng bộ với Backend Spring Boot:**
   - Tự động gắn header HTTP `Accept-Language: vi` (hoặc `en`) trong mọi request gửi từ `apiClient` Axios.
   - Backend Spring Boot đọc header này để trả về thông điệp phù hợp từ các bundle `messages_vi.properties` và `messages_en.properties`.
   - Tầng dịch lỗi frontend (`errorTranslator.ts`) tự động bản địa hóa các mã lỗi kỹ thuật của backend thành thông báo thân thiện tương ứng.

---

## 2. Kiến trúc giải pháp (Architecture)

```
jumpln-app-frontend-react-vite/
├── src/
│   ├── locales/
│   │   ├── i18n.ts            # Cấu hình i18next & hook đồng bộ localStorage
│   │   ├── vi.json            # Từ điển Tiếng Việt chuẩn
│   │   └── en.json            # Từ điển Tiếng Anh chuẩn
│   ├── components/
│   │   ├── common/
│   │   │   └── LanguageSwitcher.tsx  # Component nút chuyển đổi ngôn ngữ
│   │   └── layout/
│   │       ├── AuthLayout.tsx        # Tích hợp LanguageSwitcher góc trên
│   │       ├── TopNavbar.tsx         # Tích hợp LanguageSwitcher thanh bar
│   │       └── Sidebar.tsx           # Dịch các mục menu điều hướng
│   ├── services/
│   │   └── api/
│   │       ├── client.ts             # Axios interceptor gắn Accept-Language
│   │       └── errorTranslator.ts    # Dịch mã lỗi theo ngôn ngữ hiện hành
│   └── main.tsx                      # Khởi tạo i18n trước khi render App
```

---

## 3. Cấu trúc từ điển (Dictionary Namespaces)

Mọi chuỗi văn bản được phân nhóm có hệ thống trong `vi.json` và `en.json`:

| Namespace | Mục đích sử dụng | Ví dụ khóa |
| :--- | :--- | :--- |
| `common` | Các nút, nhãn và cụm từ dùng chung toàn hệ sinh thái | `common.save`, `common.logout`, `common.systemBrand`, `common.copyright` |
| `auth` | Biểu mẫu đăng nhập, validation, ghi chú tài khoản | `auth.loginTitle`, `auth.emailRequired`, `auth.noAccountTitle` |
| `forgotPassword` | Luồng yêu cầu đặt lại mật khẩu, thông báo email | `forgotPassword.title`, `forgotPassword.receivedDesc` |
| `resetPassword` | Xác thực liên kết token, đặt mật khẩu mới, kiểm tra độ dài | `resetPassword.checkingLink`, `resetPassword.successTitle` |
| `activation` | Xác thực liên kết kích hoạt, đặt mật khẩu lần đầu | `activation.title`, `activation.successTitle`, `activation.min4Chars` |
| `nav` | Tiêu đề phân hệ, phụ đề học kỳ, nhãn aria trợ năng | `nav.adminSubtitle`, `nav.dashboard`, `nav.students` |
| `sidebar` | Nhóm danh mục sidebar, quy trình 3 bước chuẩn | `sidebar.workflowTitle`, `sidebar.adminSection` |
| `errors` | Bản dịch thông điệp lỗi nghiệp vụ và mã HTTP | `errors.invalidActivationKey`, `errors.badCredentials`, `errors.networkError` |
| `classes` | Danh sách/chi tiết lớp, bộ lọc, bảng, trạng thái và nhãn trợ năng | `classes.title`, `classes.detailTitle`, `classes.searchLabel` |
| `classAssignment` | Chọn/đổi giảng viên, lưu phân công và đối soát kết quả | `classAssignment.choose`, `classAssignment.change`, `classAssignment.save` |

---

## 4. Thành phần giao diện: `LanguageSwitcher`

Component `LanguageSwitcher` (`src/components/common/LanguageSwitcher.tsx`) được thiết kế dạng **Segmented Pill Toggle**:
- Hiển thị trực quan cờ biểu tượng và mã ngôn ngữ: `🇻🇳 VI` | `🇬🇧 EN`.
- Trạng thái đang kích hoạt có màu nổi bật `var(--color-primary)`, chữ tương phản cao, đổ bóng nhẹ.
- Tích hợp chuẩn Accessibility:
  - `role="group"`, `aria-label="Ngôn ngữ"`
  - Mỗi nút có `aria-pressed="true|false"` và `title` trợ năng.
- Tự động ghi nhận sự kiện chuyển đổi, cập nhật `i18n.changeLanguage(newLang)` và lưu `localStorage`.

---

## 5. Quy tắc bắt buộc cho Lập trình viên và AI Agent

Tuân thủ nghiêm ngặt các quy tắc sau khi phát triển tính năng mới:

### 1. Tuyệt đối không hardcode chuỗi text hiển thị thô trong JSX
```tsx
// ❌ SAI: Hardcode tiếng Việt hoặc tiếng Anh trực tiếp
<button type="submit">Đăng nhập</button>

// ✅ ĐÚNG: Sử dụng useTranslation hook
const { t } = useTranslation();
<Button type="submit">{t('auth.loginButton')}</Button>
```

### 2. Luôn đồng bộ cả 2 tệp từ điển `vi.json` và `en.json`
- Khi tạo khóa mới trong `vi.json`, **phải lập tức** bổ sung khóa tương ứng trong `en.json`.
- Tên khóa đặt theo quy ước camelCase, ngắn gọn, phản ánh đúng ngữ nghĩa nghiệp vụ.

### 3. Xử lý đoạn văn bản có biến hoặc định dạng lồng nhau
- Với chuỗi có tham số: dùng `{{variable}}`:
  ```json
  "receivedDesc": "Liên kết đã được gửi tới email {{email}}."
  ```
  ```tsx
  t('forgotPassword.receivedDesc', { email: 'student@fpt.edu.vn' })
  ```
- Với chuỗi có in đậm, liên kết lồng thẻ HTML: sử dụng `<Trans>` của `react-i18next`:
  ```tsx
  <Trans
    i18nKey="activation.successDesc"
    values={{ name: user.name }}
    components={{ strong: <strong /> }}
  />
  ```

### 4. Xử lý thông báo lỗi từ Backend
- Luôn cho lỗi đi qua `translateErrorMessage(error)` trong `errorTranslator.ts`.
- Không hiển thị nguyên văn exception kỹ thuật (như `ConstraintViolationException`, `SQLException`) lên giao diện người dùng.
