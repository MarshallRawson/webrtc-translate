#!/usr/bin/bash
mkdir -p keys
openssl req -newkey rsa:2048 -new -nodes -x509 -days 3650 -keyout keys/key.pem -out keys/cert.pem
