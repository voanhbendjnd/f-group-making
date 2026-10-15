package com.fmaking.service;

import com.fmaking.domain.DeadlineStatus;
import com.fmaking.repository.DeadlineRepository;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DeadlineBoundaryService {
    private final DeadlineRepository deadlines;
    private final DeadlinePolicy policy;
    private final DeadlineEventPublisher events;

    public DeadlineBoundaryService(DeadlineRepository deadlines, DeadlinePolicy policy, DeadlineEventPublisher events) {
        this.deadlines = deadlines;
        this.policy = policy;
        this.events = events;
    }

    @Transactional
    public void announce(Integer id, long version, DeadlineStatus expected) {
        deadlines.findForShare(id).ifPresent(deadline -> {
            if (deadline.getVersion() == version && policy.status(deadline) == expected) {
                events.publish(expected == DeadlineStatus.ACTIVE ? "DEADLINE_STARTED" : "DEADLINE_EXPIRED", deadline, List.of());
            }
        });
    }
}
