# 05 — Phối hợp API và quản lý trạng thái

> Cập nhật 12/10/2026: query/mutation của Rule theo lớp đã triển khai, gồm version, chống gửi lặp, không retry ghi và đọc lại chủ động khi kết quả chưa xác nhận. Xem [11](11-giang-vien-va-quy-dinh-nhom.md); các nhận định về chỉ có bốn POST bên dưới thuộc bản rà soát cũ.

[Về mục lục](README.md) · [Hợp đồng hiện có](01-tinh-nang-va-hop-dong-api.md)

## 1. Mục tiêu và giới hạn

Frontend cần giảm thao tác và request không cần thiết, đồng thời bảo đảm người dùng hiểu đúng kết quả. Hiện chỉ có bốn POST nghiệp vụ; chưa có API GET danh sách, `/me`, refresh, logout, job hoặc lịch sử. Vì vậy phần phối hợp hiện tại tập trung vào dùng lại kết quả login, kiểm tra tệp cục bộ và gửi mutation có kiểm soát.

Quy tắc query/cache cho danh sách được ghi để dùng khi backend bổ sung, không phải chỉ dẫn gọi những endpoint chưa có.

## 2. Một lớp HTTP chung

HTTP client chịu trách nhiệm base URL, cấu hình request, Bearer đúng nơi, timeout, hủy chờ, đọc body, unwrap và chuẩn hóa lỗi. Không quyết định nội dung toast, chuyển bước wizard hoặc thông báo thành công nghiệp vụ.

| Loại request | Header/body | Xác thực |
| --- | --- | --- |
| Login | JSON `username`, `password` | Không gắn access token cũ; dùng credentials theo cấu hình cookie đã xác minh |
| Yêu cầu email đơn | JSON `email` | Bearer có `ROLE_ADMIN` |
| Yêu cầu email hàng loạt | JSON `userIds` | Bearer có `ROLE_ADMIN`; UI chưa bật do thiếu nguồn danh sách |
| Nhập Excel | FormData field `file` | Bearer token hợp lệ; browser tạo boundary |

Không mặc định gắn token vào mọi URL hoặc domain. Không gửi `Bearer undefined`/`Bearer null`. Chỉ gửi tới backend tin cậy đã cấu hình. Hai activation endpoint đều là thao tác quản trị và phải có token admin hợp lệ.

Trình tự đọc response:

1. Ghi nhận HTTP status và loại nội dung.
2. Body rỗng được xử lý theo contract endpoint; chỉ API void cho phép kết quả không có data.
3. JSON thành công cần được kiểm tra envelope/schema tương ứng; field dư có thể bỏ qua, field bắt buộc thiếu không giả định là hợp lệ.
4. HTTP lỗi được chuẩn hóa từ Problem, entry point hoặc fallback. Không parse HTML như JSON rồi hiển thị lỗi kỹ thuật cho người dùng.
5. Mapper nghiệp vụ phân biệt các nhánh: login thành công, yêu cầu email được tiếp nhận, import thành công, import bị từ chối vì dữ liệu.

Nếu nhận 2xx cho import nhưng thiếu `success` hoặc response bị cắt, đánh dấu **chưa xác nhận kết quả**; không đổi thành thành công hoặc tự gửi lại. Nếu login thiếu token/user cần thiết, không tạo phiên nửa vời.

## 3. Phiên đăng nhập phù hợp backend hiện có

### 3.1. Chính sách tạm thời

Đề xuất giữ access token và user tối thiểu trong memory, đồng bộ một bản phiên có version trong **sessionStorage** để refresh trang trong cùng tab không bắt đăng nhập lại ngay. Đây là thỏa hiệp UX khi chưa có refresh hoặc `/me`, không phải phiên server hoàn chỉnh. Không lưu password, refresh token, tệp Excel hay danh sách sinh viên tại đây.

