package com.fmaking.service;

import com.fmaking.domain.Deadline;
import com.fmaking.domain.GroupMemberRole;
import com.fmaking.domain.SchoolClass;
import com.fmaking.domain.User;
import com.fmaking.repository.DeadlineRepository;
import com.fmaking.repository.UserRepository;
import com.fmaking.service.dto.GroupDTO;
import com.fmaking.service.event.GroupReviewNotificationEvent;
import com.fmaking.service.event.GroupReviewNotificationEvent.Kind;
import com.fmaking.service.event.GroupReviewNotificationEvent.Member;
import com.fmaking.service.event.GroupReviewNotificationEvent.Recipient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
public class GroupReviewNotificationService {
    private static final Logger LOG = LoggerFactory.getLogger(GroupReviewNotificationService.class);
    private final UserRepository users;
    private final DeadlineRepository deadlines;
    private final ApplicationEventPublisher events;
    private final NotificationAsyncService notifications;
    private final Clock clock;

    public GroupReviewNotificationService(UserRepository users, DeadlineRepository deadlines,
            ApplicationEventPublisher events, NotificationAsyncService notifications, Clock clock) {
        this.users = users;
        this.deadlines = deadlines;
        this.events = events;
        this.notifications = notifications;
        this.clock = clock;
    }

    public void publish(Kind kind, GroupDTO group, SchoolClass schoolClass, String actorEmail) {
        Map<String, Recipient> recipients = new LinkedHashMap<>();
        if (kind == Kind.SUBMITTED) {
            if (schoolClass.getLecturerId() != null) {
                users.findById(schoolClass.getLecturerId()).ifPresent(user ->
                        addRecipient(recipients, user.getEmail(), user.getName()));
            }
        } else {
            group.getMembers().forEach(member -> addRecipient(recipients, member.getEmail(), member.getFullName()));
        }
        if (recipients.isEmpty()) {
            LOG.warn("No email recipients for group review {} (group {}, class {})", kind, group.getId(), schoolClass.getId());
            return;
        }
        List<Member> members = group.getMembers().stream()
                .map(member -> new Member(member.getFullName(), member.getRollNumber(), member.getRole() == GroupMemberRole.LEADER))
                .toList();
        String actorName = kind == Kind.SUBMITTED ? group.getLeaderName()
                : users.findOneByEmail(actorEmail).map(User::getName).orElse(actorEmail);
        String deadlineName = deadlines.findById(group.getDeadlineId()).map(Deadline::getName).orElse("");
        events.publishEvent(new GroupReviewNotificationEvent(kind, group.getId(), group.getName(), group.getDeadlineId(),
                deadlineName, schoolClass.getId(), schoolClass.getName(), schoolClass.getTermId(),
                actorName == null || actorName.isBlank() ? actorEmail : actorName,
                kind == Kind.REJECTED ? group.getRejectReason() : null,
                clock.instant(), members, List.copyOf(recipients.values())));
    }

    private static void addRecipient(Map<String, Recipient> recipients, String email, String name) {
        if (email == null || email.isBlank()) return;
        String normalized = email.trim().toLowerCase(Locale.ROOT);
        recipients.putIfAbsent(normalized, new Recipient(normalized, name == null || name.isBlank() ? normalized : name));
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onReviewCommitted(GroupReviewNotificationEvent event) {
        try {
            notifications.sendGroupReviewNotification(event);
        } catch (RuntimeException exception) {
            // A rejected async task must not report a committed group action as failed.
            LOG.error("Could not schedule {} notification for group {}", event.kind(), event.groupId(), exception);
        }
    }
}
