package com.fmaking.config;

import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

@Configuration
public class DeadlineTimeConfiguration {
    @Bean
    public Clock deadlineClock() { return Clock.systemUTC(); }

    @Bean(name = {"deadlineTaskScheduler", "taskScheduler"})
    public ThreadPoolTaskScheduler deadlineTaskScheduler() {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(2);
        scheduler.setThreadNamePrefix("deadline-boundary-");
        scheduler.setRemoveOnCancelPolicy(true);
        return scheduler;
    }
}
