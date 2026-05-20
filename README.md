# Apple Dev Containers

This repo contains a [Dockerfile](./Dockerfile) for building an image for general purpose development in isolated containers. The motivation is to protect my system and private information from supply chain attacks and rogue AI agents without compromising dev UX.

## Security

Typical container runtimes are generally *NOT A SECURE FORM OF ISOLATION*. For example, Docker runs its daemon as root which means a container escape is equivalent to a malicious actor having root access on your host system. Rootless setups, like Podman, are better in this regard but still use the host kernel and share a socket across containers. This repo, however, is specifically setup to work with Apple's [container](https://github.com/apple/container) framework. Apple's containers are more secure than standard containers because each container is backed by a separated microVM. This means there is hardware-level isolation between every container and the host.

### Additional Layers of Security

#### Enclave SSH Agent

To enable working with git remotes in containers I pass my ssh-agent through to the container via the `--ssh` flag. To secure my SSH keys I use [secritive](https://github.com/maxgoedjen/secretive) which enables SSH key signing without the key ever leaving the secure enclave. All of my secretive keys require biometrics, meaning an agent cannot sign a commit or push changes without me explicitly giving it approval via Touch ID.

#### Mise Lockfile and Minimum Release Age

To install developer tooling in the container, I use [mise](https://mise.jdx.dev/) with a [lock file](https://mise.jdx.dev/dev-tools/mise-lock.html) and a 7 day [minimum release age](https://mise.jdx.dev/tips-and-tricks.html#minimum-release-age) to protect against supply-chain attacks.

## How It Works

The image defined in [Dockerfile](./Dockerfile) pulls in various configuration files such as my [.zshrc](https://github.com/joe-p/dotfiles/blob/master/.zshrc) and [neovim config](https://github.com/joe-p/neovim-config). For tool installation (i.e. uv, npm, ripgrep, etc.) [mise](https://mise.jdx.dev/) is used. The docker image uses my [mise config](https://github.com/joe-p/dotfiles/blob/master/.config/mise/config.toml) and [mise lock file](https://github.com/joe-p/dotfiles/blob/master/.config/mise/mise.lock) to quickly and securely install all of my preferred developer tools. mise's [minimum release age](https://mise.jdx.dev/tips-and-tricks.html#minimum-release-age) also helps mitigate against supply-chain attacks.

The container is expected to be called with three environment variables

| Variable      | Purpose                                                                                               |
| ------------- | ----------------------------------------------------------------------------------------------------- |
| REPO_URL      | The URL of the repo that will be cloned in the container by [entrypoint.sh](./entrypoint.sh).         |
| REPO_NAME     | The name to use for the directory of the cloned repo in the container                                 |
| FORWARD_PORTS | Comma-separated list of ports for host services that should be forwarded on the container `localhost` |

### Convenience Script

To simplify usage, [run_dev_container.sh](./run_dev_container.sh) takes the above variables as arguments and handles creating, starting, and stopping the container. It is important to automatically stop containers because [freed container memory is not returned to the host OS](https://github.com/apple/container/blob/main/docs/technical-overview.md#releasing-container-memory-to-macos).

## Downsides

### Memory Management

Apple containers support memory growth but never relinquish allocated container memory to the host. This means if a container spikes to high memory usage during a short workload the host memory usage will stay at the containers peak until it is stopped. This puts a practical limit to the amount of containers that can be ran in parallel before restarting containers.

### Disk Overhead

Every container will use the same general-purpose image which is currently about 5GB. This is then multiplied by the total amount of containers created on the host. This could be mitigated by making language-specific containers (for example, clang alone takes up ~1GB), but for now 5GB is considered acceptable.

## Alternatives

### Kata

[Kata Containers](https://github.com/kata-containers/kata-containers/) is a container runtime that uses VMs for each container, offering a similar security model to Apple's containers. It defaults to QEMU, but also supports microVMs such as [firecracker](https://github.com/firecracker-microvm/firecracker) or [Cloud Hypervisor](https://github.com/cloud-hypervisor/cloud-hypervisor) to offer a better UX and smaller attack surface.

I have briefly explored using Kata via nested virtualization with Cloud Hypervisor, but ran into some AARCH64-specific quirks. I think Kata can be used for a similar experience on Linux systems, but more time would need to be spent on developing the exact workflow.

### gVisor

Typically container runtimes work by providing application-level isolation while using the host's kernel to handle namespacing and system calls. This means a container escape results in access to the host kernel. [gVisor](https://gvisor.dev/) replaces the usage of the host's kernel with a go-implemented kernel that runs in userspace. This protects the host kernel from rogue containers but is still a common attack surface across containers.

### Virtual Machines

Regular VMs offer similar benefits to this workflow with the expense of developer UX. VMs tend to be slower and don't have the same image-building UX as containers. That being said, Lima offers a fairly good experience for managing VMs and offer some [features specifically designed for sandboxed development](https://lima-vm.io/docs/examples/ai/).

A compromise could be made with VMs that uses a single VM to run a container runtime for all containers. The downsides of this approach is that a compromised container can compromise all other containers in the VM.

### Sandboxing Tools

There are various userspace sandboxing tools such as Anthropic's [sandbox runtime](https://github.com/anthropic-experimental/sandbox-runtime) or [nono](https://github.com/always-further/nono). These tools are convenient because they allow you to sandbox specific application on the host OS without any VMs or containers. The downside is that they use primitives that can be very hard to properly configure. This can lead to security bugs or UX friction points. One small hole in the configuration can leave the entire host OS exposed. It is also typically hard to truly sandbox application and have them work as expected. For example, two codebases might use tools that require read/write access to `~/.cache` (i.e. `uv`) which means code bases that should otherwise be isolated now have a common point of communication for malicious actors.

## Future Work

- Use named volumes to for `/git` so it's easier to migrate to newer images
- Add a reverse proxy that can do credential injection for AI inference providers so it's easier to safely use API keys in containers
- Investigate the options for further networking isolation
