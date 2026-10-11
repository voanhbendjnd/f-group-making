package tech.djnd.sample.app.repository;

import jakarta.persistence.EntityManager;
import jakarta.persistence.criteria.*;
import org.hibernate.query.criteria.JpaEntityJoin;
import org.hibernate.query.criteria.JpaRoot;
import org.hibernate.query.sqm.tree.SqmJoinType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.query.QueryUtils;
import org.springframework.stereotype.Repository;
import tech.djnd.sample.app.domain.Student;
import tech.djnd.sample.app.domain.User;
import tech.djnd.sample.app.domain.Major;
import tech.djnd.sample.app.service.projection.StudentRow;

import java.util.List;
import java.util.ArrayList;
import java.util.Set;

@Repository
public class StudentQueryRepository {

    private final EntityManager entityManager;

    public StudentQueryRepository(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    public Page<StudentRow> search(Specification<Student> spec, Pageable pageable) {
        CriteriaBuilder cb = entityManager.getCriteriaBuilder();

        // ---- data query ----
        CriteriaQuery<StudentRow> cq = cb.createQuery(StudentRow.class);
        Root<Student> root = cq.from(Student.class);
        // Join the entity explicitly by ID; Student has no association mapping.
        JpaEntityJoin<Major> major = ((JpaRoot<Student>) root).join(Major.class, SqmJoinType.LEFT);
        major.on(cb.equal(root.get("majorId"), major.get("id")));
        Root<User> user = cq.from(User.class);
        Predicate studentUserCondition = cb.equal(root.get("userId"), user.get("id"));
//        Join<Student, User> user = root.join("user", JoinType.LEFT);
        Predicate predicate = spec.toPredicate(root, cq, cb);
        if(predicate!=null){
            cq.where(
                    cb.and(
                            studentUserCondition,
                            predicate
                    )
            );
        }
        else{
            cq.where(studentUserCondition);
        }
        cq.select(cb.construct(StudentRow.class,
                root.get("userId"),
                root.get("rollNumber"),
                root.get("fullName"),
                user.get("email"),
                root.get("memberCode"),
                root.get("majorId"),
                major.get("code"),
                major.get("name"),
                user.get("activated"),
                user.get("activationKey"),
                user.get("activationKeyExpiresAt"),
                user.get("createdDate"),
                user.get("lastModifiedDate")));

//        Predicate predicate = spec.toPredicate(root, cq, cb);
//        if (predicate != null) cq.where(predicate);

        if (pageable.getSort().isSorted()) {
            List<Order> orders = new ArrayList<>();
            Set<String> userProperties = Set.of("createdDate", "lastModifiedDate", "email", "activated");
            for (Sort.Order order : pageable.getSort()) {
                orders.addAll(QueryUtils.toOrders(Sort.by(order),
                        userProperties.contains(order.getProperty()) ? user : root, cb));
            }
            cq.orderBy(orders);
        }

        List<StudentRow> content = entityManager.createQuery(cq)
                .setFirstResult((int) pageable.getOffset())
                .setMaxResults(pageable.getPageSize())
                .getResultList();

        // ---- count query ----
        CriteriaQuery<Long> countQuery = cb.createQuery(Long.class);
        Root<Student> countRoot = countQuery.from(Student.class);
        countQuery.select(cb.count(countRoot));
        Predicate countPredicate = spec.toPredicate(countRoot, countQuery, cb);
        if (countPredicate != null) countQuery.where(countPredicate);

        long total = entityManager.createQuery(countQuery).getSingleResult();

        return new PageImpl<>(content, pageable, total);
    }
}
