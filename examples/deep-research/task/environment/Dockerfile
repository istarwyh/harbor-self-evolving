FROM redis@sha256:8b81dd37ff027bec4e516d41acfbe9fe2460070dc6d4a4570a2ac5b9d59df065

RUN apk add --no-cache \
      bash \
      ca-certificates \
      coreutils \
      curl \
      nodejs \
      npm \
      py3-pip \
      py3-virtualenv \
      python3 \
    && python3 -m venv /opt/harbor-acp-venv \
    && /opt/harbor-acp-venv/bin/pip install --no-cache-dir agent-client-protocol

WORKDIR /app
