# aks-nsg-ingress-ban-ip
Container: Ban malicious IP addresses in Azure NSG by AKS ingress logs.

Current limitation: Only NGINX Ingress controller log format is parsed (but feel free to extend the `eh-logs.js`).

NSG aka Network Security Group aka Firewall ;-)

This is a ready-to-use implementation using the 
[azure-nsg-ban-ips NPM package](https://www.npmjs.com/package/azure-nsg-ban-ips).

- The container subscribes to EventHub to read out the NGINX Ingress logs
- Malicious IPs are identified by lot of errors, caused by attacks they try
- These IPs are banned for some days in the firewall of the Kubernetes (aka NSG)

IMPORTANT: Project status is still EXPERIMENTAL!
 
# Who will be baned?

The Container/Pod will listen for NginX Ingress Controller access logs (or any similar format logs). Attackers try lot of things in a short time (scripted) to find backdoors, misconfigurations or security holes.

Attackers IP addresses are banned 
1. if they do more HTTP errors in a short time*
   - errors: status code > 399
   - default ERROR_THRESHOLD setting is 50
2. if they try to access URL paths containing NOGO_REQUESTS
   - default NOGO_REQUESTS pattern list is:
     "phpmyadmin,etc/passwd,wp-file-manager,phpunit" (feel free to extend them)
   - default NOGOS_THRESHOLD is 3 (# requests before banned) 

Blocking rules are created near realtime, if these rules are violated.

*) "Short time" means: Every minute the violation counter will be decreased by one. 
(attacker scripts do hundreds of attacks in seconds.)

# Set Up

... it's easier than it may look ;-)

If you don't have a Linux with a Bash, I recommend to use the 
Azure Cloud shell in your Browser: Click icon in Azure Portal top menu bar.

## Stream App Insights NGINGX logs to an Event Hub 
(... and other container logs, too)
 
You need to create an EventHub and configure your LogAnalytics to
stream the container logs there.

Just change the resource names to fit yours:
```sh
#!/bin/bash
# resource names:
export LOG_WORKSPACE_RESOURCE_GRP="my-group"
export LOG_WORKSPACE="my-log-analytics"
export EH_RESOURCE_GRP="my-group" # may be the same as above, you decide
export EVENT_HUB_NAMESPACE="my-log-eventhub-ns"
export LOGS_EVENT_HUB="my-container-logs"
export LOCATION="West Europe"
```

Login to Azure with `az login` and then
set up everything, just by running the following commands:


```sh
#!/bin/bash
# create resource group 
az group create --name "$EH_RESOURCE_GRP" --location "$LOCATION" 

# Event Hub Namespace (check if you perhaps need sku= Standard)
az eventhubs namespace create \
  --name "$EVENT_HUB_NAMESPACE" \
  --resource-group "$EH_RESOURCE_GRP" \
  --location "$LOCATION" \
  --capacity 1  \
  --enable-auto-inflate true \
  --enable-trusted-service-access true \
  --maximum-throughput-units 4 \
  --sku Basic

# create Event Hub in Namespace
az eventhubs eventhub create \
  --name "$LOGS_EVENT_HUB" \
  --namespace-name "$EVENT_HUB_NAMESPACE" \
  --resource-group  "$EH_RESOURCE_GRP"

# extract Event Hub ID
LOG_EH_ID=$(az eventhubs eventhub show --name $LOGS_EVENT_HUB --namespace-name "$EVENT_HUB_NAMESPACE" -g "$EH_RESOURCE_GRP" --query id -o tsv)

az eventhubs eventhub authorization-rule create \
  --eventhub-name $LOGS_EVENT_HUB \
  --name "aks-nsg-ingress-ban-ip" \
  --namespace-name "$EVENT_HUB_NAMESPACE" \
  --resource-group "$EH_RESOURCE_GRP" \
  --rights Listen

export EH_KEY=$(az eventhubs eventhub authorization-rule keys list --resource-group "$EH_RESOURCE_GRP" --namespace-name "$EVENT_HUB_NAMESPACE" --eventhub-name  "$LOGS_EVENT_HUB" --name "aks-nsg-ingress-ban-ip" --query primaryKey -o tsv)

# configure log analytics to stream container logs to Event Hub
az monitor log-analytics workspace data-export create \
  --name "eos-dev-export-containerlogs" \
  --workspace-name "$LOG_WORKSPACE" \
  --resource-group "$EH_RESOURCE_GRP" \
  --tables ContainerLog --destination "$LOG_EH_ID"

echo "Event Hub Key: $EH_KEY"
```

You need the key in the container configuration...

## Configure and Start "aks-nsg-ingress-ban-ip" Container in AKS

To run the container you need these configuration items:
1. `AAD_ID` = the ID of your Azure Active Directory (where we need to login)
2. `SP_ID` = a Service Principal ID, so a technical account you need to
    prepare in AAD, see 
    [how to create a SP](https://docs.microsoft.com/en-us/azure/active-directory/develop/howto-create-service-principal-portal)
3. `SP_KEY` = the secret key for the Service Principal
4. `NSG` = name of the Network Security Group (aka Firewall) which need 
   to be configured. For an AKS this lives in the [Node Resource Group](https://docs.microsoft.com/en-us/azure/aks/faq#why-are-two-resource-groups-created-with-aks).
5. `NSG_RG` = Resource group where the Network Security Group is in
6. `NSG_SUB_ID` = Subscription where the Resource Group lives
7. the `EH*` values are set using the environment variables from 
   the prior setup part

Log on to your AKS cluster and create a Kubernetes secret for the six configs above:

```sh
kubectl create secret "aks-nsg-ingress-ban-ip-secrets" \
  --from-literal=AAD_ID="YOUR_AAD_ID" \
  --from-literal=SP_ID="YOUR_SP_ID" \
  --from-literal=SP_KEY="YOUR_SP_KEY" \
  --from-literal=NSG="YOUR_NSG_NAME" \
  --from-literal=NSG_RG="YOUR_NSG_RESOURCE_GRP" \
  --from-literal=NSG_SUB_ID="YOUR_NSG_SUBSCRIPTION_ID" \
  --from-literal=EH_NS="$EVENT_HUB_NAMESPACE" \
  --from-literal=EH_NAME="$LOGS_EVENT_HUB" \
  --from-literal=EH_KEY_NAME="aks-nsg-ingress-ban-ip" \
  --from-literal=EH_KEY="$EH_KEY" \
  -n "your-namespace"
```
(replace all "YOUR..." by the real values of course)

Have a look at [run-kubernetes-pod.yaml](run-kubernetes-pod.yaml). 
This only needs one change: In the Minion Ingress change this `host: YOUR_DOMAIN` config. 
(If you don't have a [Mergeable Ingress with Master/Minion enabled controller](https://github.com/nginxinc/kubernetes-ingress/tree/master/examples/mergeable-ingress-types), you can ignore or delete these section)
Done that you are ready to run the pod. 

To start the `ks-nsg-ingress-ban-ip` pod simply run
```sh
kubectl apply run-kubernetes-pod.yaml -n "your-namespace"
```

Check the logs: It should print out something about starting, login ... and if you find:
```sh 
kubectl logs aks-nsg-ingress-ban-ip -n "your-namespace"
...
... EH: Ready ...
```
Yej :-), everything went well and the pod is waiting for NGINX ingress logs now.

Not much logs are printed out in `LOG_LEVEL: info` after startup. 
Only `"Bann IP address: ..."` will be logged. 

Some other insights and metrics are available on the health web endpoint:
http://localhst:8080/aks-nsg-ingress-ban-ip/healthz

To see all the activities, you can change the `LOG_LEVEL` to `debug` in the Pod config.

# NSG Rule Details 

Blacklist security rules use "prio" of 1000...10365 (1000 + day)

## Whitelisting IPs Manually

If you need to set up whitelist rules, you should use a prio with e.g. 200 to avoid conflicts.