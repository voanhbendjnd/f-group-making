package com.fmaking.service;

import com.fmaking.service.event.GroupReviewNotificationEvent;
import com.fmaking.service.event.GroupReviewNotificationEvent.Kind;
import com.fmaking.service.event.GroupReviewNotificationEvent.Member;
import com.fmaking.service.event.GroupReviewNotificationEvent.Recipient;
import jakarta.mail.Message;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.context.MessageSource;
import org.springframework.mail.javamail.JavaMailSender;
import org.thymeleaf.spring6.SpringTemplateEngine;
import org.thymeleaf.templateresolver.ClassLoaderTemplateResolver;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Properties;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class GroupReviewMailTemplateTest {
    private static final Recipient RECIPIENT = new Recipient("recipient@example.test", "Nguyễn Minh Anh");
    static GroupReviewNotificationEvent notification(Kind kind, String groupName, String reason) {
        return new GroupReviewNotificationEvent(kind, 1L, groupName, 8, "Đăng ký nhóm học kỳ Fall 2026", 2,
                "EXE102_G02", 1, kind == Kind.SUBMITTED ? "Trần Hoàng An" : "ThS. Nguyễn Thanh Hà", reason,
                Instant.parse("2026-10-18T02:30:00Z"), List.of(
                    new Member("Trần Hoàng An", "SE190001", true), new Member("Nguyễn Minh Anh", "SE190002", false),
                    new Member("Hoàng Thị Thảo", "GD190003", false), new Member("Lê Quốc Bảo", "SE190004", false)), List.of(RECIPIENT));
    }
    private String render(GroupReviewNotificationEvent event) throws Exception {
        ClassLoaderTemplateResolver resolver = new ClassLoaderTemplateResolver(); resolver.setPrefix("templates/");
        resolver.setSuffix(".html"); resolver.setTemplateMode("HTML"); resolver.setCharacterEncoding("UTF-8");
        SpringTemplateEngine engine = new SpringTemplateEngine(); engine.setTemplateResolver(resolver);
        JavaMailSender sender = mock(JavaMailSender.class);
        MimeMessage mail = new MimeMessage(Session.getInstance(new Properties())); when(sender.createMimeMessage()).thenReturn(mail);
        MailService service = new MailService(mock(MessageSource.class), engine, sender, "https://groups.example.test", false);
        service.sendGroupReviewEmailSync(RECIPIENT, event);
        verify(sender).send(mail);
        assertThat(mail.getRecipients(Message.RecipientType.TO)).extracting(Object::toString).containsExactly(RECIPIENT.email());
        assertThat(mail.getSubject()).contains("[F-Group Making]", event.groupName());
        return (String) mail.getContent();
    }

    @ParameterizedTest @EnumSource(Kind.class)
    void rendersVietnameseMailAndWritesPreview(Kind kind) throws Exception {
        String reason = kind == Kind.REJECTED ? "Nhóm cần bổ sung thành viên chuyên ngành GD.\nVui lòng điều chỉnh và gửi duyệt lại." : null;
        String html = render(notification(kind, "Nhóm Sáng Tạo", reason));
        assertThat(html).contains("lang=\"vi\"", "Nguyễn Minh Anh", "Nhóm Sáng Tạo", "EXE102_G02", "Trưởng nhóm", "SE190001", "09:30 18/10/2026 (GMT+7)");
        assertThat(html).doesNotContain("th:text", "th:href", "th:each", "http://localhost");
        if (kind == Kind.REJECTED) assertThat(html).contains("Lý do từ chối", reason);
        else assertThat(html).doesNotContain("Lý do từ chối");
        Path previews = Path.of("build/reports/mail-preview"); Files.createDirectories(previews);
        Files.writeString(previews.resolve("group-" + kind.name().toLowerCase(java.util.Locale.ROOT) + ".html"), html, StandardCharsets.UTF_8);
    }

    @ParameterizedTest @EnumSource(Kind.class)
    void escapesUserContentAndUsesCorrectRoleLink(Kind kind) throws Exception {
        String html = render(notification(kind, "Nhóm A&B + <C>", kind == Kind.REJECTED ? "<script>alert('bad')</script>\nCần sửa" : null));
        assertThat(html).contains("Nhóm A&amp;B + &lt;C&gt;").doesNotContain("<script>");
        if (kind == Kind.SUBMITTED) {
            assertThat(html).contains("/lecturer/group-review?classId=2&amp;status=PENDING&amp;termId=1&amp;search=", "%26", "%2B", "%3C");
        } else assertThat(html).contains("/student/groups/select?deadlineId=8&amp;classId=2");
        if (kind == Kind.REJECTED) assertThat(html).contains("&lt;script&gt;");
    }
}
