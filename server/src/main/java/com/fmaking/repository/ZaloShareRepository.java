package com.fmaking.repository;

import com.fmaking.domain.ZaloShare;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface ZaloShareRepository extends JpaRepository<ZaloShare, Long> {
    List<ZaloShare> findByScopeKeyIn(List<String> scopeKeys);
    Optional<ZaloShare> findByScopeKey(String scopeKey);
}
