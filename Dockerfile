ARG NODE_IMAGE=node:24-bookworm-slim
FROM ${NODE_IMAGE}

ARG CODE_SERVER_VERSION=4.104.2
ARG LATEX_WORKSHOP_VERSION=10.9.0
ARG TARGETARCH

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    rm -f /etc/apt/apt.conf.d/docker-clean \
    && printf 'Acquire::Retries "5";\nBinary::apt::APT::Keep-Downloaded-Packages "true";\n' > /etc/apt/apt.conf.d/80amadeus-build \
    && apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl git bash tini util-linux \
    texlive-xetex texlive-lang-chinese texlive-latex-extra texlive-pictures \
    latexmk biber fonts-noto-cjk fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*
RUN set -eux; \
    arch="${TARGETARCH:-$(dpkg --print-architecture)}"; \
    case "$arch" in amd64|arm64) ;; *) echo "Unsupported architecture: $arch" >&2; exit 1;; esac; \
    curl -fsSL "https://github.com/coder/code-server/releases/download/v${CODE_SERVER_VERSION}/code-server-${CODE_SERVER_VERSION}-linux-${arch}.tar.gz" -o /tmp/code-server.tar.gz; \
    mkdir -p /opt/code-server; \
    tar -xzf /tmp/code-server.tar.gz --strip-components=1 -C /opt/code-server; \
    ln -s /opt/code-server/bin/code-server /usr/local/bin/code-server; \
    rm /tmp/code-server.tar.gz; \
    curl -fsSL "https://open-vsx.org/api/James-Yu/latex-workshop/${LATEX_WORKSHOP_VERSION}/file/James-Yu.latex-workshop-${LATEX_WORKSHOP_VERSION}.vsix" -o /tmp/latex-workshop.vsix; \
    code-server --user-data-dir /tmp/code-server-install --extensions-dir /opt/amadeus-extensions --install-extension /tmp/latex-workshop.vsix; \
    rm -rf /tmp/latex-workshop.vsix /tmp/code-server-install

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends texlive-bibtex-extra \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --chown=node:node . .
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=cache,target=/var/cache/apt,sharing=locked \
    npm ci && npm run build \
    && node scripts/patch-code-server.mjs /opt/code-server \
    && node scripts/patch-latex-workshop.mjs /opt/amadeus-extensions/james-yu.latex-workshop-${LATEX_WORKSHOP_VERSION} \
    && npm run setup:browsers -- --deps-only \
    && rm -rf /var/lib/apt/lists/* \
    && cp -a packages/editor/extension /opt/amadeus-extensions/amadeus.amadeus-bridge-1.0.0 \
    && chmod -R a+rX /opt/amadeus-extensions \
    && mkdir -p /data/code-server /data/dsh-home /workspace \
    && chown -R node:node /app /data /workspace \
    && sed -i 's/\r$//' /app/deploy/docker-entrypoint.sh \
    && chmod +x /app/deploy/docker-entrypoint.sh

ENV NODE_ENV=production \
    AMADEUS_CONFIG=/config/amadeus.yml \
    AMADEUS_EDITOR_BRIDGE_DIR=/data/editor/bridge \
    XDG_DATA_HOME=/data/share \
    XDG_CONFIG_HOME=/data/config \
    PLAYWRIGHT_BROWSERS_PATH=/data/playwright
USER node
EXPOSE 3080
ENTRYPOINT ["/usr/bin/tini", "-s", "--", "/app/deploy/docker-entrypoint.sh"]
