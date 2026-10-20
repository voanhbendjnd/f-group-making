package com.fmaking.service;

import com.fmaking.domain.DeadlineStatus;
import com.fmaking.repository.DeadlineRepository;
import com.fmaking.service.event.DeadlineLifecycleEvent;
import jakarta.annotation.PreDestroy;
import java.time.Clock;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.stereotype.Service;
import org.springframework.transaction.event.TransactionalEventListener;

@Service
public class DeadlineScheduleService {
    private final TaskScheduler scheduler;
    private final DeadlineBoundaryService boundaries;
    private final DeadlineRepository deadlines;
    private final Clock clock;
    private final Map<String, List<ScheduledFuture<?>>> tasks = new HashMap<>();
    private final Map<String, Long> versions = new HashMap<>();

    public DeadlineScheduleService(@org.springframework.beans.factory.annotation.Qualifier("deadlineTaskScheduler") TaskScheduler scheduler, DeadlineBoundaryService boundaries,
                                   DeadlineRepository deadlines, Clock clock) {
        this.scheduler = scheduler;
        this.boundaries = boundaries;
        this.deadlines = deadlines;
        this.clock = clock;
    }

    @EventListener(ApplicationReadyEvent.class)
    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public void restore() {
        deadlines.findAll().forEach(d -> d.getSchoolClasses().forEach(c ->
            schedule(d.getId(), c.getId(), d.getVersion(), d.getStartTime(), d.endTimeFor(c.getId()),
                DeadlineStatus.resolve(d, c.getId(), clock.instant()))));
    }

    @TransactionalEventListener
    public void changed(DeadlineLifecycleEvent event) {
        var message = event.message();
        if (Set.of("DEADLINE_CREATED", "DEADLINE_UPDATED", "DEADLINE_EXTENDED", "DEADLINE_REOPENED", "DEADLINE_CLOSED", "DEADLINE_CANCELLED").contains(message.eventType())) {
            // Reschedule unchanged classes too: their jobs must use the new aggregate version.
            message.classWindows().forEach(w -> schedule(message.deadlineId(), w.schoolClassId(), message.version(),
                w.startTime(), w.endTime(), w.status()));
        }
    }

    private synchronized void schedule(Integer id, Integer classId, long version, Instant start, Instant end, DeadlineStatus status) {
        String key = id + ":" + classId;
        if (versions.getOrDefault(key, -1L) > version) return;
        versions.put(key, version);
        tasks.getOrDefault(key, List.of()).forEach(task -> task.cancel(false));
        tasks.remove(key);
        if (status == DeadlineStatus.CANCELLED || status == DeadlineStatus.EXPIRED) return;
        List<ScheduledFuture<?>> scheduled = new ArrayList<>();
        if (start.isAfter(clock.instant())) {
            scheduled.add(scheduler.schedule(() -> boundaries.announceClass(id, classId, version, DeadlineStatus.ACTIVE), start));
        }
        scheduled.add(scheduler.schedule(() -> boundaries.announceClass(id, classId, version, DeadlineStatus.EXPIRED), end));
        tasks.put(key, scheduled);
    }

    @PreDestroy
    public synchronized void close() { tasks.values().forEach(list -> list.forEach(task -> task.cancel(false))); }
}
