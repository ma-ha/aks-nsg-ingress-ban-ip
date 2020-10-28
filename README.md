# aks-nsg-ingress-ban-ip
Container: Ban malicious IP adresses In Azure NSG by AKS ingress logs

- The container subscribes to EventHub to read out the NGINX Ingress logs
- Malicious IPs are identified by lot of errors, caused by attacks they try
- These IPs are banned for some days in the firewall of the Kubernetes (aka NSG)
  -  Blacklist security rules use "prio" of 1000...10365 (1000 + day)

# Set Up

## Stream NGINGX (and other container logs) to Event Hub 

TODO

## Configure and Start "aks-nsg-ingress-ban-ip" Container

TODO

# Whitelisting IPs Manually

If you need to set up whitelist rules, you should use a prio with e.g. 200 to avoid conflicts.