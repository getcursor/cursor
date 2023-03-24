#!/bin/bash
wget https://cursor.so/resources.zip
wget https://cursor.so/lsp.zip

unzip resources.zip -d resources/
unzip lsp.zip -d lsp/

rm ./resources.zip
rm ./lsp.zip
