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
    private final Map<Integer, List<ScheduledFuture<?>>> tasks = new HashMap<>();
    private final Map<Integer, Long> versions = new HashMap<>();

    public DeadlineScheduleService(@org.springframework.beans.factory.annotation.Qualifier("deadlineTaskScheduler") TaskScheduler scheduler, DeadlineBoundaryService boundaries,
                                   DeadlineRepository deadlines, Clock clock) {
        this.scheduler = scheduler;
        this.boundaries = boundaries;
        this.deadlines = deadlines;
        this.clock = clock;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void restore() {
        deadlines.findAll().forEach(d -> schedule(d.getId(), d.getVersion(), d.getStartTime(), d.getEndTime(),
            DeadlineStatus.resolve(d, clock.instant())));
    }

    @TransactionalEventListener
    public void changed(DeadlineLifecycleEvent event) {
        var message = event.message();
        if (Set.of("DEADLINE_CREATED", "DEADLINE_UPDATED", "DEADLINE_EXTENDED", "DEADLINE_CANCELLED").contains(message.eventType())) {
            schedule(message.deadlineId(), message.version(), message.startTime(), message.endTime(), message.status());
        }
    }

    private synchronized void schedule(Integer id, long version, Instant start, Instant end, DeadlineStatus status) {
        if (versions.getOrDefault(id, -1L) > version) return;
        versions.put(id, version);
        tasks.getOrDefault(id, List.of()).forEach(task -> task.cancel(false));
        tasks.remove(id);
        if (status == DeadlineStatus.CANCELLED || status == DeadlineStatus.EXPIRED) return;
        List<ScheduledFuture<?>> scheduled = new ArrayList<>();
        if (start.isAfter(clock.instant())) {
            scheduled.add(scheduler.schedule(() -> boundaries.announce(id, version, DeadlineStatus.ACTIVE), start));
        }
        scheduled.add(scheduler.schedule(() -> boundaries.announce(id, version, DeadlineStatus.EXPIRED), end));
        tasks.put(id, scheduled);
    }

    @PreDestroy
    public synchronized void close() { tasks.values().forEach(list -> list.forEach(task -> task.cancel(false))); }
}
