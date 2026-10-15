package com.fmaking.security;

import com.fmaking.config.CustomJwtAuthenticationConverter;
import com.fmaking.repository.*;
import java.util.Objects;
import java.util.regex.Pattern;
import org.springframework.messaging.*;
import org.springframework.messaging.simp.stomp.*;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class RealtimeChannelInterceptor implements ChannelInterceptor {
    private static final Pattern CLASS_TOPIC = Pattern.compile("^/topic/classes/(\\d+)/deadlines(?:/(\\d+)/groups)?$");
    private final JwtDecoder decoder;
    private final CustomJwtAuthenticationConverter converter;
    private final UserRepository users;
    private final StudentRepository students;
    private final SchoolClassRepository classes;
    private final DeadlineRepository deadlines;

    public RealtimeChannelInterceptor(JwtDecoder decoder, CustomJwtAuthenticationConverter converter,
            UserRepository users, StudentRepository students, SchoolClassRepository classes, DeadlineRepository deadlines) {
        this.decoder = decoder;
        this.converter = converter;
        this.users = users;
        this.students = students;
        this.classes = classes;
        this.deadlines = deadlines;
    }

    @Override
    @Transactional(readOnly = true)
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        var headers = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (headers == null || headers.getCommand() == null) return message;
        if (headers.getCommand() == StompCommand.CONNECT) {
            String authorization = headers.getFirstNativeHeader("Authorization");
            if (authorization == null || !authorization.startsWith("Bearer ")) throw denied();
            var jwt = decoder.decode(authorization.substring(7));
            var user = users.findOneByEmail(jwt.getSubject()).orElseThrow(RealtimeChannelInterceptor::denied);
            if (!Boolean.TRUE.equals(user.getActivated())) throw denied();
            headers.setUser(new JwtAuthenticationToken(jwt, converter.convert(jwt), jwt.getSubject()));
        } else if (headers.getCommand() == StompCommand.SUBSCRIBE) {
            if (!(headers.getUser() instanceof JwtAuthenticationToken authentication)) throw denied();
            if (authentication.getToken().getExpiresAt() == null || !authentication.getToken().getExpiresAt().isAfter(java.time.Instant.now())) throw denied();
            String destination = headers.getDestination();
            boolean admin = has(authentication, AuthoritiesConstants.ADMIN);
            boolean master = has(authentication, AuthoritiesConstants.LECTURE_MASTER);
            boolean lecturer = has(authentication, AuthoritiesConstants.LECTURE);
            if ("/topic/admin/deadlines".equals(destination)) {
                if (!admin) throw denied();
            } else if ("/user/queue/deadlines".equals(destination)) {
                if (!admin && !master && !lecturer) throw denied();
            } else {
                var match = CLASS_TOPIC.matcher(destination == null ? "" : destination);
                if (!match.matches()) throw denied();
                Integer classId = Integer.valueOf(match.group(1));
                var schoolClass = classes.findById(classId).orElseThrow(RealtimeChannelInterceptor::denied);
                var user = users.findOneByEmail(authentication.getName()).orElseThrow(RealtimeChannelInterceptor::denied);
                if (!admin && !master) {
                    if (lecturer) {
                        if (!Objects.equals(schoolClass.getLecturerId(), user.getId())) throw denied();
                    } else if (!has(authentication, AuthoritiesConstants.STUDENT)
                        || students.findById(user.getId()).filter(s -> Objects.equals(s.getSchoolClassId(), classId)).isEmpty()) throw denied();
                }
                if (match.group(2) != null && deadlines.countByDeadlineIdAndClassId(Integer.valueOf(match.group(2)), classId) == 0) throw denied();
            }
        } else if (headers.getCommand() == StompCommand.SEND) {
            // Domain writes use REST. Clients cannot publish forged broker notifications.
            throw denied();
        }
        return message;
    }

    private static boolean has(JwtAuthenticationToken user, String role) {
        return user.getAuthorities().stream().anyMatch(a -> role.equals(a.getAuthority()));
    }
    private static AccessDeniedException denied() { return new AccessDeniedException("Realtime destination access denied"); }
}
