package tech.djnd.sample.app.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import tech.djnd.sample.app.domain.Major;

import java.util.Optional;

@Repository
public interface MajorRepository extends JpaRepository<Major, Integer>, JpaSpecificationExecutor<Major> {

    /**
     * Tìm Major theo code (ví dụ: "CHN", "SE", "AI").
     * Dùng khi parse majorCode từ originalMajor trong file Excel.
     */
    Optional<Major> findByCode(String code);

    /**
     * Kiểm tra major có tồn tại với code đã cho không.
     * Dùng nhanh hơn findByCode nếu chỉ cần validate.
     */
    boolean existsByCode(String code);

    boolean existsByCodeIgnoreCase(String code);

    boolean existsByNameIgnoreCase(String name);

    boolean existsByCodeIgnoreCaseAndIdNot(String code, Integer id);

    boolean existsByNameIgnoreCaseAndIdNot(String name, Integer id);

    @Query("SELECT COUNT(s) > 0 FROM Student s WHERE s.majorId = :majorId")
    boolean hasStudents(@Param("majorId") Integer majorId);

    @Query("SELECT COUNT(mt) > 0 FROM MajorTerm mt WHERE mt.majorId = :majorId")
    boolean hasMajorTerms(@Param("majorId") Integer majorId);
}