JavaScript có thể đọc sessionStorage; đây không phải kho HttpOnly và không loại bỏ rủi ro XSS. Chỉ lưu phần tối thiểu, không render HTML không tin cậy, không ghi token vào log; trước khi phát hành rộng cần ưu tiên hợp đồng phiên hoàn chỉnh phía backend. Nếu tổ chức yêu cầu token chỉ trong memory, đổi ADR-05 và công bố hệ quả phải đăng nhập lại sau reload.

Khi khởi động:

- Đọc phiên có kiểm tra schema; nếu storage bị chặn, tiếp tục dùng memory và giải thích khi cần.
- Kiểm tra thời hạn `exp` để tránh gửi token đã hết hạn rõ ràng; đây chỉ là kiểm tra UX, không phải xác minh chữ ký hoặc quyền ở frontend.
- Không coi dữ liệu user/role trong storage là bằng chứng server đã xác thực. Backend quyết định quyền cho từng request.
- Nếu phiên thiếu/hỏng/hết hạn, xóa phiên và về login. Không gọi `/refresh` hoặc `/api/me` chưa tồn tại.
- F5 giữ được phiên nếu storage cho phép, nhưng **không giữ được File/preview**. Nếu không có bản nháp trong memory, yêu cầu chọn lại tệp; không hiển thị kết quả cũ như dữ liệu server.

### 3.2. 401 và 403

| Trường hợp | Hành vi |
| --- | --- |
| 401 khi login | Lỗi form; không mở dialog đăng nhập trên trang login |
| 401 ở request bảo vệ | Đánh dấu phiên hết hiệu lực, ngừng request phụ, mở một luồng đăng nhập lại |
| Nhiều 401 đồng thời | Một dialog/thông báo; không tạo chuỗi redirect/toast |
| 403 khi nhập | Giải thích thiếu quyền; không tự refresh token hoặc đăng nhập lại vô hạn |
| 403 API email đơn với mã tương ứng | Thông báo tài khoản đã kích hoạt; ánh xạ theo ngữ cảnh API-02 |

Sau đăng nhập lại cùng tài khoản: phục hồi bản nháp import trong memory, quay về kiểm tra, yêu cầu người dùng bấm gửi. Nếu đổi sang tài khoản khác: hủy phục hồi dữ liệu riêng của tài khoản trước, xóa cache và tệp cũ. Không đưa dữ liệu sinh viên của phiên cũ cho user mới.

### 3.3. Đăng xuất

Xóa token/user trong memory và sessionStorage, xóa cache chứa dữ liệu riêng, đóng workflow và bỏ File/preview. Nếu có request đang gửi, phải giải thích chưa biết kết quả trước khi rời; không giả định hủy mạng hủy giao dịch.

Chưa có logout API nên frontend **không thu hồi access token/refresh token server và không thể xóa cookie HttpOnly bằng JavaScript**. Không hứa đăng xuất tất cả thiết bị. Khi backend có logout/refresh, phải cập nhật toàn bộ chính sách này, gồm CSRF/cookie nếu cơ chế xác thực thay đổi.

Có thể dùng tín hiệu đồng bộ đăng xuất giữa tab khi triển khai; không chia sẻ token qua kênh thông báo. Session manager hiện thay ID mỗi login nhưng có cache, nên không suy luận lỗi session chắc chắn do thiết bị khác.

## 4. Mutation: không gửi lặp hoặc lạc ngữ cảnh

