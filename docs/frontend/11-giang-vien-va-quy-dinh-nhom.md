# Giảng viên và quy định nhóm — cập nhật 2026-10-13

Tài liệu này mô tả contract và luồng được triển khai trên nhánh `feature/lecturer-class-rules`. Các nhận định cũ về việc chỉ có giao diện admin/sinh viên hoặc chưa có API lớp không áp dụng cho phần này.

## Luồng và cấu trúc

Giảng viên đăng nhập → `/lecturer/classes` → chọn lớp → `/lecturer/classes/:id` → xem danh sách sinh viên và xem hoặc chỉnh bảy điều kiện → lưu khi có quyền. Trang danh sách có tìm kiếm, phân trang, trạng thái tải/lỗi/trống. Trang chi tiết có thông tin lớp, form quy định và bảng sinh viên. Admin có thêm form quy định ngay tại `/admin/classes/:id`.

Quy định nhóm mặc định được thu gọn thành nút trên trang chi tiết của admin/giảng viên. `ClassRulesDisclosure` chỉ tải form khi mở lần đầu; thu lại vẫn giữ form trong bộ nhớ để bảo toàn bản nháp, phiên bản và trạng thái lưu. Giảng viên/admin có nút "Quy định nhóm"; người chỉ đọc có nút "Xem quy định nhóm". Nút có `aria-expanded` và `aria-controls`, phần đã thu không xuất hiện trong thứ tự bàn phím.

`ROLE_ADMIN` xem và sửa quy định mọi lớp. `ROLE_LECTURE` chỉ xem/quản lý lớp có `lecturerId` bằng ID tài khoản. `ROLE_LECTURE_MASTER` xem mọi lớp; chỉ sửa quy định lớp được phân công cho mình. Quyền trưởng bộ môn hoạt động độc lập, không cần có thêm `ROLE_LECTURE`. Khi có cả hai quyền giảng viên, quyền xem toàn bộ vẫn được giữ. Tài khoản có nhiều quyền ưu tiên trang chủ admin, giảng viên/trưởng bộ môn rồi sinh viên; admin cũng được vào khu vực giảng viên.

Giảng viên thường dùng danh sách lớp được phân công (`/api/me/school-classes`). Trưởng bộ môn và admin dùng danh sách toàn bộ (`/api/school-classes`). FE hiển thị "Tất cả lớp học" cho quyền xem toàn bộ. Form của trưởng bộ môn khi xem lớp người khác chỉ đọc, không có nút lưu; backend vẫn kiểm tra quyền độc lập với FE.

Frontend dùng stack hiện hữu: React/TypeScript, React Router, TanStack Query, React Hook Form, client Axios chung, CSS token/component chung và Lucide; không bổ sung UI kit. `ManagementLayout` dùng chung cho admin và giảng viên. Các trang ở `pages/lecturer`; API/type/form/hook quy định ở `features/rules`; API/type/bảng lớp ở `features/classes`. Nội dung mới có tiếng Việt và tiếng Anh với bộ khóa tương ứng.

Cache TanStack Query được tạo riêng cho mỗi tài khoản và được xóa khi tài khoản thay đổi. Dữ liệu form chỉ nằm trong bộ nhớ, không lưu vào storage.

## Bốn API

Mọi response thành công dùng envelope `statusCode/message/data` hiện hữu. Client unwrap một lần. API lỗi dùng Problem hiện hữu.

| Method/path | Quyền và hành vi |
| --- | --- |
| `GET /api/me/school-classes` | Admin, giảng viên và trưởng bộ môn; luôn chỉ lấy lớp có `lecturerId` khớp tài khoản được giải từ subject đăng nhập. Có `search`, `termId`, `page` từ 1, `size` mặc định 10; trả `ResultPaginationDTO<SchoolClassDTO>`. |
| `GET /api/school-classes/{classId}` | Admin/trưởng bộ môn đọc bất kỳ lớp; giảng viên thường chỉ đọc lớp mình. Trả `SchoolClassDTO`. |
| `GET /api/school-classes/{classId}/rules` | Quyền đọc như API chi tiết lớp. Không ghi database. Lớp chưa lưu có `configured=false` và các giá trị gợi ý. |
| `PUT /api/school-classes/{classId}/rules` | Admin sửa mọi lớp; giảng viên/trưởng bộ môn chỉ sửa lớp được phân công. Gửi đủ bảy mã và phiên bản đã đọc; insert các dòng thiếu, cập nhật các dòng đã có trong một transaction. |

