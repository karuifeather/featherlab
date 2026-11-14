FROM debian:bookworm-slim
ARG TARGETARCH
ARG KUBECTL_VERSION=v1.37.1
ARG YQ_VERSION=v4.54.3
ARG YQ_SHA256_AMD64=129534601871538efe0ba4c5e62a34fb1d5f469bcb975c4fddeb467d82974973
ARG YQ_SHA256_ARM64=89f69310b61b68d1245065a1241d1fc843f7a36cd6103ffd77ad987613bd1b67
ENV DEBIAN_FRONTEND=noninteractive TERM=xterm-256color
# The exam hosts provide kubectl with the `k` alias and Bash autocompletion, yq, curl, wget,
# and man with man pages; the workstation matches that.
# The slim base image tells dpkg to skip /usr/share/man. That rule is dropped first so the
# packages below install their man pages, then everything is reinstalled so the base
# packages that were unpacked without theirs get them too.
RUN sed -i '\|/usr/share/man|d' /etc/dpkg/dpkg.cfg.d/docker && \
    apt-get update && apt-get install -y --no-install-recommends \
    bash ca-certificates curl wget vim nano jq less git iproute2 iputils-ping dnsutils procps \
    tar gzip coreutils findutils bash-completion man-db manpages && \
    dpkg-query -W -f '${binary:Package}\n' | xargs apt-get install -y --no-install-recommends --reinstall && \
    rm -rf /var/lib/apt/lists/*
RUN set -eux; \
    curl -fsSL "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${TARGETARCH}/kubectl" -o /usr/local/bin/kubectl; \
    curl -fsSL "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${TARGETARCH}/kubectl.sha256" -o /tmp/kubectl.sha256; \
    echo "$(cat /tmp/kubectl.sha256)  /usr/local/bin/kubectl" | sha256sum --check; \
    chmod 0755 /usr/local/bin/kubectl; \
    rm /tmp/kubectl.sha256
# yq is the Go implementation the exam uses (Debian's `yq` package is a different tool).
RUN set -eux; \
    case "${TARGETARCH}" in \
      amd64) yq_sha="${YQ_SHA256_AMD64}" ;; \
      arm64) yq_sha="${YQ_SHA256_ARM64}" ;; \
      *) echo "unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    curl -fsSL "https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/yq_linux_${TARGETARCH}" -o /usr/local/bin/yq; \
    echo "${yq_sha}  /usr/local/bin/yq" | sha256sum --check; \
    chmod 0755 /usr/local/bin/yq
# Completion for kubectl, and for `k`: bash-completion loads a command's file on first use,
# so `k` gets its own file that pulls in kubectl's and reuses its completion function.
RUN set -eux; \
    kubectl completion bash > /usr/share/bash-completion/completions/kubectl; \
    printf '%s\n' '. /usr/share/bash-completion/completions/kubectl' \
      'complete -o default -F __start_kubectl k' > /usr/share/bash-completion/completions/k; \
    yq shell-completion bash > /usr/share/bash-completion/completions/yq
# Learner shell defaults go in /etc, not the home directory: /home/learner is carried over
# on upgrade, so a file there would be replaced by the learner's older copy.
COPY shell.sh /etc/featherlab/shell.sh
RUN chmod 0644 /etc/featherlab/shell.sh && echo '. /etc/featherlab/shell.sh' >> /etc/bash.bashrc
# Welcome banner. /etc/profile.d is read by login shells only: once per terminal tab.
COPY banner.sh /etc/profile.d/featherlab-banner.sh
RUN chmod 0644 /etc/profile.d/featherlab-banner.sh
RUN useradd -m -u 1000 -s /bin/bash learner && mkdir -p /home/learner/.kube && chown -R learner:learner /home/learner
USER learner
WORKDIR /home/learner
CMD ["sleep", "infinity"]
