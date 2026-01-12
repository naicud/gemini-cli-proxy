# Gemini CLI Proxy Server - Docker Deployment

FROM node:20-slim AS builder

WORKDIR /build

# Copy root workspace files
COPY package.json package-lock.json tsconfig.json ./
COPY scripts scripts/

# Copy packages
COPY packages/core packages/core
COPY packages/test-utils packages/test-utils
COPY packages/proxy-server packages/proxy-server

# Install all deps (including devDeps for build)
RUN npm ci --ignore-scripts

# Build packages in order
RUN npm run build --workspace=@google/gemini-cli-core
RUN npm run build --workspace=@google/gemini-cli-proxy-server

# ============================================
# Production image
# ============================================
FROM node:20-slim AS production

LABEL org.opencontainers.image.title="Gemini CLI Proxy Server"
LABEL org.opencontainers.image.description="OpenAI-compatible HTTP SSE proxy for Gemini CLI"
LABEL org.opencontainers.image.source="https://github.com/google-gemini/gemini-cli"

WORKDIR /app

# Create non-root user for security
RUN groupadd -r gemini && useradd -r -g gemini -d /home/gemini -m gemini

# Copy built artifacts from builder
COPY --chown=gemini:gemini --from=builder /build/packages/core/dist packages/core/dist
COPY --chown=gemini:gemini --from=builder /build/packages/core/package.json packages/core/

COPY --chown=gemini:gemini --from=builder /build/packages/proxy-server/dist packages/proxy-server/dist
COPY --chown=gemini:gemini --from=builder /build/packages/proxy-server/package.json packages/proxy-server/

# Copy root package files for workspace resolution
COPY --chown=gemini:gemini --from=builder /build/package.json /build/package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev --workspace=@google/gemini-cli-proxy-server --ignore-scripts \
  && npm cache clean --force

# WORKAROUND: Pack and install core locally to avoid Docker symlink resolution issues
RUN cd packages/core && npm pack && cd ../.. \
  && npm install --omit=dev --no-save packages/core/google-gemini-cli-core-*.tgz --workspace=@google/gemini-cli-proxy-server


# Ensure all files are world-readable and directories are traversable
RUN chmod -R a+rX /app

# Create .gemini directory for OAuth tokens (optional mount point)
RUN mkdir -p /home/gemini/.gemini && chown -R gemini:gemini /home/gemini

# Switch to non-root user
USER gemini


# Environment defaults
ENV NODE_ENV=production
ENV HOME=/home/gemini
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/v1/models').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "packages/proxy-server/dist/server.js"]
