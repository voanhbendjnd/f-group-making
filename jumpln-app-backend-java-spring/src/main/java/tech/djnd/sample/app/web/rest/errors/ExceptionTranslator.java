package tech.djnd.sample.app.web.rest.errors;


import javax.annotation.Nullable;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.context.request.NativeWebRequest;
import org.zalando.problem.DefaultProblem;
import org.zalando.problem.Problem;
import org.zalando.problem.ProblemBuilder;
import org.zalando.problem.spring.web.advice.ProblemHandling;
import org.zalando.problem.spring.web.advice.security.SecurityAdviceTrait;
import org.zalando.problem.violations.ConstraintViolationProblem;
import tech.djnd.sample.app.service.errors.EmailAlreadyUsedException;
import tech.djnd.sample.app.service.errors.SessionInvalidException;
import tech.jhipster.web.util.HeaderUtil;


@ControllerAdvice
public class ExceptionTranslator implements ProblemHandling, SecurityAdviceTrait {
    private static final String FIELD_ERRORS_KEY = "fieldErrors";
    private static final String MESSAGE_KEY = "message";
    private static final String PATH_KEY = "path";
    private static final String VIOLATIONS_KEY = "violations";

    @Value("${djnd.app.name}")
    private String applicationName;

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Problem> handleDataConflict(DataIntegrityViolationException ex, NativeWebRequest request) {
        // A concurrent import/update can pass validation before a unique/FK constraint changes.
        return create(new ConflictAlertException(
                "Data changed or conflicts with an existing record. Reload and retry the request.",
                "data", "dataconflict"), request);
    }
    @Override
    public ResponseEntity<Problem> process(@Nullable ResponseEntity<Problem> entity, NativeWebRequest request) {
        if (entity == null) {
            return entity;
        }

        jakarta.servlet.http.HttpServletRequest nativeRequest = request.getNativeRequest(jakarta.servlet.http.HttpServletRequest.class);
        if (nativeRequest == null) {
            return entity;
        }

        Problem problem = entity.getBody();
        if (!(problem instanceof ConstraintViolationProblem || problem instanceof DefaultProblem)) {
            return entity;
        }
        ProblemBuilder builder = Problem
                .builder()
                .withType(Problem.DEFAULT_TYPE.equals(problem.getType()) ? ErrorConstants.DEFAULT_TYPE : problem.getType())
                .withStatus(problem.getStatus())
                .withTitle(problem.getTitle())
                .with(PATH_KEY, nativeRequest.getRequestURI());

        if (problem instanceof ConstraintViolationProblem) {
            builder
                    .with(VIOLATIONS_KEY, ((ConstraintViolationProblem) problem).getViolations())
                    .with(MESSAGE_KEY, ErrorConstants.ERR_VALIDATION);
        } else {
            builder.withCause(((DefaultProblem) problem).getCause()).withDetail(problem.getDetail()).withInstance(problem.getInstance());
            problem.getParameters().forEach(builder::with);
            if (!problem.getParameters().containsKey(MESSAGE_KEY) && problem.getStatus() != null) {
                builder.with(MESSAGE_KEY, "error.http." + problem.getStatus().getStatusCode());
            }
        }
        return new ResponseEntity<>(builder.build(), entity.getHeaders(), entity.getStatusCode());
    }
    @ExceptionHandler
    public ResponseEntity<Problem> handleLoginAlreadyUsedException(LoginAlreadyUsedException ex, NativeWebRequest request) {
        LoginAlreadyUsedException problem = new LoginAlreadyUsedException();
        return create(
                problem,
                request,
                HeaderUtil.createFailureAlert(applicationName, false, problem.getEntityName(), problem.getErrorKey(), problem.getMessage())
        );
    }

    @ExceptionHandler
    public ResponseEntity<Problem> handleEmailAlreadyUsedException(EmailAlreadyUsedException ex, NativeWebRequest request) {
        EmailAlreadyUsedException problem = new EmailAlreadyUsedException();
        return create(
                problem,
                request,
                HeaderUtil.createFailureAlert(applicationName, false, problem.getEntityName(), problem.getErrorKey(), problem.getMessage())
        );
    }
    @ExceptionHandler
    public ResponseEntity<Problem> handleSessionInvalidException(SessionInvalidException ex, NativeWebRequest request) {
        SessionInvalidException problem = new SessionInvalidException();
        return create(
                problem,
                request,
                HeaderUtil.createFailureAlert(applicationName, false, problem.getEntityName(), problem.getErrorKey(), problem.getMessage())
        );
    }

}
