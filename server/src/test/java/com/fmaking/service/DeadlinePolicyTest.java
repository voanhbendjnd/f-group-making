package com.fmaking.service;

import com.fmaking.domain.*;
import com.fmaking.web.rest.errors.ConflictAlertException;
import java.time.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class DeadlinePolicyTest {
    private final Instant start = Instant.parse("2026-10-16T00:00:00Z");
    private final Instant end = start.plusSeconds(3600);
    private Deadline deadline() {
        Deadline d = new Deadline(); d.setStatus("ACTIVE"); d.setStartTime(start); d.setEndTime(end); return d;
    }
    private DeadlinePolicy at(Instant time) { return new DeadlinePolicy(Clock.fixed(time, ZoneOffset.UTC)); }

    @Test void boundariesHaveNoGapAndEndIsExclusive() {
        Deadline d = deadline();
        assertThat(at(start.minusNanos(1)).status(d)).isEqualTo(DeadlineStatus.UPCOMING);
        assertThat(at(start).status(d)).isEqualTo(DeadlineStatus.ACTIVE);
        assertThatCode(() -> at(start).requireStudentWrite(d)).doesNotThrowAnyException();
        assertThat(at(end).status(d)).isEqualTo(DeadlineStatus.EXPIRED);
        assertThatThrownBy(() -> at(end).requireStudentWrite(d)).isInstanceOf(ConflictAlertException.class);
    }
    @Test void legacyCancelledIsClosedUntilExplicitReopen() {
        Deadline d = deadline(); d.setStatus("CANCELLED");
        for (Instant time : new Instant[] {start.minusSeconds(1), start, end, end.plusSeconds(1)}) {
            assertThat(at(time).status(d)).isEqualTo(DeadlineStatus.EXPIRED);
            assertThatThrownBy(() -> at(time).requireStudentWrite(d)).isInstanceOf(ConflictAlertException.class);
            assertThatCode(() -> at(time).requireNotCancelled(d)).doesNotThrowAnyException();
        }
    }
    @Test void managementCanReviewExpiredButStudentsCannotWriteBeforeStart() {
        assertThatCode(() -> at(end).requireNotCancelled(deadline())).doesNotThrowAnyException();
        assertThatThrownBy(() -> at(start.minusSeconds(1)).requireStudentWrite(deadline()))
            .isInstanceOf(ConflictAlertException.class);
    }
}
