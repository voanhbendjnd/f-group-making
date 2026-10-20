package com.fmaking.service.errors;

import com.fmaking.web.rest.errors.ErrorConstants;
import com.fmaking.web.rest.errors.ForbiddenAlertException;

import java.io.Serial;
/*
* 403
* */
public class AccessDeniedException extends ForbiddenAlertException {
    @Serial
    private static final long serialVersionUID = 1L;

    public AccessDeniedException(String resourceNotAllowed) {
        super(ErrorConstants.ACCESS_DENIED, "You do not have access", resourceNotAllowed, "donotpermission");
    }
}
