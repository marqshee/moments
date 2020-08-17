# newness-takehome-moments
Take home assignment. Due: 8/17/2020

### Moments
Livestreaming is a great way for creators to engage with their viewers, but the long-form content is not always ideal for viewers to consume after the stream ends. Creators want to share the delightful moments that happen in a livestream with their fans. To aid them, we are building a new product called Moments as a novel and catchier way for creators to generate hype for their upcoming livestream by cross-promoting to their other social platforms. Each moment is a short segment of the live stream video, clipped by our creators and their moderator team.

### 'createMoment' API
The 'createMoment' API is an AWS service that will:
 *  processes m3u8 file based on quality
 *  creates a new mp4 file based on the start and end times using ffmpeg
 *  uploads the moment to a S3 bucket named newness-takehome-moments

### AWS Service Architecture
The 'createMoment' APIs is built using AWS Lambda Integration which is a FAAS product. Lambda is an on demand service that allows for us to quickly prototype and or handle manipulation of data without having to worry about long term maintenance of a fleet service like EC2. In this case, 'createMoment' pulls from S3, parses a playlist for duration, pulls relevant files from S3 and uses FFMPEG to process the individual files into a MP4 which is then stored back into S3. There is no need to remember state for this particular API and because of this Lambda provides the perfect environment. Because they are stateless, AWS can execute the function easily on an open agent in the fleet. This allows the API to scale up with usage easily. 

Lambda is pay as you go usage, where as EC2 is per hour. Depending on how much CPU is needed and or if state is required for video processing an auto scaling EC2 fleet may be better choice in the future.

This current version of 'createMoment' API is using the traditional Lambda Integration vs Lambada Proxy Integration. While the newer Lambda Proxy Integration is optimized for AWS services, the traditional Lambda Integration allows for more customizable payloads and less coupling to the AWS system if we needed to migrate to another system in the future.

The API is currently using an FFMPEG and m3u8-parser layer to allow the NodeJS environment access to helper modules which allow us to create a moment from an existing VOD based on user desired start and end times. The FFMPEG layer allows us to convert the .ts files into a playable mp4.

The AWS API Gatway is the entry point to accessing the 'createMoment' Lambada function. Since we are using the traditional Lambda Integration, the API Gateway does require additional setup of integration responses between the gateway and Lambda.

## How to use via Postman
 * Download [Postman](https://www.postman.com)
 * POST to the [API url](https://e9hvdq2xpa.execute-api.us-west-2.amazonaws.com/default/createMoment)
 * In the Request Body:
 ```
 {
  "id": "081957680644",
  "s3_bucket": "newness-takehome-livestream",
  "s3_key_prefix": "081957680644/W2qj91sl5VDK/2020-08-03T16-21-25.146Z/EyEKX6dRDP81",
  "resolution": "720p60",
  "start_time": 60,
  "end_time": 120
}
```
 * Please note, the 'createMoment' API requires an API key and since it is in staging AWS credentials. Log into AWS console, and view the 'createMoment' API in the AWS API Gateway (us-west-2).
 * Send the request.
 * On success you'll see:
 ```
 {
    "statusCode": 200,
    "body": "Moment Created!"
}
```

### Addendum
 * I looked up the command ffmpeg is currently using and am aware there are a few seconds of black screen time at the beginning of the moment. I believe it's an issue with the frame it's starting on and would possibly need to be re-encoded.