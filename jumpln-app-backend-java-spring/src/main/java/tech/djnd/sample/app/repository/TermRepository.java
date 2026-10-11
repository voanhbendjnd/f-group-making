package tech.djnd.sample.app.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import tech.djnd.sample.app.domain.Term;

import java.util.Optional;

@Repository
public interface TermRepository extends JpaRepository<Term, Integer> {
    Optional<Term> findByNameIgnoreCase(String name);
    boolean existsByNameIgnoreCase(String name);
}
