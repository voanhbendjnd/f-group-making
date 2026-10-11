package tech.djnd.sample.app.repository;

import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import org.springframework.data.jpa.domain.Specification;
import tech.djnd.sample.app.domain.Major;

import java.util.Locale;

public final class MajorSpecifications {
    private MajorSpecifications() {}

    public static Specification<Major> withSearch(String search) {
        return (root, query, cb) -> matchingPredicate(root, cb, search);
    }

    public static Specification<Major> withTemporaryName(Boolean temporaryName) {
        return (root, query, cb) -> {
            if (temporaryName == null) return cb.conjunction();
            Predicate sameName = cb.equal(cb.lower(cb.trim(root.get("name"))),
                    cb.lower(cb.trim(root.get("code"))));
            return temporaryName ? sameName : cb.not(sameName);
        };
    }

    public static Predicate matchingPredicate(Root<Major> root, CriteriaBuilder cb, String search) {
        if (search == null || search.isBlank()) return cb.conjunction();
        String[] words = search.trim().toLowerCase(Locale.ROOT).split("\\s+");
        Predicate[] matches = new Predicate[words.length];
        for (int i = 0; i < words.length; i++) {
            String pattern = "%" + words[i].replace("\\", "\\\\").replace("%", "\\%")
                    .replace("_", "\\_") + "%";
            matches[i] = cb.or(cb.like(cb.lower(root.get("code")), pattern, '\\'),
                    cb.like(cb.lower(root.get("name")), pattern, '\\'));
        }
        return cb.and(matches);
    }
}
