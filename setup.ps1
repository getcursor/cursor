Invoke-WebRequest -Uri https://cursor.so/resources.zip -o ./resources.zip
Invoke-WebRequest -Uri https://cursor.so/lsp.zip -o ./lsp.zip

Expand-Archive -Path ./resources.zip -DestinationPath ./resources
Expand-Archive -Path ./lsp.zip -DestinationPath ./lsp

Remove-Item -Path ./resources.zip
Remove-Item -Path ./lsp.zip
