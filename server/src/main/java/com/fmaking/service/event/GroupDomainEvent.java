package com.fmaking.service.event;

import com.fmaking.service.dto.GroupRealtimeEvent;
import lombok.Getter;
import org.springframework.context.ApplicationEvent;

@Getter
public class GroupDomainEvent extends ApplicationEvent {
    private final GroupRealtimeEvent realtimeEvent;

    public GroupDomainEvent(Object source, GroupRealtimeEvent realtimeEvent) {
        super(source);
        this.realtimeEvent = realtimeEvent;
    }
}
