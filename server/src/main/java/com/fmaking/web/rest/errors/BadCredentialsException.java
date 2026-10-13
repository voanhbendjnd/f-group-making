package com.fmaking.web.rest.errors;


import org.zalando.problem.AbstractThrowableProblem;
import org.zalando.problem.Status;

import java.io.Serial;
import java.net.URI;

public class BadCredentialsException extends AbstractThrowableProblem {
    @Serial
    private static final long serialVersionUID = 1L;
    public BadCredentialsException() {
        super(URI.create("/invalid-password"), "Unauthorized", Status.UNAUTHORIZED, "Incorrect username or password");

    }
}