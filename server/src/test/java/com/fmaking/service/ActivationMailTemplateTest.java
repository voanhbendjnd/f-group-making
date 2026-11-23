package com.fmaking.service;

import com.fmaking.service.dto.UserDTO;
import jakarta.mail.Message;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.Test;
import org.springframework.context.support.ResourceBundleMessageSource;
import org.springframework.mail.javamail.JavaMailSender;
import org.thymeleaf.spring6.SpringTemplateEngine;
import org.thymeleaf.templateresolver.ClassLoaderTemplateResolver;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class ActivationMailTemplateTest {

    private String render(UserDTO user) throws Exception {
        ClassLoaderTemplateResolver resolver = new ClassLoaderTemplateResolver();
        resolver.setPrefix("templates/");
        resolver.setSuffix(".html");
        resolver.setTemplateMode("HTML");
        resolver.setCharacterEncoding("UTF-8");

        ResourceBundleMessageSource messageSource = new ResourceBundleMessageSource();
        messageSource.setBasename("i18n/messages");
        messageSource.setDefaultEncoding("UTF-8");

        SpringTemplateEngine engine = new SpringTemplateEngine();
        engine.setTemplateResolver(resolver);
        engine.setMessageSource(messageSource);

        JavaMailSender sender = mock(JavaMailSender.class);
        MimeMessage mail = new MimeMessage(Session.getInstance(new Properties()));
        when(sender.createMimeMessage()).thenReturn(mail);

        MailService service = new MailService(messageSource, engine, sender, "https://app.fgroupmaking.vn", false);
        service.sendActivationEmailSync(user);

        verify(sender).send(mail);
        assertThat(mail.getRecipients(Message.RecipientType.TO)).extracting(Object::toString).containsExactly(user.getEmail());
        assertThat(mail.getSubject()).contains("Kích hoạt tài khoản");
        return (String) mail.getContent();
    }

    @Test
    void rendersActivationEmailWithButtonsAndCopyLink() throws Exception {
        UserDTO user = new UserDTO();
        user.setEmail("lecturer.test@fpt.edu.vn");
        user.setName("ThS. Nguyễn Văn A");
        user.setActivationKey("secure-activation-key-abcdef123456");

        String html = render(user);

        // Header & branding
        assertThat(html).contains("F-Group Making", "Kết nối thành viên, cùng nhau tạo giá trị");
        assertThat(html).contains("KÍCH HOẠT TÀI KHOẢN", "Kích hoạt tài khoản của bạn");
        assertThat(html).contains("ThS. Nguyễn Văn A", "lecturer.test@fpt.edu.vn");

        // Expected activation URL
        String expectedUrl = "https://app.fgroupmaking.vn/account/activate?key=secure-activation-key-abcdef123456";

        // Primary Button: "Kích hoạt tài khoản"
        assertThat(html).contains("Kích hoạt tài khoản");
        assertThat(html).contains("href=\"" + expectedUrl + "\"");

        // Copy button removed to prevent identical click behavior in email clients
        assertThat(html).doesNotContain("Sao chép liên kết");

        // Copy box with raw URL
        assertThat(html).contains("Nếu không thể nhấp vào nút trên, bạn có thể sao chép liên kết sau vào trình duyệt:");
        assertThat(html).contains(">" + expectedUrl + "<");

        // No uncompiled Thymeleaf directives
        assertThat(html).doesNotContain("th:href", "th:text", "th:block", "th:with");

        // Save preview for manual inspection
        Path previewDir = Path.of("build/reports/mail-preview");
        Files.createDirectories(previewDir);
        Files.writeString(previewDir.resolve("activation-email.html"), html, StandardCharsets.UTF_8);
    }

    @Test
    void escapesUserContentSafely() throws Exception {
        UserDTO user = new UserDTO();
        user.setEmail("xss.test@fpt.edu.vn");
        user.setName("<script>alert('xss')</script>");
        user.setActivationKey("safe-key-789");

        String html = render(user);

        assertThat(html).doesNotContain("<script>alert('xss')</script>");
        assertThat(html).contains("&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;");
        assertThat(html).contains("https://app.fgroupmaking.vn/account/activate?key=safe-key-789");
    }
}
