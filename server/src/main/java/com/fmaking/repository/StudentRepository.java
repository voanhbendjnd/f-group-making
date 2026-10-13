package com.fmaking.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import com.fmaking.domain.Student;
import com.fmaking.service.projection.StudentRow;

import java.util.List;
import java.util.Optional;

@Repository
public interface StudentRepository extends JpaRepository<Student, Long>, JpaSpecificationExecutor<Student> {
    long countBySchoolClassId(Integer schoolClassId);

    @Query("SELECT COUNT(DISTINCT s.majorId) FROM Student s WHERE s.schoolClassId = :classId")
    long countDistinctMajorsBySchoolClassId(@Param("classId") Integer classId);

    @Query("SELECT COUNT(s) FROM Student s JOIN Major m ON s.majorId = m.id "
            + "WHERE s.schoolClassId = :classId AND UPPER(TRIM(m.code)) = UPPER(:majorCode)")
    long countBySchoolClassIdAndMajorCode(@Param("classId") Integer classId, @Param("majorCode") String majorCode);
    List<Student> findByRollNumberIn(List<String> rollNumbers);

    List<Student> findByRollNumberIgnoreCaseIn(List<String> rollNumbers);

    List<Student> findByMemberCodeIgnoreCaseIn(List<String> memberCodes);


    @Query(value = """
        select new com.fmaking.service.projection.StudentRow(
            s.userId, s.rollNumber, s.fullName, u.email, s.memberCode, s.majorId, m.code, m.name,
            u.activated, u.activationKey, u.activationKeyExpiresAt, u.createdDate, u.lastModifiedDate
        )
        from Student s
        join User u on s.userId = u.id
        left join Major m on s.majorId = m.id
        where s.userId = :userId
    """)
    Optional<StudentRow> findStudentProjectionById(@Param("userId") Long userId);

    @Query(value = """
        select new com.fmaking.service.projection.StudentRow(
            s.userId, s.rollNumber, s.fullName, u.email, s.memberCode, s.majorId, m.code, m.name,
            u.activated, u.activationKey, u.activationKeyExpiresAt, u.createdDate, u.lastModifiedDate
        )
        from Student s
        join User u on s.userId = u.id
        left join Major m on s.majorId = m.id
        where s.schoolClassId = :classId
        order by s.rollNumber asc
    """)
    List<StudentRow> findStudentsBySchoolClassId(@Param("classId") Integer classId);
}
