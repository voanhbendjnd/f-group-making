package tech.djnd.sample.app.repository;

import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.Subquery;
import org.springframework.data.jpa.domain.Specification;
import tech.djnd.sample.app.domain.Student;
import tech.djnd.sample.app.domain.User;
import tech.djnd.sample.app.domain.Major;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

public final class StudentSpecifications {

    private StudentSpecifications() {
    }

    public static Specification<Student> withFilter(
            String search, String majorCode, Boolean activated, Boolean hasActivationKey) {
        return withFilter(search, majorCode, null, activated, hasActivationKey);
    }

    public static Specification<Student> withFilter(
            String search, String majorSearch, Integer majorId, Boolean activated, Boolean hasActivationKey) {

        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();

            if (search != null && !search.isBlank()) {
                String pattern = "%" + search.trim().toLowerCase() + "%";
                List<Predicate> searchPredicates = new ArrayList<>();
                searchPredicates.add(cb.like(cb.lower(root.get("rollNumber")), pattern));
                searchPredicates.add(cb.like(cb.lower(root.get("fullName")), pattern));
                searchPredicates.add(cb.like(cb.lower(root.get("memberCode")), pattern));

                if (query != null) {
                    Subquery<Long> emailSubquery = query.subquery(Long.class);
                    Root<User> emailUserRoot = emailSubquery.from(User.class);
                    emailSubquery.select(emailUserRoot.get("id"));
                    emailSubquery.where(
                            cb.equal(emailUserRoot.get("id"), root.get("userId")),
                            cb.like(cb.lower(emailUserRoot.get("email")), pattern)
                    );
                    searchPredicates.add(cb.exists(emailSubquery));
                }

                predicates.add(cb.or(searchPredicates.toArray(new Predicate[0])));
            }

            if (majorId != null) {
                predicates.add(cb.equal(root.get("majorId"), majorId));
            } else if (majorSearch != null && !majorSearch.isBlank() && query != null) {
                Subquery<Integer> majorSubquery = query.subquery(Integer.class);
                Root<Major> major = majorSubquery.from(Major.class);
                majorSubquery.select(major.get("id"));
                majorSubquery.where(MajorSpecifications.matchingPredicate(major, cb, majorSearch));
                predicates.add(root.get("majorId").in(majorSubquery));
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