Hai API có sẵn được đồng bộ quyền: `GET /api/school-classes` dành cho admin/trưởng bộ môn, trả mọi lớp với tìm kiếm, học kỳ và phân trang; `GET /api/school-classes/{classId}/students` áp dụng cùng quyền đọc với API chi tiết lớp. Giảng viên thường không được dùng danh sách toàn bộ để xem lớp người khác.

### Xem sinh viên theo lớp

`GET /api/school-classes/{classId}/students` trả `data: StudentDTO[]`, sắp theo mã sinh viên tăng dần. `ROLE_LECTURE` chỉ được đọc lớp được phân công; admin/trưởng bộ môn đọc mọi lớp. Lớp không tồn tại trả 404; lớp trống trả mảng rỗng. Backend lọc bằng `Student.schoolClassId`, join User/Major qua ID và không trả activation key.

`features/classes/components/ClassStudentsPanel.tsx` được hiển thị ở trang chi tiết giảng viên sau khi tải thông tin lớp thành công. Bảng hiển thị mã sinh viên, họ tên, email, mã thành viên, ngành và trạng thái kích hoạt. Dùng chung `StudentFilterBar` của admin: tìm mã/tên/email/mã thành viên (debounce 350 ms hoặc Enter), ngành theo chữ hoặc ID được chọn, trạng thái kích hoạt và trạng thái có mã mời; có xóa tất cả bộ lọc. Các điều kiện kết hợp đồng thời. `MajorSearchFilter` nhận danh sách ngành có trong lớp qua `majorOptions` để gợi ý, nên không gọi API ngành toàn cục cho giảng viên; admin vẫn dùng API gợi ý như trước.

API trả toàn bộ sinh viên của lớp, vì vậy lọc và phân trang được thực hiện trên FE. Dùng component `Pagination` chung, mặc định 10 dòng/trang, chọn 10/20/50/100 dòng; đổi bộ lọc hoặc kích thước trang về trang đầu, và trang hiển thị được giới hạn khi danh sách thay đổi. Các trạng thái tải, lỗi, lớp trống và tìm không thấy được phân biệt. Lỗi 401/403/404 không tự retry. Bảng cuộn ngang trên màn hình nhỏ. Cache và request gắn theo `classId`; request hỗ trợ hủy khi rời trang. Không có thao tác gửi thư hoặc chỉnh sửa sinh viên trong giao diện này.

`Rule.schoolClassId` là Integer, không thêm association JPA. Unique `(school_class_id, code)` thay cho unique `code` toàn hệ thống. `SchoolClass.rulesVersion` tăng sau mỗi lần lưu thành công. Mọi bên có quyền ghi, kể cả admin, vẫn phải đáp ứng validation và phiên bản hiện tại.

Body PUT:

```json
{
  "version": 0,
  "rules": [
    {"code": "MIN_MEMBERS_PER_GROUP", "value": 4},
    {"code": "MAX_MEMBERS_PER_GROUP", "value": 6},
    {"code": "MIN_GROUPS_PER_CLASS", "value": 1},
    {"code": "MAX_GROUPS_PER_CLASS", "value": 50},
    {"code": "MIN_MAJORS_PER_GROUP", "value": 1},
    {"code": "MAX_MAJORS_PER_GROUP", "value": 6},
    {"code": "MIN_SE_MEMBERS_PER_GROUP", "value": 1}
  ]
}
```

`data` của GET/PUT Rule gồm `schoolClassId`, `version`, `configured`, `rules`, `warnings`. Giá trị gợi ý không phải quy định bắt buộc của trường; giáo viên phải lưu để thiết lập lớp mới. Bộ Rule thiếu một số mã sẽ được điền gợi ý khi đọc và đánh dấu chưa thiết lập đầy đủ.

## Validation, quyền và cập nhật đồng thời

