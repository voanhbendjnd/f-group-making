package com.fmaking.service.errors;

import com.fmaking.web.rest.errors.BadRequestAlertException;
import com.fmaking.web.rest.errors.ErrorConstants;

import java.io.Serial;
/*
* 400
* */
public class BadRequestResourceException extends BadRequestAlertException {
    @Serial
    private static final long serialVersionUID = 1L;
    public  BadRequestResourceException(String message, String entityName, String errorKey){
        super(ErrorConstants.BAD_REQUEST_TYPE, message, entityName, errorKey);
    }
}
