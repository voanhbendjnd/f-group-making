package com.fmaking.service;

import com.fmaking.domain.*;
import com.fmaking.repository.DeadlineRepository;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.mockito.Mockito.*;

class DeadlineBoundaryTest {
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
