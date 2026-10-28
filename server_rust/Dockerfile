# Build stage
FROM rust:1.85-slim as builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

# Copy manifest files to cache dependencies
COPY Cargo.toml Cargo.lock ./

# Create dummy source for caching dependency build
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release && rm -rf src

# Copy real source code
COPY src ./src

# Build release binary
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

WORKDIR /app

# Install SSL certificates and runtime libraries
RUN apt-get update && apt-get install -y ca-certificates curl libssl3 && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -g 1000 appuser && useradd -u 1000 -g appuser -s /bin/sh appuser

# Copy binary from builder
COPY --from=builder /app/target/release/server_rust /app/server_rust

# Setup permissions
RUN chown -R appuser:appuser /app
USER appuser

ENV SERVER_PORT=8080
ENV SERVER_HOST=0.0.0.0
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/management/health || exit 1

ENTRYPOINT ["/app/server_rust"]
