package com.fmaking.service;

import com.fmaking.domain.Deadline;
import com.fmaking.domain.DeadlineStatus;
import com.fmaking.web.rest.errors.ConflictAlertException;
import java.time.Clock;
import org.springframework.stereotype.Component;

@Component
public class DeadlinePolicy {
    private final Clock clock;
    public DeadlinePolicy(Clock clock) { this.clock = clock; }

    public DeadlineStatus status(Deadline deadline) {
        return DeadlineStatus.resolve(deadline, clock.instant());
    }

    public void requireNotCancelled(Deadline deadline) {
        if (status(deadline) == DeadlineStatus.CANCELLED) {
            throw new ConflictAlertException("Đợt chọn nhóm đã bị hủy.", "deadline", "ERR_DEADLINE_CANCELLED");
        }
    }

    public void requireStudentWrite(Deadline deadline) {
        requireNotCancelled(deadline);
        switch (status(deadline)) {
            case UPCOMING -> throw new ConflictAlertException("Đợt chọn nhóm chưa bắt đầu.", "deadline", "ERR_DEADLINE_NOT_STARTED");
            case EXPIRED -> throw new ConflictAlertException("Hạn chót chọn nhóm đã kết thúc.", "deadline", "ERR_DEADLINE_EXPIRED");
            default -> { }
        }
    }
}
