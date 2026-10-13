package tech.djnd.sample.app.service;

import org.junit.jupiter.api.Test;
import org.springframework.context.MessageSource;
import org.springframework.mail.javamail.JavaMailSender;
import org.thymeleaf.spring6.SpringTemplateEngine;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

class MailServiceTest {

    private final MessageSource messageSource = mock(MessageSource.class);
    private final SpringTemplateEngine templateEngine = mock(SpringTemplateEngine.class);
    private final JavaMailSender mailSender = mock(JavaMailSender.class);

    @Test
    void acceptsPublicHttpsClientUrl() {
        assertThatCode(() -> new MailService(
                messageSource,
                templateEngine,
                mailSender,
                "https://app.fgroupmaking.vn/",
                false
        )).doesNotThrowAnyException();
    }

    @Test
    void rejectsBlankClientUrl() {
        assertThatThrownBy(() -> new MailService(
                messageSource,
                templateEngine,
                mailSender,
                " ",
                false
        )).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("must be configured");
    }

    @Test
    void rejectsLocalhostUnlessExplicitlyAllowed() {
        assertThatThrownBy(() -> new MailService(
                messageSource,
                templateEngine,
                mailSender,
                "http://localhost:3000",
                false
        )).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("must not use localhost");
    }

    @Test
    void allowsHttpLocalhostForExplicitDevelopment() {
        assertThatCode(() -> new MailService(
                messageSource,
                templateEngine,
                mailSender,
                "http://localhost:3000",
                true
        )).doesNotThrowAnyException();
    }

    @Test
    void rejectsNonHttpsPublicUrl() {
        assertThatThrownBy(() -> new MailService(
                messageSource,
                templateEngine,
                mailSender,
                "http://app.fgroupmaking.vn",
                false
        )).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("must use HTTPS");
    }
}
