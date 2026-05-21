container run --dns 8.8.8.8 -it --init --ssh -e FORWARD_PORTS=4002,4001 --rm --name dev-test dev:latest /bin/zsh
