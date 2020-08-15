const AWS = require('aws-sdk');
const child = require('child_process');
const file = require('fs');
const m3u8Parser = require('m3u8-parser');
const s3 = new AWS.S3({region: 'us-west-1'});

exports.handler = async (event) => {
  
    const endTime = event.end_time;
    const s3Bucket = event.s3_bucket;
    const s3KeyFullPrefix = `${event.s3_key_prefix}/hls/${event.resolution}`;
    const startTime = event.start_time;

    const s3MomentBucket = 'newness-takehome-moments'; 
    const params = {Bucket: s3Bucket, Key: `${s3KeyFullPrefix}/playlist.m3u8`};
    const response = await s3.getObject(params).promise();
    const playlist = response.Body.toString('utf-8');
    const momentsTsFiles = playlistMomentParser(playlist, startTime, endTime);

    await getMomentTsFilesFromS3(momentsTsFiles, s3Bucket, s3KeyFullPrefix);
    let command = "cat /tmp/*.ts >/tmp/stitch.txt";
    child.execSync(command);
    
    let ffmepgCmd = `ffmpeg -ss ${momentsTsFiles.startOffset} -t ${momentsTsFiles.endOffset} -i /tmp/stitch.txt -acodec copy -vcodec copy /tmp/moment.mp4`;
    child.execSync(ffmepgCmd);
    
    const mp4 = file.readFileSync('/tmp/moment.mp4');
    var date = new Date().toISOString();
    const putParams = {
      Bucket: s3MomentBucket,
      Key: `${s3KeyFullPrefix}/moment-${date}.mp4`, 
      Body: mp4,
    }

    await s3.putObject(putParams).promise();
    child.execSync('rm /tmp/*.ts; rm /tmp/stitch.txt; rm /tmp/moment.mp4');
};

function playlistMomentParser(playlist, startTime, endTime) {
  const parser = new m3u8Parser.Parser();
  let duration = 0;
  let hasMomentStarted = false;
  let hasMomentEnded = false;
  let momentStartingTs = null;
  let momentEndingTs = null;
  let momentsTsFiles = [];
  let startOffset = null;
  let endOffset = null;

  parser.push(playlist);
  parser.end();
  const segments = parser.manifest.segments;

  for (let segment of segments) {
      duration = duration + segment.duration;
      if (duration > startTime && !hasMomentStarted) {
          startOffset = duration - startTime;
          momentStartingTs = segment.uri;
          hasMomentStarted = true;
      }
      if (hasMomentStarted && !hasMomentEnded) {
          momentsTsFiles.push(segment.uri);
      }
      if (duration > endTime && !hasMomentEnded) {
        endOffset = duration - endTime;
        momentEndingTs = segment.uri;
        hasMomentEnded = true;
    }
  }
  return {momentsTsFiles, startOffset, endOffset};
}

function getMomentTsFilesFromS3(momentsTsFiles, s3Bucket, s3KeyFullPrefix) {
    var promises = [];

    for (let tsFile of momentsTsFiles.momentsTsFiles) {
        promises.push( new Promise((resolve, reject) => {
            const destination = `/tmp/${tsFile}`;
            const fileStream = file.createWriteStream(destination);
            const params = {Bucket: s3Bucket, Key: `${s3KeyFullPrefix}/${tsFile}`};
      
            const s3Stream = s3.getObject(params).createReadStream();
            s3Stream.on('error', reject);
            fileStream.on('error', reject);
            fileStream.on('close', () => { resolve(destination);});
            s3Stream.pipe(fileStream);
          }));
    }

    return Promise.all(promises);
}
