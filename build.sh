cd build
cp -R ../app .
VERSION=$(cat app/package.json | jq -r .version)
docker build -t aks-nsg-ingress-ban-ip:$VERSION .
rm -rf app