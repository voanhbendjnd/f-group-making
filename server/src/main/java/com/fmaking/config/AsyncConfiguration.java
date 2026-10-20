package com.fmaking.config;


import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import java.util.concurrent.Executor;
// avc
@Configuration
@EnableAsync
public class AsyncConfiguration {
    @Bean(name = "notificationMailActivatedAccount")
    public Executor notificationSeatMaintenanceExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(10);
        executor.setMaxPoolSize(50);
        executor.setQueueCapacity(10000);
        executor.setThreadNamePrefix("notificationMail-");
        executor.initialize();
        return executor;
    }
}