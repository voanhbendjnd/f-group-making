package com.fmaking.config;


import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;
import com.fmaking.security.UserNotActivatedException;

import java.io.IOException;
/*
 * This method called when request must include token (anyAuthenticated), but not found token or token expired
 * Return 401
 * BadCredential -> through this class
 * */
@Component
public class SmartAuthenticationEntryPoint implements AuthenticationEntryPoint {

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response, AuthenticationException authException) throws IOException, ServletException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json");
        response.setCharacterEncoding("UTF-8");

        String message = "(Session expired) Please login to access this resource";
        String code = "UNAUTHORIZED";
        boolean redirect = true;
        String redirectUrl = "/login";
        Throwable rootCause = authException.getCause();
        if(rootCause instanceof UserNotActivatedException) {
            message = rootCause.getMessage();
            code = "USER_NOT_ACTIVATED";
            redirectUrl = "/verify-account";
        }
        String errorMessage = String.format("""
        {
            "error": "Unauthorized",
            "message": "%s",
            "code": "%s",
            "publicApi": false,
            "redirect": %b,
            "redirectUrl": "%s"
        }
        """, message, code, redirect, redirectUrl);
        response.getWriter().print(errorMessage);
    }
}