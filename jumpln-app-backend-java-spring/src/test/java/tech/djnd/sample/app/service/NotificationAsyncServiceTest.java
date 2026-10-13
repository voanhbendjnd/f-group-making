package tech.djnd.sample.app.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import tech.djnd.sample.app.service.dto.UserDTO;

import java.util.List;

import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class NotificationAsyncServiceTest {

    @Mock
    private MailService mailService;

    @Test
    void batchUsesSynchronousMailWorkInsideTheDedicatedBatchExecutor() {
        UserDTO firstUser = user("first@example.com");
        UserDTO secondUser = user("second@example.com");
        NotificationAsyncService service = new NotificationAsyncService(mailService);

        service.sendMailActivatedAccount(List.of(firstUser, secondUser));

        verify(mailService).sendActivationEmailSync(firstUser);
        verify(mailService).sendActivationEmailSync(secondUser);
    }

    private UserDTO user(String email) {
        UserDTO user = new UserDTO();
        user.setEmail(email);
        return user;
    }
}
