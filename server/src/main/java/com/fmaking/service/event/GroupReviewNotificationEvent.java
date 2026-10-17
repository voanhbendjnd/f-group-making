package com.fmaking.service.event;

import java.time.Instant;
import java.util.List;

/** Immutable mail data captured inside the group transaction, without JPA entities. */
public record GroupReviewNotificationEvent(
        Kind kind,
        Long groupId,
        String groupName,
        Integer deadlineId,
        String deadlineName,
        Integer classId,
        String className,
        Integer termId,
        String actorName,
        String reason,
        Instant occurredAt,
        List<Member> members,
        List<Recipient> recipients
) {
    public GroupReviewNotificationEvent {
        members = List.copyOf(members);
        recipients = List.copyOf(recipients);
    }

    public enum Kind { SUBMITTED, ACCEPTED, REJECTED }
    public record Member(String fullName, String rollNumber, boolean leader) {}
    public record Recipient(String email, String name) {}
}
