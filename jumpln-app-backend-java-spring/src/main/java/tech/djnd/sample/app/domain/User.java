package tech.djnd.sample.app.domain;


import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.Setter;
import lombok.experimental.FieldDefaults;
import org.apache.commons.lang3.StringUtils;
import org.hibernate.annotations.BatchSize;
import org.hibernate.annotations.Cache;
import org.hibernate.annotations.CacheConcurrencyStrategy;
import tech.djnd.sample.app.config.Constants;

import java.io.Serial;
import java.io.Serializable;
import java.time.Instant;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

@Entity
@Table(name = "users")
@Cache(usage = CacheConcurrencyStrategy.NONSTRICT_READ_WRITE)
@Getter
@Setter
@FieldDefaults(level = AccessLevel.PRIVATE)

public class User extends AbstractAuditingEntity <Long> implements Serializable {
    @Serial
    private static final long serialVersionUID = 1L;
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @JsonIgnore
    @Size(max = 255)
    @Column(length = 255, name = "password_hash")
    private String password;
    @Size(max = 50)
    private String name;
    @Email
    @Size(min= 5,max = 254)
    @Column(length = 254, unique = true)
    @NotNull
    private String email;

    @NotNull
    @Column(nullable = false)
    private Boolean activated = false;


    @Size(max = 20)
    @Column(name = "activation_key", length = 20)
    @JsonIgnore
    private String activationKey;

    @Column(name = "activation_key_expires_at")
    @JsonIgnore
    private Instant activationKeyExpiresAt;

    @Size(max = 20)
    @Column(length = 20, name ="reset_key")
    @JsonIgnore
    private String resetKey;

    @Column(name = "reset_date")
    private Instant resetDate = null;

    @Column(name ="session_id")
    private String sessionId;
    @JsonIgnore
    @Column(name = "refresh_token")
    private String refreshToken;
    @JsonIgnore
    @ManyToMany
    @JoinTable(
            name = "user_authority",
            joinColumns = {@JoinColumn(name = "user_id", referencedColumnName = "id")},
            inverseJoinColumns = {@JoinColumn(name = "authority_name", referencedColumnName = "name")}
    )
    @Cache(usage = CacheConcurrencyStrategy.NONSTRICT_READ_WRITE)
    @BatchSize(size = 20)
    private Set<Authority> authorities = new HashSet<>();


    public void setEmail(String email){
        this.email = StringUtils.lowerCase(email, Locale.ENGLISH);
    }
}
