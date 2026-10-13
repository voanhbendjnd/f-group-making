package tech.djnd.sample.app.web.rest.vm;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.util.List;

public class MulUserId {
    @NotEmpty(message = "User IDs must not be empty")
    private List<
            @NotNull(message = "User ID must not be null")
            @Positive(message = "User ID must be positive")
            Long> userIds;

    public List<Long> getUserIds() {
        return userIds;
    }

    public void setUserIds(List<Long> userIds) {
        this.userIds = userIds;
    }
}
