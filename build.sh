cd build
cp -R ../app .
VERSION=$(cat app/package.json | jq -r .version)
docker build -t mahade70/aks-nsg-ingress-ban-ip:$VERSION .
docker push mahade70/aks-nsg-ingress-ban-ip:$VERSION
rm -rf app