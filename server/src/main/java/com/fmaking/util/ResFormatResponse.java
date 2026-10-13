package com.fmaking.util;


import org.springframework.core.MethodParameter;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpResponse;
import org.springframework.lang.NonNull;
import org.springframework.lang.Nullable;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;


import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.io.support.ResourceRegion;
import com.fmaking.util.anotation.ApiMessage;

import java.util.Collection;

@ControllerAdvice
public class ResFormatResponse implements ResponseBodyAdvice<Object> {

    @Override
    public boolean supports(@NonNull MethodParameter returnType, Class converterType) {
        return true;
    }

    @Override
    public Object beforeBodyWrite(@Nullable Object body, @NonNull MethodParameter returnType,
                                  @NonNull MediaType selectedContentType,
                                  Class selectedConverterType, @NonNull ServerHttpRequest request, @NonNull ServerHttpResponse response) {

        String path = request.getURI().getPath();

        if (path.startsWith("/v3/api-docs") || path.startsWith("/swagger-ui")
                || path.startsWith("/swagger-resources")) {
            return body;
        }

        HttpServletResponse servletResponse = ((ServletServerHttpResponse) response).getServletResponse();
        int status = servletResponse.getStatus();

        if (body instanceof String || body instanceof Resource || body instanceof ResourceRegion) {
            return body;
        }
        if (body instanceof byte[]) {
            return body;
        }

        if (body instanceof Collection) {
            Collection<?> collection = (Collection<?>) body;
            if (!collection.isEmpty() && collection.iterator().next() instanceof ResourceRegion) {
                return body;
            }
        }

        if (status >= 400) {
            return body;
        } else {
            RestResponse<Object> res = new RestResponse<>();
            res.setStatusCode(status);
            res.setData(body);
            ApiMessage message = returnType.getMethodAnnotation(ApiMessage.class);
            res.setMessage(message != null ? message.value() : "Call API success!");
            return res;
        }
    }

}