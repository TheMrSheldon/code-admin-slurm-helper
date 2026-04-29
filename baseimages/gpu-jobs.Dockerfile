FROM pytorch/pytorch:2.8.0-cuda12.9-cudnn9-runtime

RUN apt-get update && apt-get install -y sudo \
 && echo 'ALL ALL=(ALL) NOPASSWD: ALL' >> /etc/sudoers