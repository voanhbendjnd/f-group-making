package com.fmaking.service;

import com.fmaking.domain.Deadline;
import com.fmaking.repository.DeadlineRepository;
import com.fmaking.repository.StudentRepository;
import com.fmaking.service.dto.DeadlineCreatedEvent;
import com.fmaking.service.dto.StudentDeadlineRow;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.*;

@Slf4j
@Component
public class DeadlineNotificationEventListener {

    private final DeadlineRepository deadlineRepository;
    private final StudentRepository studentRepository;
    private final NotificationAsyncService notificationAsyncService;

    public DeadlineNotificationEventListener(
            DeadlineRepository deadlineRepository,
            StudentRepository studentRepository,
            NotificationAsyncService notificationAsyncService
    ) {
        this.deadlineRepository = deadlineRepository;
        this.studentRepository = studentRepository;
        this.notificationAsyncService = notificationAsyncService;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handleDeadlineCreated(DeadlineCreatedEvent event) {
        log.info("Handling DeadlineCreatedEvent after transaction commit for deadlineId: {}", event.deadlineId());
        Optional<Deadline> deadlineOpt = deadlineRepository.findById(event.deadlineId());
        if (deadlineOpt.isEmpty()) {
            log.warn("Deadline with id {} not found after commit", event.deadlineId());
            return;
        }
        Deadline deadline = deadlineOpt.get();

        if (event.schoolClassIds() == null || event.schoolClassIds().isEmpty()) {
            log.info("No school class IDs associated with deadline {}", event.deadlineId());
            return;
        }

        List<StudentDeadlineRow> rawStudents = studentRepository.findStudentDeadlineRowsBySchoolClassIdIn(event.schoolClassIds());
        if (rawStudents.isEmpty()) {
            log.info("No students found in classes {} for deadline {}", event.schoolClassIds(), event.deadlineId());
            return;
        }

        // Deduplicate students by userId to avoid multiple emails if a student is registered in multiple classes
        Map<Long, StudentDeadlineRow> distinctByUserId = new LinkedHashMap<>();
        for (StudentDeadlineRow student : rawStudents) {
            distinctByUserId.putIfAbsent(student.userId(), student);
        }

        List<StudentDeadlineRow> distinctStudents = new ArrayList<>(distinctByUserId.values());
        log.info("Triggering async email notifications for {} distinct students across classes {}",
                distinctStudents.size(), event.schoolClassIds());
        notificationAsyncService.sendDeadlineNotificationBatch(deadline, distinctStudents);
    }
}
