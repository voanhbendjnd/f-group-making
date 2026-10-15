package com.fmaking.service;

import com.fmaking.domain.Deadline;
import com.fmaking.domain.SchoolClass;
import com.fmaking.repository.UserRepository;
import com.fmaking.service.dto.DeadlineRealtimeEvent;
import com.fmaking.service.event.DeadlineLifecycleEvent;
import java.time.Clock;
import java.util.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.event.*;

@Service
public class DeadlineEventPublisher {
    private final Logger log = LoggerFactory.getLogger(getClass());
    private final ApplicationEventPublisher events;
    private final SimpMessagingTemplate messaging;
    private final UserRepository users;
    private final Clock clock;

    public DeadlineEventPublisher(ApplicationEventPublisher events, SimpMessagingTemplate messaging,
                                  UserRepository users, Clock clock) {
        this.events = events;
        this.messaging = messaging;
        this.users = users;
        this.clock = clock;
    }

    // Snapshot lazy associations and recipients while the database transaction is open.
    public void publish(String type, Deadline deadline, Collection<SchoolClass> previousClasses) {
        Set<SchoolClass> classes = new HashSet<>(deadline.getSchoolClasses());
        classes.addAll(previousClasses);
        List<Integer> classIds = classes.stream().map(SchoolClass::getId).sorted().toList();
        List<Long> lecturerIds = classes.stream().map(SchoolClass::getLecturerId).filter(Objects::nonNull).distinct().toList();
        List<String> emails = users.findAllById(lecturerIds).stream().map(com.fmaking.domain.User::getEmail).toList();
        events.publishEvent(new DeadlineLifecycleEvent(new DeadlineRealtimeEvent(
            UUID.randomUUID().toString(), type, deadline.getId(), classIds,
            com.fmaking.domain.DeadlineStatus.resolve(deadline, clock.instant()),
            deadline.getStartTime(), deadline.getEndTime(), clock.instant(), deadline.getVersion()), emails));
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void broadcast(DeadlineLifecycleEvent event) {
        var message = event.message();
        List<String> destinations = new ArrayList<>();
        destinations.add("/topic/admin/deadlines");
        message.affectedClassIds().forEach(id -> destinations.add("/topic/classes/" + id + "/deadlines"));
        for (String destination : destinations) {
            try { messaging.convertAndSend(destination, message); }
            catch (Exception ex) { log.error("Could not broadcast deadline event to {}", destination, ex); }
        }
        for (String email : event.lecturerEmails()) {
            try { messaging.convertAndSendToUser(email, "/queue/deadlines", message); }
            catch (Exception ex) { log.error("Could not broadcast deadline event to lecturer", ex); }
        }
    }
}
