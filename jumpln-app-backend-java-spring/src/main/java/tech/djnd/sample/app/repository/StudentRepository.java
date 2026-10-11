package tech.djnd.sample.app.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import tech.djnd.sample.app.domain.Student;
import tech.djnd.sample.app.service.projection.StudentRow;

import java.util.List;
import java.util.Optional;

@Repository
public interface StudentRepository extends JpaRepository<Student, Long>, JpaSpecificationExecutor<Student> {
    List<Student> findByRollNumberIn(List<String> rollNumbers);

    List<Student> findByRollNumberIgnoreCaseIn(List<String> rollNumbers);

    List<Student> findByMemberCodeIgnoreCaseIn(List<String> memberCodes);


    @Query(value = """
        select new tech.djnd.sample.app.service.projection.StudentRow(
            s.userId, s.rollNumber, s.fullName, u.email, s.memberCode, s.majorId, m.code, m.name,
            u.activated, u.activationKey, u.activationKeyExpiresAt, u.createdDate, u.lastModifiedDate
        )
        from Student s
        join User u on s.userId = u.id
        left join Major m on s.majorId = m.id
        where s.userId = :userId
    """)
    Optional<StudentRow> findStudentProjectionById(@Param("userId") Long userId);
}
