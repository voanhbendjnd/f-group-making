package com.fmaking.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "zalo_shares", uniqueConstraints = @UniqueConstraint(name = "uk_zalo_scope_key", columnNames = "scope_key"),
    indexes = { @Index(name = "idx_zalo_class", columnList = "school_class_id"),
        @Index(name = "idx_zalo_lecturer_term", columnList = "lecturer_id, term_id") })
@Getter
@Setter
public class ZaloShare extends AbstractAuditingEntity<Long> {
    public enum Scope { LECTURER, CLASS }

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "school_class_id")
    private Integer schoolClassId;
    @Column(name = "lecturer_id")
    private Long lecturerId;
    @Column(name = "term_id", nullable = false)
    private Integer termId;
    @Enumerated(EnumType.STRING)
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.VARCHAR)
    @Column(nullable = false, length = 10)
    private Scope scope;
    // One lecturer share per term, or one class share. Never supplied by the client.
    @Column(name = "scope_key", nullable = false, length = 100)
    private String scopeKey;
    @Column(nullable = false, length = 100)
    private String title;
    @Column(name = "invite_url", nullable = false, length = 512)
    private String inviteUrl;
    @Column(length = 500)
    private String description;
    @Column(name = "qr_public_id", length = 255)
    private String qrPublicId;
    @Column(name = "qr_format", length = 10)
    private String qrFormat;
    @Column(name = "qr_bytes")
    private Long qrBytes;
    @Version @Column(nullable = false)
    private Long version = 0L;
}