- Gửi đủ bảy mã, không mã lạ, mã trùng hay phần tử null. Sáu quy định ban đầu nhận số nguyên 1–1000; riêng `MIN_SE_MEMBERS_PER_GROUP` nhận số nguyên 0–1000. Giá trị 0 bỏ yêu cầu SE; số âm, thập phân, chuỗi số và null đều không hợp lệ.
- Mỗi cặp tối thiểu/tối đa phải có `min <= max`. Số ngành tối thiểu không vượt số thành viên tối đa.
- Khi yêu cầu SE > 0, `minSE + minMajors - 1 <= maxMembers`: SE là một ngành; mỗi ngành còn lại cần ít nhất một thành viên. Cấu hình vượt sức chứa trả 400 `ruleSeExceedMembers`.
- `warnings` kiểm tra lớp trống, khả năng chia sĩ số theo giới hạn số nhóm/thành viên và số ngành khác nhau hiện có. Cảnh báo không chặn lưu vì danh sách lớp có thể chưa hoàn tất. Đây chưa phải chứng minh khả thi đầy đủ cho phân bố ngành hoặc nhóm hiện có.
- `INSUFFICIENT_SE_STUDENTS`: số SE trong lớp nhỏ hơn số nhóm tối thiểu cần tạo nhân số SE tối thiểu mỗi nhóm. SE được nhận diện qua `Student.majorId = Major.id` và mã ngành bằng `SE` sau khi chuẩn hóa hoa/thường và khoảng trắng; không dùng tiền tố MSSV hay mã ngành có chứa chữ SE. Giá trị SE = 0 không phát cảnh báo này. Giới hạn số nhóm khả thi tính thêm số thành viên cần để đáp ứng SE và số ngành tối thiểu.
- Không có phiên: 401; sai vai trò hoặc khác giảng viên phụ trách: 403; lớp không tồn tại: 404; cấu hình sai: 400; phiên bản cũ: 409 `rulesVersionConflict`.
- PUT khóa hàng lớp trước khi kiểm tra quyền, phiên bản và ghi cả bộ. Hai yêu cầu cùng phiên bản không thể cùng ghi đè thành công, kể cả lần insert đầu tiên.
- Form kiểm tra trước khi gửi, giữ giá trị khi lỗi, khóa gửi lặp và không tự retry mutation.
- Xung đột hoặc kết quả ghi chưa xác nhận do mạng/5xx/body sai hợp đồng: giữ bản nháp, yêu cầu người dùng chủ động đọc lại. Nút đọc lại ghi rõ sẽ thay bản nháp bằng dữ liệu hiện tại. Không tự gửi lại sau đăng nhập.

## Database và vận hành

Rule SE là mã mới trong bảng hiện có, không cần thêm cột hay migration mới. Giá trị gợi ý là 1 và chỉ được lưu khi PUT thành công. Lớp đã có sáu Rule giữ nguyên giá trị/ID/phiên bản; GET bổ sung gợi ý SE, đánh dấu `configured=false` và không ghi database. Lần lưu tiếp gửi bảy Rule để bổ sung dòng SE. Cập nhật BE/FE cùng phiên bản vì payload cũ chỉ sáu Rule sẽ trả 400.

Chạy [migration MySQL](../sql/20261012_class_rules.sql) trước khi khởi động backend cập nhật trên database cũ, sau khi dừng ghi và sao lưu. Hibernate `ddl-auto=update` không tự gỡ unique index cũ trên `code`.

Migration lưu Rule toàn cục cũ vào `rules_global_legacy_20261012` và tạo bản sao cho từng lớp hiện có; giá trị lớp đã có được giữ ưu tiên. Các mã chưa được hỗ trợ vẫn được bảo toàn, nhưng không được hiển thị như điều kiện đang thực thi. Lớp tạo mới dùng gợi ý chưa lưu. Không tự chạy migration trên dữ liệu người dùng trong quá trình phát triển tính năng.

## Kiểm tra nghiệm thu

- Backend integration: lớp được phân công/tìm kiếm/phân trang/học kỳ, đọc chỉ gợi ý không ghi, insert/update độc lập từng lớp, admin ghi mọi lớp, trưởng bộ môn đọc toàn bộ nhưng chỉ ghi lớp mình, nhiều role kết hợp, sinh viên/anonymous, đổi phân công, mã/giá trị sai và phiên bản cũ.
- Frontend: chọn API danh sách theo quyền, form chỉ đọc cho lớp người khác, admin ghi quy định, trưởng bộ môn ghi lớp mình, không lưu khi mount, không gửi lặp, validation theo cặp, giữ bản nháp khi lỗi/xung đột, đọc lại chủ động, role guard và chuyển hướng giảng viên/trưởng bộ môn.
- Test import cũ được cập nhật fixture lớp/giảng viên, lựa chọn học kỳ và provider đúng với luồng hiện có; không bỏ assertion nghiệp vụ.
- Ghi kết quả chạy kiểm tra và giới hạn môi trường trong báo cáo bàn giao. Test H2 không thay thế việc kiểm tra migration trên MySQL.

