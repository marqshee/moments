# newness-takehome-moments
Take home assignment.
Due: 8/17/2020

### Publishing a AWS Layer
```
aws lambda publish-layer-version --layer-name my-layer --description "My layer" --license-info "MIT" \
--content S3Bucket=lambda-layers-us-east-2-123456789012,S3Key=layer.zip --compatible-runtimes python3.6 python3.7
```
