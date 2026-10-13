package com.fmaking.service;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.Setter;
import lombok.experimental.FieldDefaults;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.fmaking.service.dto.UserDTO;

import java.util.List;

@Slf4j
@Service
public class NotificationAsyncService {
   private final MailService mailService;
    public NotificationAsyncService(MailService mailService) {
        this.mailService = mailService;
    }
    @Transactional
    @Async("notificationMailActivatedAccount")
    public void sendMailActivatedAccount(List<UserDTO> users){
        users.forEach(user -> {
            try{
                mailService.sendActivationEmailSync(user);
            }
            catch(Exception e){
                log.error("Failed to process activation email for user {}", user.getEmail(), e);
            }
        });
    }

    private static final java.time.format.DateTimeFormatter DATE_TIME_FORMATTER =
            java.time.format.DateTimeFormatter.ofPattern("HH:mm dd/MM/yyyy")
                    .withZone(java.time.ZoneId.of("Asia/Ho_Chi_Minh"));

    @Async
    public void sendDeadlineNotificationBatch(com.fmaking.domain.Deadline deadline, List<com.fmaking.service.dto.StudentDeadlineRow> students) {
        if (students == null || students.isEmpty() || deadline == null) {
            return;
        }
        String startTimeStr = DATE_TIME_FORMATTER.format(deadline.getStartTime());
        String endTimeStr = DATE_TIME_FORMATTER.format(deadline.getEndTime());
        String clientBaseUrl = mailService.getClientBaseUrl();

        for (com.fmaking.service.dto.StudentDeadlineRow student : students) {
            try {
                String targetUrl = String.format("%s/student/groups/select?deadlineId=%d&classId=%d",
                        clientBaseUrl, deadline.getId(), student.schoolClassId());
                mailService.sendDeadlineEmailSync(
                        student.email(),
                        student.fullName(),
                        deadline.getName(),
                        deadline.getDescription(),
                        startTimeStr,
                        endTimeStr,
                        targetUrl
                );
            } catch (Exception e) {
                log.error("Failed to send deadline notification email to student {} ({})", student.email(), student.userId(), e);
            }
        }
    }
}
