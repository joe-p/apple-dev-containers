#!/bin/bash
set -x

REPO_NAME=$1
REPO_URL=$2
CONTAINER_NAME=$REPO_NAME-dev

sed '/entrypoint.sh DONE/q' <(container run \
    --memory 8G \
    --cpus 4 \
    --dns 9.9.9.9 \
    --init \
    --ssh \
    -e FORWARD_PORTS=4002,4001,8980,7777 \
    -e REPO_NAME=$REPO_NAME \
    -e REPO_URL=$REPO_URL \
    --name $CONTAINER_NAME \
    dev:latest)

container start $CONTAINER_NAME
container exec --user dev -e TERM=xterm-kitty -it -w /home/dev/git/$REPO_NAME $CONTAINER_NAME zsh
container stop $CONTAINER_NAME > /dev/null 2>&1 &