Kết quả xác minh 12/10/2026: toàn bộ 104 test backend và 65 test frontend qua; backend có test hai transaction ghi đồng thời lần đầu, chỉ một lần được chấp nhận. Form được kiểm tra bằng Chromium ở 1440, 390 và 320 px, có thử đăng nhập/chuyển trang, validation/focus, lưu/đọc lại và không tràn ngang. Kiểm tra trình duyệt dùng API fixture riêng, còn API thật được xác minh bằng integration test. Migration được chạy và chạy lại trên MySQL 8.0.46 tạm với dữ liệu giả: bảo toàn Rule cũ, bỏ unique toàn cục, tạo unique theo lớp và chỉnh giá trị từng lớp độc lập. Database người dùng chưa được thay đổi.

Kết quả cập nhật quyền 13/10/2026: toàn bộ 107 test backend và 75 test frontend qua; frontend build thành công, lint không có lỗi với 8 cảnh báo hiện hữu. Test mới xác minh role trưởng bộ môn độc lập/kết hợp, admin sửa lớp không được phân công, giới hạn giảng viên thường, lựa chọn API danh sách và form chỉ đọc trên FE. Thay đổi quyền không cần migration bổ sung.

Kết quả bổ sung bảng sinh viên 13/10/2026: toàn bộ 84 test frontend qua; 17 integration test `LecturerClassRulesTest` qua, gồm dữ liệu sinh viên đúng lớp/thứ tự, lớp trống, mất quyền khi đổi giảng viên và lỗi 401/403/404. Build frontend thành công; lint giữ 8 cảnh báo hiện hữu. Chromium với API fixture xác minh tìm kiếm/xóa tìm kiếm và bảng tại 1440, 390, 320 px: không tràn ngang trang, bảng cuộn ngang trên điện thoại, không lỗi JavaScript và chỉ một request danh sách cho các lần tìm kiếm. Không thay đổi schema hoặc cần migration mới cho bảng sinh viên.

Kết quả điều chỉnh FE 13/10/2026: 88 test frontend qua, build thành công và lint giữ 8 cảnh báo hiện hữu. Test xác minh cấu hình mặc định thu gọn, tải lần đầu khi mở, giữ bản nháp sau khi thu/mở; kết hợp các bộ lọc, chọn ngành theo ID của lớp, không gọi API gợi ý admin và chuyển trang/đổi kích thước. Chromium với API fixture tại 1440/390/320 px xác minh cùng luồng, không tràn ngang trang hoặc lỗi JavaScript; thao tác lọc/phân trang dùng một request sinh viên và mở cấu hình dùng một GET Rule. Quyền backend và hợp đồng API không đổi ở lần điều chỉnh FE này.

Module nhóm, random, deadline và chốt nhóm vẫn là các bước tiếp theo. Chúng phải gọi chung bộ quy định này để thực thi giới hạn tối đa khi tạo/thêm và giới hạn tối thiểu khi chốt.

Kết quả bổ sung Rule SE 13/10/2026: toàn bộ 112 test backend và 102 test frontend qua; build thành công, lint giữ 8 cảnh báo hiện hữu. Test xác minh 0 tắt yêu cầu SE, cập nhật độc lập theo lớp, chặn số âm/thập phân/chuỗi/null/thiếu mã và 0 ở sáu Rule khác, kiểm tra sức chứa khi kết hợp nhiều ngành, chỉ đếm ngành SE đúng lớp và nâng cấp bộ sáu Rule mà không tự ghi khi GET. Test hai transaction vẫn xác minh chỉ một bộ bảy Rule được ghi cho cùng phiên bản. Chromium với API fixture xác minh lưu 0 rồi 2, đọc lại được giá trị đã lưu và không tràn ngang/lỗi JavaScript tại 1440/390/320 px. Rule hiện được cấu hình và kiểm tra; module random/chốt nhóm cần thực thi điều kiện này khi được triển khai.
