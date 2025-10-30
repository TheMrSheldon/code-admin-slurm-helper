FROM ubuntu:latest
# FROM node:23

# Install basic development tools
RUN <<EOF
apt-get update
apt install -y less man-db sudo

# Install Node
apt-get install -y nodejs npm
EOF

# Ensure default `node` user has access to `sudo`
# ARG USERNAME=ubuntu
ARG USERNAME=ubuntu
RUN echo $USERNAME ALL=\(root\) NOPASSWD:ALL > /etc/sudoers.d/$USERNAME \
    && chmod 0440 /etc/sudoers.d/$USERNAME

# Set `DEVCONTAINER` environment variable to help with orientation
ENV DEVCONTAINER=true