package tech.djnd.sample.app.repository;

import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import tech.djnd.sample.app.domain.User;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import jakarta.persistence.LockModeType;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {
    String USERS_BY_EMAIL_CACHE = "usersByEmail";
    @Modifying
    @Query(value = "update User u set u.sessionId = :sessionId where u.id = :userId")
    int updateSessionIdById(@Param("userId") Long userId, @Param("sessionId") String sessionId);

    /*
     * Email must be lowed case before call method
     * */
    @EntityGraph(attributePaths = {"authorities"})
    @Cacheable(cacheNames = USERS_BY_EMAIL_CACHE)
    Optional<User> findOneWithAuthoritiesByEmail(String email);

    Optional<User> findOneByEmail(String email);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<User> findOneByActivationKey(String activationKey);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<User> findOneByResetKey(String resetKey);
    Optional<User> findByActivationKey(String activationKey);

    List<User> findAllByActivatedIsFalseAndActivationKeyNotNullAndLastModifiedDateBefore(Instant lastModifiedDateBefore);

    @Query(value = "delete from User u where u.id in :userIds")
    @Modifying
    void deleteByIdIn(@Param("userIds") List<Long>userIds);

    @Query(value = "update User u set u.refreshToken = :newRefreshToken where u.id = :userId")
    @Modifying
    int updatedRefreshTokenById(@Param("userId") Long userId, @Param("newRefreshToken") String newRefreshToken);


    List<User> findByIdIn(List<Long> userIds);

    List<User> findByEmailIn(List<String> emails);

}
