package tech.djnd.sample.app.service;

import java.nio.charset.StandardCharsets;
import java.net.URI;
import java.util.Locale;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.MessageSource;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.thymeleaf.context.Context;
import org.thymeleaf.spring6.SpringTemplateEngine;


import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import tech.djnd.sample.app.config.Constants;
import tech.djnd.sample.app.service.dto.UserDTO;


@Service
public class MailService {
    private final  JavaMailSender javaMailSender;
    private final MessageSource messageSource;
    private final SpringTemplateEngine springTemplateEngine;
    private static final Logger LOG = LoggerFactory.getLogger(MailService.class);
    private static final String USER = "user";
    private static final String BASE_URL = "baseUrl";
    private final String clientBaseUrl;
    public MailService(
            MessageSource messageSource,
            SpringTemplateEngine springTemplateEngine,
            JavaMailSender javaMailSender,
            @Value("${djnd.client.base-url}") String clientBaseUrl,
            @Value("${djnd.client.allow-localhost:false}") boolean allowLocalhost
    ) {
        this.messageSource = messageSource;
        this.javaMailSender = javaMailSender;
        this.springTemplateEngine = springTemplateEngine;
        this.clientBaseUrl = validateAndNormalizeClientBaseUrl(clientBaseUrl, allowLocalhost);
    }
    @Async
    public void sendEmail(String to, String subject, String content, boolean isMultipart, boolean isHtml) {
        sendEmailSync(to, subject, content, isMultipart, isHtml);
    }

    public void sendEmailSync(String to, String subject, String content, boolean isMultipart, boolean isHtml) {
        LOG.debug(
                "Send email[multipart '{}' and html '{}'] to '{}' with subject '{}'",
                isMultipart,
                isHtml,
                to,
                subject);
        // Prepare message using a Spring helper
        MimeMessage mimeMessage = javaMailSender.createMimeMessage();
        try {
            MimeMessageHelper message = new MimeMessageHelper(mimeMessage, isMultipart, StandardCharsets.UTF_8.name());
            message.setTo(to);
            message.setSubject(subject);
            message.setText(content, isHtml);
            javaMailSender.send(mimeMessage);
            LOG.debug("Sent email to User '{}'", to);
        } catch (MailException | MessagingException e) {
            LOG.warn("Email could not be sent to user '{}'", to, e);
        }
    }

    @Async
    public void sendEmailFromTemplate(UserDTO user, String templateName, String titleKey) {
        sendEmailFromTemplateSync(user, templateName, titleKey);
    }

    private void sendEmailFromTemplateSync(UserDTO user, String templateName, String titleKey) {
        if (user.getEmail() == null) {
            return;
        }
        Locale locale = Locale.forLanguageTag(Constants.DEFAULT_LANGUAGE);
        Context context = new Context(locale);
        context.setVariable(USER, user);
        context.setVariable(BASE_URL, clientBaseUrl);
        String content = springTemplateEngine.process(templateName, context);
        String subject = messageSource.getMessage(titleKey, null, locale);
        sendEmailSync(user.getEmail(), subject, content, false, true);
    }


    @Async
    public void sendActivationEmail(UserDTO user) {
        sendActivationEmailSync(user);
    }

    public void sendActivationEmailSync(UserDTO user) {
        LOG.debug("Sending activation email to '{}'", user.getEmail());
        sendEmailFromTemplateSync(user, "mail/activationEmail", "email.activation.title");
    }

    @Async
    public void sendCreationEmail(UserDTO user) {
        LOG.debug("Sending creation email to '{}'", user.getEmail());
        sendEmailFromTemplateSync(user, "mail/creationEmail", "email.activation.title");
    }

    @Async
    public void sendPasswordResetMail(UserDTO user) {
        LOG.debug("Sending password reset email to '{}'", user.getEmail());
        sendEmailFromTemplateSync(user, "mail/passwordResetEmail", "email.reset.title");
    }

    private static String validateAndNormalizeClientBaseUrl(String rawUrl, boolean allowLocalhost) {
        if (rawUrl == null || rawUrl.isBlank()) {
            throw new IllegalStateException("djnd.client.base-url must be configured");
        }

        URI uri;
        try {
            uri = URI.create(rawUrl.trim());
        } catch (IllegalArgumentException exception) {
            throw new IllegalStateException("djnd.client.base-url must be a valid absolute URL", exception);
        }

        String scheme = uri.getScheme();
        String host = uri.getHost();
        if (scheme == null || host == null || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null) {
            throw new IllegalStateException("djnd.client.base-url must be an absolute HTTP(S) URL without credentials, query or fragment");
        }

        boolean localhost = isLocalhost(host);
        if (localhost && !allowLocalhost) {
            throw new IllegalStateException("djnd.client.base-url must not use localhost unless djnd.client.allow-localhost=true");
        }
        if (!"https".equalsIgnoreCase(scheme)
                && !(allowLocalhost && localhost && "http".equalsIgnoreCase(scheme))) {
            throw new IllegalStateException("djnd.client.base-url must use HTTPS; HTTP is allowed only for explicit localhost development");
        }

        return rawUrl.trim().replaceFirst("/+$", "");
    }

    private static boolean isLocalhost(String host) {
        return "localhost".equalsIgnoreCase(host)
                || "127.0.0.1".equals(host)
                || "::1".equals(host)
                || "0:0:0:0:0:0:0:1".equals(host);
    }




}
