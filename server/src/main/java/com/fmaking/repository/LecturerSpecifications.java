package com.fmaking.repository;

import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.Subquery;
import org.springframework.data.jpa.domain.Specification;
import com.fmaking.domain.Lecturer;
import com.fmaking.domain.User;
import com.fmaking.domain.SchoolClass;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

public final class LecturerSpecifications {

    private LecturerSpecifications() {
    }

    public static Specification<Lecturer> withTerm(Integer termId) {
        return (root, query, cb) -> {
            if (termId == null) return cb.conjunction();
            Subquery<Integer> classes = query.subquery(Integer.class);
            Root<SchoolClass> schoolClass = classes.from(SchoolClass.class);
            classes.select(schoolClass.get("id"));
            classes.where(cb.equal(schoolClass.get("termId"), termId),
                    cb.equal(schoolClass.get("lecturerId"), root.get("userId")));
            return cb.exists(classes);
        };
    }

    public static Specification<Lecturer> withFilter(String search, Boolean activated, Boolean hasActivationKey) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();

            if (search != null && !search.isBlank()) {
                String pattern = "%" + search.trim().toLowerCase() + "%";
                List<Predicate> searchPredicates = new ArrayList<>();
                searchPredicates.add(cb.like(cb.lower(root.get("code")), pattern));

                if (query != null) {
                    Subquery<Long> emailSubquery = query.subquery(Long.class);
                    Root<User> emailUserRoot = emailSubquery.from(User.class);
                    emailSubquery.select(emailUserRoot.get("id"));
                    emailSubquery.where(
                            cb.equal(emailUserRoot.get("id"), root.get("userId")),
                            cb.or(
                                    cb.like(cb.lower(emailUserRoot.get("email")), pattern),
                                    cb.like(cb.lower(emailUserRoot.get("name")), pattern)
                            )
                    );
                    searchPredicates.add(cb.exists(emailSubquery));
                }

                predicates.add(cb.or(searchPredicates.toArray(new Predicate[0])));
            }

            if ((activated != null || hasActivationKey != null) && query != null) {
                Subquery<Long> userSubquery = query.subquery(Long.class);
                Root<User> userRoot = userSubquery.from(User.class);
                userSubquery.select(userRoot.get("id"));

                List<Predicate> userPredicates = new ArrayList<>();
                userPredicates.add(cb.equal(userRoot.get("id"), root.get("userId")));

                if (activated != null) {
                    userPredicates.add(cb.equal(userRoot.get("activated"), activated));
                }

                if (hasActivationKey != null) {
                    Instant now = Instant.now();
                    if (hasActivationKey) {
                        userPredicates.add(cb.isNotNull(userRoot.get("activationKey")));
                        userPredicates.add(cb.greaterThan(userRoot.get("activationKeyExpiresAt"), now));
                    } else {
                        userPredicates.add(cb.or(
                                cb.isNull(userRoot.get("activationKey")),
                                cb.lessThanOrEqualTo(userRoot.get("activationKeyExpiresAt"), now)
                        ));
                    }
                }

                userSubquery.where(cb.and(userPredicates.toArray(new Predicate[0])));
                predicates.add(cb.exists(userSubquery));
            }

            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }
}
