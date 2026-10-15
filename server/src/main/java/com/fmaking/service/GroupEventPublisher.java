package com.fmaking.service;

import com.fmaking.service.dto.GroupRealtimeEvent;
import com.fmaking.service.event.GroupDomainEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.Instant;

@Service
public class GroupEventPublisher {

    private final Logger log = LoggerFactory.getLogger(GroupEventPublisher.class);
    private final ApplicationEventPublisher applicationEventPublisher;
    private final SimpMessagingTemplate messagingTemplate;

    public GroupEventPublisher(ApplicationEventPublisher applicationEventPublisher,
                               SimpMessagingTemplate messagingTemplate) {
        this.applicationEventPublisher = applicationEventPublisher;
        this.messagingTemplate = messagingTemplate;
    }

    public void publish(String eventType, Long groupId, Integer deadlineId, Integer schoolClassId, String actor, Object payload) {
        GroupRealtimeEvent event = GroupRealtimeEvent.builder()
            .eventType(eventType)
            .groupId(groupId)
            .deadlineId(deadlineId)
            .schoolClassId(schoolClassId)
            .actor(actor)
            .timestamp(Instant.now())
            .payload(payload)
            .build();

        applicationEventPublisher.publishEvent(new GroupDomainEvent(this, event));
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handleAfterCommit(GroupDomainEvent domainEvent) {
        GroupRealtimeEvent event = domainEvent.getRealtimeEvent();
        String destination = String.format("/topic/classes/%d/deadlines/%d/groups",
            event.getSchoolClassId(), event.getDeadlineId());
        log.info("Broadcasting realtime event [{}] to destination [{}] for group ID [{}]",
            event.getEventType(), destination, event.getGroupId());

        try {
            messagingTemplate.convertAndSend(destination, event);
        } catch (Exception e) {
            log.error("Failed to broadcast realtime event to {}", destination, e);
        }
    }
}
