FROM ubuntu:latest

# ENV needed for setup
ENV HOME=/home/dev
ENV MISE_CONFIG_DIR="/home/dev/.config/mise"
ENV MISE_CACHE_DIR="/home/dev/.cache/mise"
ENV MISE_DATA_DIR="/home/dev/.local/share/mise"
ENV MISE_INSTALL_PATH="/usr/local/bin/mise"
ENV PATH="/home/dev/.local/share/mise/shims:$PATH"

# Create the user and group
# NOTE: we chown /home/dev in entrypoint.sh
RUN groupadd --gid 1337 dev && \
    useradd --uid 1337 --gid 1337 -m dev -s /usr/bin/zsh --home-dir /home/dev

WORKDIR /home/dev

COPY dotfiles/dot_config/mise/ /home/dev/.config/mise/
COPY setup-mise.sh setup-mise.sh

# Install the apt packages needed for mise and then install mise
# This allows apt packages to be added in the next RUN without 
# cache busting the mise install
RUN --mount=type=secret,id=GITHUB_TOKEN,env=GITHUB_TOKEN \
    apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates build-essential && \
    rm -rf /var/lib/apt/lists/* && \
    bash setup-mise.sh && rm setup-mise.sh && \
    mise install --verbose && \
    rm -rf /home/dev/.cache

RUN apt-get update && apt-get install -y --no-install-recommends \
	zsh \
	uidmap \ 
	bubblewrap \
	socat \
	libc++-dev \
	libc++abi-dev \
	zlib1g-dev \
	libzstd-dev \
	sudo \
	iproute2 \
	git-all \
	openssh-client\
	gnupg \
	kitty-terminfo \
	libssl-dev \
	pkg-config \
	gosu \
    	&& rm -rf /var/lib/apt/lists/*

# We set known hosts for dev and root because root may need to clone from GH via SSH
COPY ssh_known_hosts /home/dev/.ssh/known_hosts
COPY ssh_known_hosts /root/.ssh/known_hosts

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENV SHELL=/usr/bin/zsh
ENV TERM=xterm-kitty

# Allows a shared config for host and containers to securely change
# behavior depending on whether or not it is running in a container.
# For example, when in a container we can relax sandboxing rules for agents
RUN echo 1 > /run/in_container && chmod 444 /run/in_container

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
