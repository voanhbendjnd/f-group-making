package tech.djnd.sample.app.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import tech.djnd.sample.app.domain.Rule;

import java.util.List;

public interface RuleRepository extends JpaRepository<Rule, Integer> {
    List<Rule> findBySchoolClassId(Integer schoolClassId);
}
