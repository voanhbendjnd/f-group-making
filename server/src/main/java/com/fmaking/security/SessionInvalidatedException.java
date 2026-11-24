package com.fmaking.security;

import org.springframework.security.authentication.BadCredentialsException;

public class SessionInvalidatedException extends BadCredentialsException {
    public static final String DEFAULT_MESSAGE = "SESSION_TERMINATED_CONCURRENT_LOGIN";

    public SessionInvalidatedException() {
        super(DEFAULT_MESSAGE);
    }

    public SessionInvalidatedException(String msg) {
        super(msg);
    }
}
