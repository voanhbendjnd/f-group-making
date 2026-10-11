package tech.djnd.sample.app.repository;

import jakarta.persistence.EntityManager;
import jakarta.persistence.criteria.*;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.query.QueryUtils;
import org.springframework.stereotype.Repository;
import tech.djnd.sample.app.domain.Lecturer;
import tech.djnd.sample.app.domain.User;
import tech.djnd.sample.app.service.projection.LecturerRow;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

@Repository
public class LecturerQueryRepository {

    private final EntityManager entityManager;

    public LecturerQueryRepository(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    public Page<LecturerRow> search(Specification<Lecturer> spec, Pageable pageable) {
        CriteriaBuilder cb = entityManager.getCriteriaBuilder();

        // ---- data query ----
        CriteriaQuery<LecturerRow> cq = cb.createQuery(LecturerRow.class);
        Root<Lecturer> root = cq.from(Lecturer.class);
        Root<User> user = cq.from(User.class);
        Predicate lecturerUserCondition = cb.equal(root.get("userId"), user.get("id"));

        Predicate predicate = spec.toPredicate(root, cq, cb);
        if (predicate != null) {
            cq.where(cb.and(lecturerUserCondition, predicate));
        } else {
            cq.where(lecturerUserCondition);
        }

        cq.select(cb.construct(LecturerRow.class,
                root.get("userId"),
                root.get("code"),
                user.get("name"),
                user.get("email"),
                user.get("activated"),
                user.get("activationKey"),
                user.get("activationKeyExpiresAt"),
                user.get("createdDate"),
                user.get("lastModifiedDate")));

        if (pageable.getSort().isSorted()) {
            List<Order> orders = new ArrayList<>();
            Set<String> userProperties = Set.of("createdDate", "lastModifiedDate", "email", "name", "activated");
            for (Sort.Order order : pageable.getSort()) {
                orders.addAll(QueryUtils.toOrders(Sort.by(order),
                        userProperties.contains(order.getProperty()) ? user : root, cb));
            }
            cq.orderBy(orders);
        }

        List<LecturerRow> content = entityManager.createQuery(cq)
                .setFirstResult((int) pageable.getOffset())
                .setMaxResults(pageable.getPageSize())
                .getResultList();

        // ---- count query ----
        CriteriaQuery<Long> countQuery = cb.createQuery(Long.class);
        Root<Lecturer> countRoot = countQuery.from(Lecturer.class);
        countQuery.select(cb.count(countRoot));
        Predicate countPredicate = spec.toPredicate(countRoot, countQuery, cb);
        if (countPredicate != null) {
            countQuery.where(countPredicate);
        }

        long total = entityManager.createQuery(countQuery).getSingleResult();

        return new PageImpl<>(content, pageable, total);
    }
}
