package tech.djnd.sample.app.service;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.Setter;
import lombok.experimental.FieldDefaults;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tech.djnd.sample.app.service.dto.UserDTO;

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
}
