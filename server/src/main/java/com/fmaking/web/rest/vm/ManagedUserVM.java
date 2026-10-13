package com.fmaking.web.rest.vm;

import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;
import com.fmaking.service.dto.UserDTO;

public class ManagedUserVM extends UserDTO {
    public static final int PASSWORD_MIN_LENGTH = 4;

    public static final int PASSWORD_MAX_LENGTH = 100;

    @Size(min = PASSWORD_MIN_LENGTH, max = PASSWORD_MAX_LENGTH)
    private String password;

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }
}