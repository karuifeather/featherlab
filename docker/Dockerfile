FROM debian:bookworm-slim
ARG TARGETARCH
ARG KUBECTL_VERSION=v1.37.1
ENV DEBIAN_FRONTEND=noninteractive TERM=xterm-256color
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash ca-certificates curl vim nano jq less git iproute2 iputils-ping dnsutils procps \
    tar gzip coreutils findutils && rm -rf /var/lib/apt/lists/*
RUN set -eux; \
    curl -fsSL "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${TARGETARCH}/kubectl" -o /usr/local/bin/kubectl; \
    curl -fsSL "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${TARGETARCH}/kubectl.sha256" -o /tmp/kubectl.sha256; \
    echo "$(cat /tmp/kubectl.sha256)  /usr/local/bin/kubectl" | sha256sum --check; \
    chmod 0755 /usr/local/bin/kubectl; \
    rm /tmp/kubectl.sha256
RUN useradd -m -u 1000 -s /bin/bash learner && mkdir -p /home/learner/.kube && chown -R learner:learner /home/learner
USER learner
WORKDIR /home/learner
CMD ["sleep", "infinity"]