Thiết lập rõ `retry: 0` cho cả bốn POST. Tài liệu TanStack nêu mutation không retry mặc định; dự án vẫn cấu hình tường minh và không cho cơ chế offline tự phát lại các tác vụ này. [Mutations](https://tanstack.com/query/latest/docs/framework/react/guides/mutations).

| Tác vụ | Tự retry | Tự resume khi mạng trở lại | Optimistic success |
| --- | --- | --- | --- |
| Login | Không | Không | Không |
| Gửi email đơn | Không | Không | Không |
| Gửi email hàng loạt | Không | Không | Không |
| Nhập sinh viên | Không | Không | Không |

- Khóa submit từ lúc bắt đầu xử lý sự kiện, không chờ một frame render mới; Enter và click dùng cùng cơ chế.
- Một workflow chỉ có một mutation ghi đang chờ. Chống bấm lặp ở UI không thay thế idempotency server và không bảo vệ giữa nhiều tab/người dùng.
- Chưa có contract `Idempotency-Key`. Không tự thêm header rồi coi server đã chống trùng; CORS hiện cũng chưa cho phép header này.
- Không persist mutation queue; không dùng service worker để xếp hàng import/mail rồi tự gửi khi online.
- Không tự retry POST ở HTTP interceptor, reverse proxy hoặc bộ quản lý dữ liệu frontend.
- Có định danh thao tác cục bộ và phiên sở hữu để bỏ qua response muộn thuộc tệp/tài khoản cũ. Định danh này chỉ phục vụ UI, không phải job ID server.
- Tệp đổi trước khi gửi làm hủy kết quả parse cũ. Trong khi đang gửi thì khóa đổi tệp. Không cho response cũ ghi đè preview mới.

Timeout là chính sách UI/mạng cần cấu hình và đo cùng môi trường. Điểm khởi đầu đề xuất: login/yêu cầu mail khoảng 30 giây, import khoảng 120 giây; không coi đây là SLA hoặc giới hạn server. Trong lúc chờ dài phải có phản hồi hữu ích. Hủy chờ bằng AbortController không chứng minh server đã dừng xử lý.

## 5. Các luồng phối hợp hiện tại

### 5.1. Login → trang bắt đầu → nhập

```mermaid
sequenceDiagram
    actor U as Người dùng
    participant UI as React UI
    participant API as Spring API
    U->>UI: Nhập email và mật khẩu
    UI->>API: POST /api/login
    API-->>UI: accessToken và user trong envelope
    UI->>UI: Lưu phiên tối thiểu; điều hướng theo quyền
    U->>UI: Chọn Excel và kiểm tra
    UI->>UI: Đọc tệp, kiểm tra sơ bộ, hiển thị preview
    U->>UI: Bấm Nhập N sinh viên
    UI->>API: POST /api/students/import với file và Bearer
    API-->>UI: success, totalImported, errors
    UI->>UI: Hiển thị đúng kết quả nghiệp vụ
```

Số request nghiệp vụ tối thiểu: 1 login và 1 import. Chọn tệp, preview, đổi trang bảng lỗi, lọc lỗi và tải danh sách lỗi không phát sinh request backend. Không gọi lại login để lấy tên người dùng; không polling sau import vì chưa có API trạng thái.

### 5.2. Login cần hỗ trợ kích hoạt

Giữ email trong state điều hướng nội bộ, không thêm email vào query string. S02 hướng dẫn kiểm tra email hoặc liên hệ admin; sinh viên không gọi API-02 vì endpoint yêu cầu quyền admin. Không polling activated, không tự gọi login nhiều lần để dò trạng thái và không tự dùng mật khẩu đã nhập để thử lại ở nền.

### 5.3. Import → lỗi dòng → sửa → nhập lại

Kết quả `success=false` xác nhận không lưu theo nhánh kiểm tra. Dùng `errors` để chỉ vị trí cần sửa; cho người dùng sửa tệp bên ngoài. Sau khi chọn tệp mới, bỏ kết quả parse/validation cũ, preview lại rồi gửi request mới khi người dùng bấm. Không cần API riêng để tải danh sách lỗi.

### 5.4. Import → mất kết nối

Nếu chưa gửi request thì có thể giữ nguyên màn kiểm tra. Nếu request đã có thể tới server mà không nhận kết quả đáng tin cậy, chuyển sang trạng thái chưa xác nhận. Đưa thông tin lần gửi cho hỗ trợ, không tự import lại. Màn hình không có khả năng đối soát qua API hiện tại; tính năng đó nằm trong [07](07-phu-thuoc-backend.md).

## 6. Máy trạng thái import

| State | Vào state khi | Hành động được phép | Ra state |
| --- | --- | --- | --- |
| `idle` | Chưa có File | Chọn tệp, đọc hướng dẫn | `fileSelected` |
| `fileSelected` | Có tệp qua kiểm tra kích thước/đuôi | Đổi tệp, kiểm tra | `previewing` |
| `previewing` | Đọc và kiểm tra cục bộ | Hủy đọc cục bộ nếu được hỗ trợ | `needsCorrection` hoặc `ready` |
| `needsCorrection` | Lỗi preview hoặc API 200 + false | Xem/tải lỗi, chọn tệp đã sửa | `fileSelected` |
| `ready` | Preview hợp lệ ở mức cục bộ | Đổi tệp, xác nhận nhập | `submitting` |
| `submitting` | Đã phát request ghi | Chờ; rời trang chỉ có cảnh báo phù hợp | `succeeded`, `needsCorrection`, `sessionExpired`, `forbidden`, `fileRejected`, `unknown` |
| `succeeded` | 200 + schema hợp lệ + success=true | Xem tóm tắt, bắt đầu tệp khác | `idle` |
| `fileRejected` | 400 lỗi tệp/413 đã nhận rõ | Đọc cách sửa, chọn tệp khác | `fileSelected` |
| `sessionExpired` | 401 đáng tin cậy | Đăng nhập lại | `ready` nếu cùng user và còn File |
| `forbidden` | 403 do thiếu quyền import | Quay về, đọc hướng dẫn | Không tự retry |
| `unknown` | Timeout, mất kết nối sau gửi, response không đủ tin cậy | Xem thông tin, nhờ đối soát | Chỉ sau xác minh hoặc kết thúc workflow có chủ ý |

Các state phải loại trừ nhau; không có tình trạng vừa hiển thị “đã lưu” vừa cho sửa lỗi như chưa lưu. Số lượng dòng có thể là derived state, không phải nhiều bản sao cập nhật độc lập.

## 7. Chuẩn hóa lỗi

AppError nội bộ cần có: loại lỗi, HTTP status nếu có, mã chuẩn hóa nếu có, lỗi theo trường nếu có, thông báo người dùng, khả năng gửi lại an toàn và trạng thái tác động đã biết/chưa biết. Không đưa raw response vào props của mọi component.

| Tín hiệu | Hành vi giao diện | Gửi lại |
| --- | --- | --- |
| Validation form cục bộ | Chỉ trường và cách sửa | Sau sửa, người dùng chủ động |
| API-04 200 + false | Bảng lỗi dòng, xác nhận chưa lưu | Tệp đã sửa và xác nhận lại |
| 400 có mã đã biết | Lỗi cụ thể theo endpoint | Sau sửa nguyên nhân |
| 401 API bảo vệ | Một luồng đăng nhập lại | Không tự replay |
| 403 | Thông báo đúng ngữ cảnh | Không tự retry |
| 404 email không có | Giữ email, cho sửa hoặc hỗ trợ | Theo hành động người dùng |
| 409 nếu backend bổ sung | Giải thích dữ liệu xung đột | Đọc lại dữ liệu khi có API phù hợp |
| 429 nếu tầng bảo vệ bổ sung | Thời gian chờ nếu có thông tin đáng tin cậy | Không tự replay POST; muốn đọc Retry-After phải expose header CORS |
| 5xx/HTML lỗi | Lời giải thích dự phòng; tác vụ ghi có thể chưa xác định | Không tự retry POST |
| Mạng/timeout | Giữ ngữ cảnh; tác vụ ghi đã gửi là `unknown` | Chỉ sau đối soát phù hợp |

Chỉ render thông báo server như text. Không dùng `dangerouslySetInnerHTML`. Với field chưa biết, giữ số dòng, hiển thị “Thông tin cần kiểm tra”; không loại bỏ lỗi chỉ vì frontend chưa có bản dịch. Mã lỗi/chi tiết kỹ thuật có thể phục vụ log đã làm sạch, không hiển thị stack trace cho người dùng.

## 8. Query/cache khi có API đọc — ĐỀ XUẤT

TanStack có các mặc định về stale, refetch và retry; cần cấu hình theo nghiệp vụ để tránh request ngoài dự kiến. [Important Defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults). **Hiện tại không tạo query gọi danh sách giả.**

| Dữ liệu tương lai | Query key đề xuất | Chính sách khởi điểm |
| --- | --- | --- |
| Người dùng hiện tại | user + current session scope | Chỉ khi có API hồ sơ; không refetch làm ngắt form |
| Danh sách sinh viên | students + user scope + filters + page + sort | stale khoảng 30 giây; phân trang server; retry đọc có giới hạn |
| Danh mục ngành | majors + môi trường/scope phù hợp | stale khoảng 10 phút; invalidation khi danh mục thay đổi |
| Tài khoản chưa kích hoạt | accounts + scope + activated filter + page | invalidation sau request kích hoạt chỉ cập nhật dữ liệu server cho phép, không tự đổi activated |

Không đưa access token vào query key. Cùng một query key dùng chung kết quả; route loader và component không tạo hai request độc lập. Prefetch chỉ dữ liệu có khả năng cần ngay tiếp theo, không tải mọi trang/danh mục khi login.

Tìm kiếm phía server: debounce khoảng 300 ms, hủy request đọc đã lỗi thời và đảm bảo response cũ không ghi đè bộ lọc mới. Danh sách có pagination phải hiển thị rõ trạng thái tải. Các GET độc lập có thể chạy đồng thời; GET phụ thuộc ID cần chờ ID hợp lệ.

Sau import thành công, invalidation đúng danh sách/tổng số liên quan nếu chúng đã có thật. Không refetch toàn bộ ứng dụng. Không optimistic insert N sinh viên khi API chỉ trả số lượng và không trả định danh. Dữ liệu cache cũ có thể hiển thị với trạng thái đang cập nhật; không giả tổng bằng tổng preview.

## 9. Import → kích hoạt hàng loạt — ĐỀ XUẤT

Điều kiện tối thiểu: backend trả ID tài khoản mới nhập hoặc import batch ID tra cứu được; quyền batch được bảo vệ; khóa được lưu; luồng hoàn tất kích hoạt hoạt động. Các tên endpoint mới phải được thiết kế và phê duyệt hợp đồng, không được tự suy ra từ đoạn này.

Luồng đích:

1. Import hoàn tất và trả bằng chứng kết quả.
2. UI giữ kết quả import, lấy tập tài khoản thuộc lần nhập bằng nguồn backend xác thực.
3. Quản trị viên chọn “Gửi email kích hoạt” và xem trước người nhận; mặc định không tự gửi.
4. Gửi một batch theo giới hạn server đã công bố. Nếu cần chia lô, phải có trạng thái từng lô và giới hạn đồng thời; không tự chọn kích thước tùy ý.
5. Nếu email lỗi, giữ rõ “Đã nhập N sinh viên; bước gửi email chưa hoàn tất”. Không chạy lại import để thử lại email.
6. Khi có job status, polling có khoảng chờ, dừng ở trạng thái cuối; chưa có job thì chỉ hiển thị yêu cầu đã được tiếp nhận.

Nếu cần trải nghiệm tự động cả chuỗi, backend nên có orchestration/job và idempotency rõ ràng. Frontend không thể tạo giao dịch nguyên tử cho nhiều API độc lập bằng cách gọi liên tiếp.

## 10. Quan sát để cải thiện UX

Khi triển khai, đo thời gian login/import, lỗi hợp đồng, tỉ lệ sửa tệp thành công và số lần click bị chặn do pending. Sự kiện chỉ chứa tên hành động, thời lượng, số lượng tổng hợp và loại lỗi; không chứa password, token, activation key, email, nội dung Excel hoặc toàn bộ response.

Chỉ gửi thông tin đo lường tới công cụ được dự án cấu hình. Không tự bổ sung nhà cung cấp analytics. Dữ liệu preview và File phải được giải phóng khi kết thúc luồng/đăng xuất; nếu người dùng chủ động tải báo cáo lỗi, thông báo đó là tệp chứa dữ liệu công việc trên thiết bị của họ.
