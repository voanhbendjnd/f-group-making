package com.fmaking.service.event;

import com.fmaking.service.dto.DeadlineRealtimeEvent;
import java.util.List;

public record DeadlineLifecycleEvent(DeadlineRealtimeEvent message, List<String> lecturerEmails) { }
