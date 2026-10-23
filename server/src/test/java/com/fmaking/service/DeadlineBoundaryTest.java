package com.fmaking.service;

import com.fmaking.domain.*;
import com.fmaking.repository.DeadlineRepository;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.mockito.Mockito.*;

class DeadlineBoundaryTest {
    @Test void restoringUnscheduledSessionsDoesNotCreateTimersOrFailOnMissingDates() {
        var repository = mock(DeadlineRepository.class);
        var events = mock(DeadlineBoundaryService.class);
        var scheduler = mock(org.springframework.scheduling.TaskScheduler.class);
        Deadline session = new Deadline(); session.setId(1); session.setStatus("UNSCHEDULED");
        SchoolClass schoolClass = new SchoolClass(); schoolClass.setId(2); session.getSchoolClasses().add(schoolClass);
        when(repository.findAll()).thenReturn(List.of(session));
        var service = new DeadlineScheduleService(scheduler, events, repository, Clock.systemUTC());
        service.restore();
        verifyNoInteractions(scheduler, events);
        service.close();
    }

    @Test void classBoundariesUseTheClassOverrideAndPublishOnlyThatClass() {
        var repository = mock(DeadlineRepository.class);
        var events = mock(DeadlineEventPublisher.class);
        Instant now = Instant.parse("2026-10-16T00:00:00Z");
        var service = new DeadlineBoundaryService(repository, new DeadlinePolicy(Clock.fixed(now, ZoneOffset.UTC)), events);
        Deadline deadline = new Deadline(); deadline.setStartTime(now.minusSeconds(60)); deadline.setEndTime(now.minusSeconds(1));
        SchoolClass a = new SchoolClass(); a.setId(1); SchoolClass b = new SchoolClass(); b.setId(2);
        deadline.getSchoolClasses().addAll(List.of(a, b));
        DeadlineClassWindow extended = new DeadlineClassWindow(); extended.setSchoolClassId(2); extended.setDeadlineId(3);
        extended.setEndTimeOverride(now.plusSeconds(3600)); deadline.getClassWindows().add(extended);
        when(repository.findForShare(3)).thenReturn(Optional.of(deadline));
        service.announceClass(3, 2, 0, DeadlineStatus.EXPIRED);
        verifyNoInteractions(events);
        service.announceClass(3, 1, 0, DeadlineStatus.EXPIRED);
        verify(events).publishForClasses("DEADLINE_EXPIRED", deadline, List.of(1));
    }
    @Test void staleJobsCannotExpireAnExtendedOrCancelledDeadline() {
        var repository = mock(DeadlineRepository.class);
        var events = mock(DeadlineEventPublisher.class);
        Instant now = Instant.parse("2026-10-16T00:00:00Z");
        var service = new DeadlineBoundaryService(repository, new DeadlinePolicy(Clock.fixed(now, ZoneOffset.UTC)), events);
        Deadline d = new Deadline(); d.setStartTime(now.minusSeconds(60)); d.setEndTime(now.plusSeconds(3600));
        when(repository.findForShare(1)).thenReturn(Optional.of(d));
        service.announce(1, 0, DeadlineStatus.EXPIRED); // Former end time, now extended.
        service.announce(1, 1, DeadlineStatus.ACTIVE); // Wrong version.
        d.setStatus("CANCELLED");
        service.announce(1, 0, DeadlineStatus.ACTIVE);
        verifyNoInteractions(events);
        d.setStatus("ACTIVE"); d.setEndTime(now);
        service.announce(1, 0, DeadlineStatus.EXPIRED);
        verify(events).publish("DEADLINE_EXPIRED", d, List.of());
    }
}
