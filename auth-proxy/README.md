# Auth Proxy

HTTP reverse proxy for credential injection. Configured via `config.toml`.

## Example Config

```toml
# Auth proxy configuration
# Keyring service name (constant for all entries)
keyring_service_name = "my-auth-proxy"

# Port to run the proxy on
port = 7777

[services.brave]
host = "api.search.brave.com"
keys = ["pi"]
headers = { X-Subscription-Token = "$SECRET" }

[services.openrouter]
host = "openrouter.ai"
keys = ["pi", "opencode"]
# no headers table defaults to setting Authorization: Bearer $SECRET

```

~/.pi/agent/models.json:

```json
{
  "providers": {
    "openrouter": {
      "baseUrl": "http://192.168.64.1:7777/openrouter/pi/api/v1"
    }
  }
}
```
