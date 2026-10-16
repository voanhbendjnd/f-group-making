package com.fmaking.service;

import com.fmaking.domain.DeadlineStatus;
import com.fmaking.repository.DeadlineRepository;
import com.fmaking.service.dto.*;
import com.fmaking.service.event.DeadlineLifecycleEvent;
import java.time.*;
import java.util.*;
import java.util.concurrent.ScheduledFuture;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.scheduling.TaskScheduler;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class DeadlineClassScheduleTest {
    @Test void changingOneClassReschedulesUnchangedClassesAgainstTheNewAggregateVersion() {
        Instant now = Instant.parse("2026-10-16T00:00:00Z");
        TaskScheduler scheduler = mock(TaskScheduler.class);
        DeadlineBoundaryService boundaries = mock(DeadlineBoundaryService.class);
        ScheduledFuture<?> job = mock(ScheduledFuture.class);
        doReturn(job).when(scheduler).schedule(any(Runnable.class), any(Instant.class));
        var service = new DeadlineScheduleService(scheduler, boundaries, mock(DeadlineRepository.class), Clock.fixed(now, ZoneOffset.UTC));
        List<DeadlineClassDTO> windows = List.of(
            new DeadlineClassDTO(1, "A", now.minusSeconds(60), now.plusSeconds(3600), DeadlineStatus.ACTIVE, false),
            new DeadlineClassDTO(2, "B", now.minusSeconds(60), now.plusSeconds(7200), DeadlineStatus.ACTIVE, false));
        for (long version : List.of(1L, 2L)) {
            service.changed(new DeadlineLifecycleEvent(new DeadlineRealtimeEvent("e" + version, "DEADLINE_EXTENDED", 8,
                List.of(1), DeadlineStatus.ACTIVE, now.minusSeconds(60), now.plusSeconds(3600), now, version, windows), List.of()));
        }
        ArgumentCaptor<Runnable> tasks = ArgumentCaptor.forClass(Runnable.class);
        verify(scheduler, times(4)).schedule(tasks.capture(), any(Instant.class));
        tasks.getAllValues().getLast().run();
        verify(boundaries).announceClass(8, 2, 2, DeadlineStatus.EXPIRED);
        verify(job, times(2)).cancel(false);
        service.close();
    }
}
