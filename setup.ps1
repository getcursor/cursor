Invoke-WebRequest -Uri https://cursor-github.s3.us-west-1.amazonaws.com/resources.zip -o ./resources.zip
Invoke-WebRequest -Uri https://cursor-github.s3.us-west-1.amazonaws.com/lsp.zip -o ./lsp.zip

Expand-Archive -Path ./resources.zip -DestinationPath ./
Expand-Archive -Path ./lsp.zip -DestinationPath ./

Remove-Item -Path ./resources.zip
Remove-Item -Path ./lsp.zip
